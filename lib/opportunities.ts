// Stałe i typy wspólne dla serwera i przeglądarki.
// Kody są takie jak w CHECK-ach migracji; polskie napisy żyją tylko tutaj.

export const OPPORTUNITY_TYPES = [
  { code: "employment", label: "Etat", pipeline: "recruitment" },
  { code: "b2b_contract", label: "Kontrakt B2B", pipeline: "recruitment" },
  { code: "freelance", label: "Zlecenie freelance", pipeline: "service_sales" },
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number]["code"];
export type Pipeline = (typeof OPPORTUNITY_TYPES)[number]["pipeline"];

export function isOpportunityType(value: string): value is OpportunityType {
  return OPPORTUNITY_TYPES.some((t) => t.code === value);
}

export function pipelineFor(type: OpportunityType): Pipeline {
  return OPPORTUNITY_TYPES.find((t) => t.code === type)!.pipeline;
}

// Etap ustawiany domyślnie dla nowej aplikacji (zmień nazwę, jeśli wolisz inny).
export const DEFAULT_STAGE_NAME: Record<Pipeline, string> = {
  recruitment: "Wysłane",
  service_sales: "Wycena wysłana",
};

// Kontakt: w formularzu trzy pola, w bazie jeden tekst "osoba | e-mail | telefon"
// (do przeglądu 1.12; potem migracja do tabeli contacts z MyTechSpace rozdzieli go po " | ").
export type ContactParts = { name: string; email: string; phone: string };

export function formatContact({ name, email, phone }: ContactParts) {
  const parts = [name.trim(), email.trim(), phone.trim()];
  return parts.some(Boolean) ? parts.join(" | ") : "";
}

export function parseContact(value: string): ContactParts {
  if (!value.includes(" | ")) return { name: value, email: "", phone: "" }; // starsze wpisy
  const [name = "", email = "", phone = ""] = value.split(" | ");
  return { name, email, phone };
}

// "linkedin.com/jobs/123" → "https://linkedin.com/jobs/123"
export function normalizeUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export const CV_LANGUAGES = [
  { code: "pl", label: "polski" },
  { code: "en", label: "angielski" },
] as const;

// Te same limity co w buckecie documents (migracja z kroku 2).
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];

export const DEFAULT_NEXT_STEP = "Follow-up";
export const FOLLOW_UP_DAYS = 7;

export type Source = { id: string; name: string };
export type Stage = {
  id: string;
  pipeline: Pipeline;
  name: string;
  position: number;
  outcome: "open" | "won" | "lost";
};
export type CvVersion = { id: string; name: string; language: string; storage_path: string };

// Wartości formularza: wszystko jako tekst, "" zamiast null.
export type OpportunityFormValues = {
  type: OpportunityType;
  title: string;
  company: string;
  contact: string;
  source_id: string;
  offer_url: string;
  offer_text: string;
  salary_range: string;
  stage_id: string;
  submitted_at: string;
  next_step: string;
  next_step_at: string;
  cv_version_id: string;
  notes: string;
  offer_snapshot_path: string;
};

// Data YYYY-MM-DD przesunięta o n dni (bez stref czasowych: liczymy na samej dacie).
export function addDays(isoDate: string, days: number) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Polskie nazwy ścieżek etapów (kody z kolumny pipeline).
export const PIPELINE_LABELS: Record<Pipeline, string> = {
  recruitment: "Rekrutacja",
  service_sales: "Sprzedaż usług",
};

export function typeLabel(type: OpportunityType) {
  return OPPORTUNITY_TYPES.find((t) => t.code === type)?.label ?? type;
}
