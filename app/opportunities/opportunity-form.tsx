"use client";

// Formularz aplikacji: wspólny dla dodawania i edycji.
// Przy zapisie: (1) pliki idą z przeglądarki prosto do Storage, (2) Server Action dostaje
// resztę pól i ścieżki plików. Dzięki temu nie dotykają nas limity rozmiaru Server Actions i Vercela.
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ALLOWED_MIME_TYPES,
  CV_LANGUAGES,
  DEFAULT_STAGE_NAME,
  FOLLOW_UP_DAYS,
  MAX_FILE_BYTES,
  OPPORTUNITY_TYPES,
  addDays,
  parseContact,
  pipelineFor,
  type ContactParts,
  type CvVersion,
  type OpportunityFormValues,
  type OpportunityType,
  type Pipeline,
  type Source,
  type Stage,
} from "@/lib/opportunities";
import { saveOpportunity } from "./actions";

type Props = {
  opportunityId: string | null; // null = nowa aplikacja
  initial: OpportunityFormValues;
  sources: Source[];
  stages: Stage[];
  cvVersions: CvVersion[];
  knownCompanies: string[]; // podpowiedzi z dotychczasowych aplikacji
  knownContacts: ContactParts[];
  snapshotUrl?: string | null; // podgląd zapisanego PDF-a oferty (edycja)
};

type CvMode = "existing" | "new" | "none";

const inputClass = "w-full rounded border border-gray-300 px-3 py-2";

// Kliknięcie w dowolne miejsce pola daty otwiera kalendarz (nie tylko ikonka)
function openPicker(event: { currentTarget: HTMLInputElement }) {
  try {
    event.currentTarget.showPicker?.();
  } catch {
    // starsze przeglądarki: zostaje zwykłe pole
  }
}

export function OpportunityForm({
  opportunityId,
  initial,
  sources,
  stages,
  cvVersions,
  knownCompanies,
  knownContacts,
  snapshotUrl,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const defaultStageId = (pipeline: Pipeline) =>
    stages.find((s) => s.pipeline === pipeline && s.name === DEFAULT_STAGE_NAME[pipeline])?.id ??
    stages.find((s) => s.pipeline === pipeline)?.id ??
    "";

  // Pola zależne od siebie są kontrolowane; reszta to zwykłe inputy z defaultValue.
  const [type, setType] = useState<OpportunityType>(initial.type);
  const [stageId, setStageId] = useState(initial.stage_id || defaultStageId(pipelineFor(initial.type)));
  const [submittedAt, setSubmittedAt] = useState(initial.submitted_at);
  const [nextStepAt, setNextStepAt] = useState(initial.next_step_at);
  const [nextStepAtTouched, setNextStepAtTouched] = useState(opportunityId !== null);
  const [cvMode, setCvMode] = useState<CvMode>(
    initial.cv_version_id
      ? "existing"
      : opportunityId !== null // edycja aplikacji bez CV
        ? "none"
        : cvVersions.length > 0
          ? "existing"
          : "new",
  );
  const [cvName, setCvName] = useState("");
  const [contact, setContact] = useState<ContactParts>(parseContact(initial.contact));

  const pipeline = pipelineFor(type);
  const stagesForType = stages.filter((s) => s.pipeline === pipeline);
  const isOpen = stages.find((s) => s.id === stageId)?.outcome === "open";

  // Wybór znanej osoby z podpowiedzi uzupełnia puste pola e-mail i telefon
  function onContactNameChange(name: string) {
    const known = knownContacts.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    setContact((prev) => ({
      name,
      email: prev.email || known?.email || "",
      phone: prev.phone || known?.phone || "",
    }));
  }

  function onTypeChange(next: OpportunityType) {
    setType(next);
    // Inna ścieżka etapów → przestaw etap na domyślny dla nowej ścieżki
    if (pipelineFor(next) !== pipeline) setStageId(defaultStageId(pipelineFor(next)));
  }

  function onSubmittedAtChange(value: string) {
    setSubmittedAt(value);
    // Follow-up za 7 dni, dopóki sam nie zmienię daty następnego kroku
    if (!nextStepAtTouched) setNextStepAt(addDays(value, FOLLOW_UP_DAYS));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      try {
        const snapshot = formData.get("offer_snapshot");
        formData.delete("offer_snapshot");
        if (snapshot instanceof File && snapshot.size > 0) {
          formData.set("offer_snapshot_path", await uploadFile(snapshot, "offers"));
        }

        const cvFile = formData.get("cv_file");
        formData.delete("cv_file");
        if (cvMode === "new" && cvFile instanceof File && cvFile.size > 0) {
          formData.set("cv_file_path", await uploadFile(cvFile, "cv"));
          formData.delete("cv_version_id");
        }
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Nie udało się wysłać pliku.");
        return;
      }

      const result = await saveOpportunity(opportunityId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Oferta">
        <Field label="Typ" required>
          <select
            name="type"
            value={type}
            onChange={(e) => onTypeChange(e.target.value as OpportunityType)}
            className={inputClass}
          >
            {OPPORTUNITY_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stanowisko / zlecenie" required>
          <input name="title" defaultValue={initial.title} required className={inputClass} />
        </Field>
        <Field label="Firma / klient" required hint="Zacznij pisać, a podpowiem firmy, które już są w trackerze.">
          <input
            name="company"
            defaultValue={initial.company}
            required
            list="known-companies"
            autoComplete="off"
            className={inputClass}
          />
          <datalist id="known-companies">
            {knownCompanies.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Źródło" required>
          <select name="source_id" defaultValue={initial.source_id} required className={inputClass}>
            <option value="" disabled>
              Wybierz…
            </option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Link do oferty">
          <input
            name="offer_url"
            type="text"
            inputMode="url"
            placeholder="np. linkedin.com/jobs/view/…"
            defaultValue={initial.offer_url}
            className={inputClass}
          />
        </Field>
        <Field label="Pełna treść ogłoszenia" required hint="Zaznacz całą ofertę, skopiuj i wklej. Link może wygasnąć.">
          <textarea
            name="offer_text"
            defaultValue={initial.offer_text}
            required
            rows={10}
            className={`${inputClass} font-mono text-sm`}
          />
        </Field>
        <Field
          label="PDF lub zrzut oferty"
          hint="Opcjonalnie: PDF, PNG lub JPG do 10 MB. Link do pliku w innym miejscu (np. Dysk Google) wpisz w notatkach."
        >
          {initial.offer_snapshot_path && (
            <span className="block text-sm">
              Zapisany plik:{" "}
              {snapshotUrl ? (
                <a href={snapshotUrl} target="_blank" rel="noreferrer" className="underline">
                  otwórz
                </a>
              ) : (
                initial.offer_snapshot_path
              )}
              . Nowy plik go zastąpi.
            </span>
          )}
          <input name="offer_snapshot" type="file" accept={ALLOWED_MIME_TYPES.join(",")} className={inputClass} />
        </Field>
        <Field label="Widełki / stawka" hint="Podaj okres i brutto/netto, np. „80–120 zł/h netto” albo „12–15 tys. zł/mies. brutto”.">
          <input
            name="salary_range"
            defaultValue={initial.salary_range}
            placeholder="80–120 zł/h netto"
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Kontakt">
        <Field label="Osoba" hint="Podpowiem osoby z wcześniejszych aplikacji.">
          <input
            name="contact_name"
            value={contact.name}
            onChange={(e) => onContactNameChange(e.target.value)}
            list="known-contact-names"
            autoComplete="off"
            className={inputClass}
          />
          <datalist id="known-contact-names">
            {knownContacts.filter((c) => c.name).map((c) => (
              <option key={c.name} value={c.name} />
            ))}
          </datalist>
        </Field>
        <Field label="E-mail">
          <input
            name="contact_email"
            type="email"
            value={contact.email}
            onChange={(e) => setContact((prev) => ({ ...prev, email: e.target.value }))}
            list="known-contact-emails"
            autoComplete="off"
            className={inputClass}
          />
          <datalist id="known-contact-emails">
            {knownContacts.filter((c) => c.email).map((c) => (
              <option key={c.email} value={c.email} />
            ))}
          </datalist>
        </Field>
        <Field label="Telefon">
          <input
            name="contact_phone"
            type="tel"
            value={contact.phone}
            onChange={(e) => setContact((prev) => ({ ...prev, phone: e.target.value }))}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Wysłane CV">
        <div className="flex flex-wrap gap-4 text-sm">
          {cvVersions.length > 0 && (
            <label className="flex items-center gap-2">
              <input type="radio" checked={cvMode === "existing"} onChange={() => setCvMode("existing")} />
              Wybieram z listy
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="radio" checked={cvMode === "new"} onChange={() => setCvMode("new")} />
            Dodaję nowe CV
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={cvMode === "none"} onChange={() => setCvMode("none")} />
            Nie dołączam CV
          </label>
        </div>

        {cvMode === "none" && <input type="hidden" name="cv_version_id" value="" />}

        {cvMode === "existing" && (
          <Field label="Wersja CV" required>
            <select
              name="cv_version_id"
              defaultValue={initial.cv_version_id}
              required
              className={inputClass}
            >
              <option value="" disabled>
                Wybierz…
              </option>
              {cvVersions.map((cv) => (
                <option key={cv.id} value={cv.id}>
                  {cv.name} ({cv.language})
                </option>
              ))}
            </select>
          </Field>
        )}

        {cvMode === "new" && (
          <>
            <Field label="Plik CV" required hint="Dokładnie ten plik, który wysłałeś (PDF do 10 MB).">
              <input
                name="cv_file"
                type="file"
                accept="application/pdf"
                required
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && !cvName) setCvName(file.name.replace(/\.[^.]+$/, ""));
                }}
                className={inputClass}
              />
            </Field>
            <Field label="Nazwa wersji" hint="Np. CV Integracje e-commerce PL v3">
              <input name="cv_name" value={cvName} onChange={(e) => setCvName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Język CV" required>
              <select name="cv_language" defaultValue="pl" className={inputClass}>
                {CV_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
      </Section>

      <Section title="Etap i następny krok">
        <Field label="Etap" required>
          <select name="stage_id" value={stageId} onChange={(e) => setStageId(e.target.value)} className={inputClass}>
            {stagesForType.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data wysłania" hint="Puste, jeśli jeszcze nie wysłałeś.">
          <input
            name="submitted_at"
            type="date"
            value={submittedAt}
            onChange={(e) => onSubmittedAtChange(e.target.value)}
            onClick={openPicker}
            className={inputClass}
          />
        </Field>
        <Field label="Następny krok" required={isOpen}>
          <input name="next_step" defaultValue={initial.next_step} required={isOpen} className={inputClass} />
        </Field>
        <Field label="Data następnego kroku" required={isOpen}>
          <input
            name="next_step_at"
            type="date"
            value={nextStepAt}
            required={isOpen}
            onChange={(e) => {
              setNextStepAt(e.target.value);
              setNextStepAtTouched(true);
            }}
            onClick={openPicker}
            className={inputClass}
          />
        </Field>
        <Field label="Notatki" hint="Tu także link lub ścieżka do innych wysłanych materiałów.">
          <textarea name="notes" defaultValue={initial.notes} rows={4} className={inputClass} />
        </Field>
      </Section>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? "Zapisywanie…" : "Zapisz"}
        </button>
        <Link href="/" className="rounded border border-gray-300 px-4 py-2">
          Anuluj
        </Link>
      </div>
    </form>
  );
}

// Wysyła plik do prywatnego bucketu documents i zwraca jego ścieżkę.
async function uploadFile(file: File, folder: "cv" | "offers") {
  if (file.size > MAX_FILE_BYTES) throw new Error(`Plik „${file.name}” ma ponad 10 MB.`);
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error(`Plik „${file.name}”: dozwolone są tylko PDF, PNG i JPG.`);
  }

  const path = `${folder}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await createClient()
    .storage.from("documents")
    .upload(path, file, { contentType: file.type });
  if (error) throw new Error(`Nie udało się wysłać „${file.name}”: ${error.message}`);
  return path;
}

// Klucze w Storage nie lubią polskich znaków i spacji: "CV Łukasz v3.pdf" → "CV__ukasz_v3.pdf"
function safeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded border border-gray-200 p-4">
      <legend className="px-1 font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}
