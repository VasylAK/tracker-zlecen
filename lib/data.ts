// Odczyty z bazy używane przez strony formularza (tylko serwer).
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_NEXT_STEP,
  FOLLOW_UP_DAYS,
  addDays,
  parseContact,
  type ContactParts,
  type CvVersion,
  type OpportunityFormValues,
  type Source,
  type Stage,
} from "./opportunities";

export async function getFormOptions(supabase: SupabaseClient) {
  const [sources, stages, cvVersions, past] = await Promise.all([
    supabase.from("sources").select("id, name").is("deleted_at", null).order("position"),
    supabase
      .from("opportunity_stages")
      .select("id, pipeline, name, position, outcome")
      .is("deleted_at", null)
      .order("pipeline")
      .order("position"),
    supabase
      .from("cv_versions")
      .select("id, name, language, storage_path")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    // Firmy i kontakty z dotychczasowych aplikacji: podpowiedzi w formularzu
    supabase
      .from("opportunities")
      .select("company, contact")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const error = sources.error ?? stages.error ?? cvVersions.error ?? past.error;
  if (error) throw new Error(`Nie udało się wczytać słowników: ${error.message}`);

  const pastRows = (past.data ?? []) as { company: string; contact: string | null }[];

  return {
    sources: (sources.data ?? []) as Source[],
    stages: (stages.data ?? []) as Stage[],
    cvVersions: (cvVersions.data ?? []) as CvVersion[],
    knownCompanies: uniqueIgnoringCase(pastRows.map((r) => r.company)),
    knownContacts: uniqueContacts(pastRows.map((r) => r.contact ?? "")),
  };
}

// Jedna pozycja na nazwę bez względu na wielkość liter; wygrywa najnowsza pisownia
function uniqueIgnoringCase(values: string[]) {
  const seen = new Map<string, string>();
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, v.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "pl"));
}

function uniqueContacts(values: string[]) {
  const seen = new Map<string, ContactParts>();
  for (const v of values) {
    const c = parseContact(v);
    const key = (c.name || c.email).trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()];
}

export function emptyFormValues(today: string): OpportunityFormValues {
  return {
    type: "employment",
    title: "",
    company: "",
    contact: "",
    source_id: "",
    offer_url: "",
    offer_text: "",
    salary_range: "",
    stage_id: "", // formularz dobierze DEFAULT_STAGE_NAME
    submitted_at: today,
    next_step: DEFAULT_NEXT_STEP,
    next_step_at: addDays(today, FOLLOW_UP_DAYS),
    cv_version_id: "",
    notes: "",
    offer_snapshot_path: "",
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getOpportunityFormValues(
  supabase: SupabaseClient,
  id: string,
): Promise<OpportunityFormValues | null> {
  if (!UUID_RE.test(id)) return null;

  const { data, error } = await supabase
    .from("opportunities")
    .select(
      "type, title, company, contact, source_id, offer_url, offer_text, salary_range, stage_id, submitted_at, next_step, next_step_at, cv_version_id, notes, offer_snapshot_path",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`Nie udało się wczytać aplikacji: ${error.message}`);
  if (!data) return null;

  // null z bazy → "" w formularzu
  const values = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value ?? ""]),
  );
  return values as OpportunityFormValues;
}

// Dzisiejsza data w Polsce (serwer na Vercelu działa w UTC).
export function todayInWarsaw() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());
}
