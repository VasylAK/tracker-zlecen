"use client";

// Interaktywne elementy strony głównej: filtry listy, zmiana etapu w wierszu, panel następnego kroku.
// Dane wczytuje serwer (app/page.tsx); tu tylko wywołujemy Server Actions i zmieniamy adres.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_NEXT_STEP,
  FOLLOW_UP_DAYS,
  PIPELINE_LABELS,
  addDays,
  type Pipeline,
  type Source,
  type Stage,
} from "@/lib/opportunities";
import { DEFAULT_FILTERS, filtersToQuery, type ListFilters } from "@/lib/list";
import { changeStage, updateNextStep } from "./opportunities/actions";

const selectClass = "rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50";
const PIPELINES: Pipeline[] = ["recruitment", "service_sales"];

// Pasek filtrów listy. Stan trzymamy w adresie (?etap=&q=&zrodlo=&od=&do=), więc działa
// "wstecz", odświeżenie i zakładki. Listy i daty działają od razu, tekst po 300 ms przerwy w pisaniu.
export function ListFilterBar({
  filters,
  stages,
  sources,
}: {
  filters: ListFilters;
  stages: Stage[];
  sources: Source[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(next: ListFilters) {
    startTransition(() => router.replace(filtersToQuery(next), { scroll: false }));
  }

  const isDefault = filtersToQuery({ ...filters, q }) === "/";
  const field = "space-y-1 text-sm";

  return (
    <div className={`grid gap-2 sm:grid-cols-2 md:grid-cols-[2fr_1fr_1.2fr_auto_auto_auto] md:items-end ${pending ? "opacity-70" : ""}`}>
      <label className={field}>
        <span className="text-gray-500">Szukaj</span>
        <input
          type="search"
          value={q}
          placeholder="Firma, stanowisko, kontakt, źródło"
          className={`${selectClass} w-full`}
          onChange={(e) => {
            const value = e.target.value;
            setQ(value);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => apply({ ...filters, q: value }), 300);
          }}
        />
      </label>
      <label className={field}>
        <span className="text-gray-500">Źródło</span>
        <select
          value={filters.source}
          className={`${selectClass} w-full`}
          onChange={(e) => apply({ ...filters, q, source: e.target.value })}
        >
          <option value="">Wszystkie</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className={field}>
        <span className="text-gray-500">Etap</span>
        <select
          value={filters.stage}
          className={`${selectClass} w-full`}
          onChange={(e) => apply({ ...filters, q, stage: e.target.value })}
        >
          <option value="open">Otwarte</option>
          <option value="all">Wszystkie</option>
          <option value="closed">Zakończone</option>
          {PIPELINES.map((pipeline) => (
            <optgroup key={pipeline} label={PIPELINE_LABELS[pipeline]}>
              {stages
                .filter((s) => s.pipeline === pipeline)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className={field}>
        <span className="text-gray-500">Wysłano od</span>
        <input
          type="date"
          value={filters.from}
          max={filters.to || undefined}
          className={`${selectClass} w-full`}
          onChange={(e) => apply({ ...filters, q, from: e.target.value })}
        />
      </label>
      <label className={field}>
        <span className="text-gray-500">do</span>
        <input
          type="date"
          value={filters.to}
          min={filters.from || undefined}
          className={`${selectClass} w-full`}
          onChange={(e) => apply({ ...filters, q, to: e.target.value })}
        />
      </label>
      <button
        type="button"
        disabled={isDefault}
        onClick={() => {
          setQ("");
          apply(DEFAULT_FILTERS);
        }}
        className="py-1 text-sm underline disabled:no-underline disabled:opacity-40"
      >
        Wyczyść
      </button>
    </div>
  );
}

// Lista etapów tylko ze ścieżki tej aplikacji. Wybór od razu zapisuje zmianę i historię.
export function StageSelect({
  opportunityId,
  stageId,
  stages,
}: {
  opportunityId: string;
  stageId: string;
  stages: Stage[];
}) {
  const [value, setValue] = useState(stageId); // pokazujemy wybór od razu, nie czekając na serwer
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <select
        aria-label="Etap"
        value={value}
        disabled={pending}
        className={`${selectClass} w-full`}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          setError(null);
          startTransition(async () => {
            const result = await changeStage(opportunityId, next);
            if (!result.ok) {
              setValue(stageId); // cofamy wybór, bo zapis się nie udał
              setError(result.error);
            }
          });
        }}
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

// Dwa przyciski na zadaniu, każdy otwiera swoje okienko:
// "Kontynuuję" = etap otwarty + co dalej + dowolna data,
// "Zamykam" = etap zamykający jako przyczyna (bez kolejnego follow-upu) + opcjonalna notatka.
type Mode = "continue" | "close";
const QUICK_DAYS = [3, 7, 14];
const inputClass = "w-full rounded border border-gray-300 px-2 py-1 text-sm";

export function NextStepPanel({
  opportunityId,
  stageId,
  stages,
  nextStep,
  today,
  heading,
}: {
  opportunityId: string;
  stageId: string;
  stages: Stage[]; // tylko etapy ze ścieżki tej aplikacji
  nextStep: string | null;
  today: string;
  heading: string; // np. "Allegro · Specjalista ds. integracji"
}) {
  const openStages = stages.filter((s) => s.outcome === "open");
  const closingStages = [...stages.filter((s) => s.outcome === "won"), ...stages.filter((s) => s.outcome === "lost")];
  const currentIsOpen = openStages.some((s) => s.id === stageId);

  const [mode, setMode] = useState<Mode | null>(null); // null = okienko zamknięte
  const [openStageId, setOpenStageId] = useState(currentIsOpen ? stageId : (openStages[0]?.id ?? ""));
  const [step, setStep] = useState(nextStep || DEFAULT_NEXT_STEP);
  const [date, setDate] = useState(addDays(today, FOLLOW_UP_DAYS));
  const [closeStageId, setCloseStageId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const input =
      mode === "continue"
        ? { stageId: openStageId, nextStep: step, nextStepAt: date, note: "" }
        : { stageId: closeStageId, nextStep: "", nextStepAt: "", note };
    if (mode === "close" && !closeStageId) return setError("Wybierz, jak się zakończyło.");
    setError(null);
    startTransition(async () => {
      const result = await updateNextStep(opportunityId, input);
      if (result.ok) setMode(null);
      else setError(result.error);
    });
  }

  const trigger = (value: Mode, text: string, primary: boolean) => (
    <button
      type="button"
      onClick={() => {
        setError(null);
        setMode(value);
      }}
      className={`rounded px-2 py-1 text-sm ${
        primary ? "bg-black text-white dark:bg-white dark:text-black" : "border border-gray-300"
      }`}
    >
      {text}
    </button>
  );

  const buttons = (
    <div className="flex gap-2">
      {trigger("continue", "Kontynuuję", true)}
      {trigger("close", "Zamykam", false)}
    </div>
  );

  if (mode === null) return buttons;

  return (
    <>
    {buttons}
    {/* Okienko nad stroną: ten sam wygląd w "Do zrobienia dziś" i w tabeli, wygodne na telefonie */}
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && setMode(null)}
    >
    <div role="dialog" aria-label={heading} className="w-full max-w-xl space-y-3 rounded border border-gray-300 bg-background p-4">
      <p className="font-medium">
        {mode === "continue" ? "Kontynuuję" : "Zamykam"}: <span className="font-normal">{heading}</span>
      </p>

      {mode === "continue" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-gray-500">Etap</span>
            <select value={openStageId} onChange={(e) => setOpenStageId(e.target.value)} className={inputClass}>
              {openStages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-gray-500">Następny krok</span>
            <input value={step} onChange={(e) => setStep(e.target.value)} className={inputClass} />
          </label>
          <div className="space-y-1 text-sm">
            <label htmlFor={`date-${opportunityId}`} className="text-gray-500">
              Kiedy
            </label>
            <input
              id={`date-${opportunityId}`}
              type="date"
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch {}
              }}
              className={inputClass}
            />
            <div className="flex gap-1">
              {QUICK_DAYS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDate(addDays(today, days))}
                  className="rounded border border-gray-300 px-2 text-xs"
                >
                  +{days} dni
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-1 text-sm text-gray-500">Jak się zakończyło?</legend>
            {closingStages.map((s) => (
              <label
                key={s.id}
                className={`cursor-pointer rounded border px-3 py-1 text-sm ${
                  closeStageId === s.id ? "border-black font-medium" : "border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name={`close-${opportunityId}`}
                  value={s.id}
                  checked={closeStageId === s.id}
                  onChange={() => setCloseStageId(s.id)}
                  className="sr-only"
                />
                {s.outcome === "won" ? "✓ " : ""}
                {s.name}
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1 text-sm">
            <span className="text-gray-500">Notatka (opcjonalnie)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Np. wybrali kandydata z doświadczeniem w SAP"
              className={inputClass}
            />
          </label>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded bg-black px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Zapisuję…" : mode === "continue" ? "Zapisz" : "Zamknij aplikację"}
        </button>
        <button type="button" onClick={() => setMode(null)} className="px-3 py-1 text-sm underline">
          Anuluj
        </button>
      </div>
    </div>
    </div>
    </>
  );
}
