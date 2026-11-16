"use client";

// Operacje masowe na liście: zaznaczanie wierszy i pasek akcji dla zaznaczonych.
// Wiersze renderuje serwer (app/page.tsx); tu żyją tylko pola wyboru i pasek,
// połączone kontekstem React. Zapis robią Server Actions z app/opportunities/actions.ts.
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { PIPELINE_LABELS, type Pipeline, type Stage } from "@/lib/opportunities";
import { bulkChangeStage, bulkDelete, bulkSetNextStepAt, type BulkResult } from "./opportunities/actions";

export type SelectableItem = { id: string; pipeline: Pipeline; open: boolean };

type Selection = {
  items: SelectableItem[];
  selected: Set<string>;
  toggle: (id: string) => void;
  setAll: (on: boolean) => void;
  clear: () => void;
};

const SelectionContext = createContext<Selection | null>(null);

function useSelection() {
  const value = useContext(SelectionContext);
  if (!value) throw new Error("Brak SelectionProvider nad listą");
  return value;
}

// items = widoczne wiersze. Strona daje providerowi key z filtrów, więc zmiana filtra czyści zaznaczenie.
export function SelectionProvider({ items, children }: { items: SelectableItem[]; children: ReactNode }) {
  const [raw, setRaw] = useState<Set<string>>(new Set());
  // Po zapisie lista się odświeża: liczymy tylko zaznaczone wiersze, które nadal są na liście
  const visible = new Set(items.map((i) => i.id));
  const selected = new Set([...raw].filter((id) => visible.has(id)));

  const value: Selection = {
    items,
    selected,
    toggle: (id) =>
      setRaw((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    setAll: (on) => setRaw(on ? new Set(visible) : new Set()),
    clear: () => setRaw(new Set()),
  };
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

const checkboxClass = "mt-1 h-4 w-4 shrink-0 cursor-pointer";

export function RowCheckbox({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      aria-label={`Zaznacz: ${label}`}
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      className={checkboxClass}
    />
  );
}

export function SelectAll() {
  const { items, selected, setAll } = useSelection();
  const all = items.length > 0 && selected.size === items.length;
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
      <input
        type="checkbox"
        checked={all}
        ref={(el) => {
          if (el) el.indeterminate = selected.size > 0 && !all; // "częściowo zaznaczone"
        }}
        onChange={() => setAll(!all)}
        className="h-4 w-4 cursor-pointer"
      />
      Zaznacz wszystkie ({items.length})
    </label>
  );
}

const PIPELINES: Pipeline[] = ["recruitment", "service_sales"];
const controlClass = "rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50";

// Pasek przyklejony do dołu ekranu, widoczny, gdy coś jest zaznaczone (wygodne na telefonie).
export function BulkBar({ stages, today }: { stages: Stage[]; today: string }) {
  const { items, selected, clear } = useSelection();
  const [stageId, setStageId] = useState("");
  const [date, setDate] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = items.filter((i) => selected.has(i.id));
  const ids = chosen.map((i) => i.id);
  const pipelines = PIPELINES.filter((p) => chosen.some((i) => i.pipeline === p));
  const stage = stages.find((s) => s.id === stageId);
  const stageCount = stage ? chosen.filter((i) => i.pipeline === stage.pipeline).length : 0;
  const openCount = chosen.filter((i) => i.open).length;

  function run(action: () => Promise<BulkResult>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setMessage({ error: true, text: result.error });
      setMessage({ error: result.errors.length > 0, text: summary(result) });
      setStageId("");
      setDate("");
      setConfirmDelete(false);
      clear();
    });
  }

  if (chosen.length === 0) {
    return message ? (
      <p className={`text-sm ${message.error ? "text-red-700" : "text-gray-600"}`} role="status">
        {message.text}
      </p>
    ) : null;
  }

  return (
    <div className="sticky bottom-0 z-[5] space-y-2 rounded border border-gray-300 bg-background p-3 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Zaznaczono: {chosen.length}</p>
        <button type="button" onClick={clear} className="text-sm underline">
          Odznacz
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        {/* 1. Zmiana etapu: etapy pogrupowane po ścieżce, bo zaznaczone mogą mieć różne typy */}
        <div className="flex items-center gap-2">
          <select
            aria-label="Nowy etap dla zaznaczonych"
            value={stageId}
            disabled={pending}
            onChange={(e) => setStageId(e.target.value)}
            className={controlClass}
          >
            <option value="">Zmień etap…</option>
            {pipelines.map((p) => (
              <optgroup key={p} label={PIPELINE_LABELS[p]}>
                {stages
                  .filter((s) => s.pipeline === p)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !stage}
            onClick={() => run(() => bulkChangeStage(ids, stageId))}
            className={controlClass}
          >
            Zmień{stage ? ` (${stageCount})` : ""}
          </button>
        </div>

        {/* 2. Data następnego follow-upu: tylko dla otwartych */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="Data następnego follow-upu"
            min={today}
            value={date}
            disabled={pending || openCount === 0}
            onChange={(e) => setDate(e.target.value)}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {}
            }}
            className={controlClass}
          />
          <button
            type="button"
            disabled={pending || !date || openCount === 0}
            onClick={() => run(() => bulkSetNextStepAt(ids, date))}
            className={controlClass}
          >
            Ustaw follow-up ({openCount})
          </button>
        </div>

        {/* 3. Usunięcie (deleted_at) z potwierdzeniem w dwóch kliknięciach */}
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">Usunąć {chosen.length}?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => bulkDelete(ids))}
              className="rounded bg-red-700 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
            >
              Tak, usuń
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-sm underline">
              Anuluj
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmDelete(true)}
            className="py-1 text-sm text-red-700 underline disabled:opacity-50"
          >
            Usuń zaznaczone
          </button>
        )}
      </div>

      {stage && stageCount < chosen.length && (
        <p className="text-xs text-gray-500">
          Etap „{stage.name}” dotyczy tylko ścieżki {PIPELINE_LABELS[stage.pipeline]}: pozostałe zaznaczone zostaną
          pominięte.
        </p>
      )}
      {pending && <p className="text-sm text-gray-500">Zapisuję…</p>}
      {message && <p className={`text-sm ${message.error ? "text-red-700" : "text-gray-600"}`}>{message.text}</p>}
    </div>
  );
}

function summary(r: Extract<BulkResult, { ok: true }>) {
  const parts = [`Zapisano: ${r.done}`];
  if (r.skipped) parts.push(`pominięto: ${r.skipped}`);
  if (r.errors.length) parts.push(`błędy: ${r.errors.length} (${r.errors[0]})`);
  return parts.join(", ") + ".";
}
