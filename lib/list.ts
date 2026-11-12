// Dane i pomocniki strony głównej: lista aplikacji i "Do zrobienia dziś" (tylko serwer).
// Jedno zapytanie pobiera wszystkie aplikacje, a filtrujemy w pamięci:
// przy jednym użytkowniku i kilkudziesięciu wpisach to prostsze i szybsze niż kilka zapytań.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityType, Source, Stage } from "./opportunities";

export type ListRow = {
  id: string;
  type: OpportunityType;
  title: string;
  company: string;
  submitted_at: string | null;
  next_step: string | null;
  next_step_at: string | null;
  stage_id: string;
  source_id: string;
  contact: string | null;
  sources: { name: string } | null;
  opportunity_stages: Pick<Stage, "name" | "outcome" | "pipeline"> | null;
};

export async function getListData(supabase: SupabaseClient) {
  const [rows, stages, sources] = await Promise.all([
    supabase
      .from("opportunities")
      .select(
        "id, type, title, company, contact, submitted_at, next_step, next_step_at, stage_id, source_id, sources(name), opportunity_stages(name, outcome, pipeline)",
      )
      .is("deleted_at", null)
      .order("submitted_at", { ascending: false, nullsFirst: true }) // "Do wysłania" na górze
      .order("created_at", { ascending: false }),
    supabase
      .from("opportunity_stages")
      .select("id, pipeline, name, position, outcome")
      .is("deleted_at", null)
      .order("pipeline")
      .order("position"),
    supabase.from("sources").select("id, name").is("deleted_at", null).order("position"),
  ]);

  const error = rows.error ?? stages.error ?? sources.error;
  if (error) throw new Error(`Nie udało się wczytać listy: ${error.message}`);

  return {
    rows: (rows.data ?? []) as unknown as ListRow[],
    stages: (stages.data ?? []) as Stage[],
    sources: (sources.data ?? []) as Source[],
  };
}

// Filtry listy zapisane w adresie, np. /?etap=all&q=allegro&zrodlo=<id>&od=2026-11-01&do=2026-11-30
export type ListFilters = {
  stage: string; // "open" (domyślnie), "all", "closed" albo id etapu
  q: string; // szukany tekst: firma, stanowisko, kontakt, źródło
  source: string; // id źródła albo ""
  from: string; // wysłano od (YYYY-MM-DD) albo ""
  to: string; // wysłano do (YYYY-MM-DD) albo ""
};

export const DEFAULT_FILTERS: ListFilters = { stage: "open", q: "", source: "", from: "", to: "" };

type RawParams = Record<string, string | string[] | undefined>;

export function parseFilters(params: RawParams): ListFilters {
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string).trim() : "");
  const date = (key: string) => (/^\d{4}-\d{2}-\d{2}$/.test(one(key)) ? one(key) : "");
  return { stage: one("etap") || "open", q: one("q"), source: one("zrodlo"), from: date("od"), to: date("do") };
}

// Ta sama mapa w drugą stronę: używa jej pasek filtrów w przeglądarce.
export function filtersToQuery(f: ListFilters) {
  const params = new URLSearchParams();
  if (f.stage !== "open") params.set("etap", f.stage);
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.source) params.set("zrodlo", f.source);
  if (f.from) params.set("od", f.from);
  if (f.to) params.set("do", f.to);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

const norm = (value: string) => value.toLocaleLowerCase("pl");

export function applyFilters(rows: ListRow[], f: ListFilters) {
  const q = norm(f.q);
  return rows.filter((r) => {
    const outcome = r.opportunity_stages?.outcome;
    if (f.stage === "open" && outcome !== "open") return false;
    if (f.stage === "closed" && outcome === "open") return false;
    if (!["open", "closed", "all"].includes(f.stage) && r.stage_id !== f.stage) return false;
    if (f.source && r.source_id !== f.source) return false;
    // Przedział dat: aplikacje bez daty wysłania ("Do wysłania") odpadają, gdy przedział jest ustawiony
    if (f.from && (!r.submitted_at || r.submitted_at < f.from)) return false;
    if (f.to && (!r.submitted_at || r.submitted_at > f.to)) return false;
    if (q) {
      const haystack = norm([r.company, r.title, r.contact ?? "", r.sources?.name ?? ""].join(" "));
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// Otwarte aplikacje z następnym krokiem dziś lub wcześniej; najstarsze zaległe na górze.
export function dueToday(rows: ListRow[], today: string) {
  return rows
    .filter((r) => r.opportunity_stages?.outcome === "open" && r.next_step_at && r.next_step_at <= today)
    .sort((a, b) => a.next_step_at!.localeCompare(b.next_step_at!));
}

// Ile dni po terminie (0 = dziś). Daty YYYY-MM-DD, liczone bez stref czasowych.
export function daysLate(date: string, today: string) {
  return Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
}

// "2026-11-12" → "12.11.2026"
export function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function lateLabel(days: number) {
  if (days <= 0) return "dziś";
  return days === 1 ? "zaległe 1 dzień" : `zaległe ${days} dni`;
}
