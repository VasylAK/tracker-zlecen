// Strona główna: "Do zrobienia dziś" na górze, pod nią lista aplikacji z filtrem po etapie.
// Odczyt adresu, sesji i danych jest w <Suspense> (wymóg cacheComponents, jak w formularzu).
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayInWarsaw } from "@/lib/data";
import {
  applyFilters,
  daysLate,
  dueToday,
  formatDate,
  getListData,
  lateLabel,
  parseFilters,
  type ListFilters,
  type ListRow,
} from "@/lib/list";
import { pipelineFor, typeLabel, type Source, type Stage } from "@/lib/opportunities";
import { ListFilterBar, NextStepPanel, StageSelect } from "./list-controls";
import { AppHeader } from "./app-header";

type SearchParams = PageProps<"/">["searchParams"];

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl space-y-8 p-4">
        <Suspense fallback={<p>Ładowanie aplikacji…</p>}>
          <Dashboard searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  // "Dziś" liczymy przy każdym wejściu, a nie raz przy budowaniu strony.
  await connection();
  const filters = parseFilters(await searchParams);

  const supabase = await createClient();
  const { rows, stages, sources } = await getListData(supabase);
  const today = todayInWarsaw();

  // Etapy pogrupowane po ścieżce: w wierszu pokazujemy tylko etapy pasujące do typu aplikacji
  const stagesFor = (row: ListRow) => stages.filter((s) => s.pipeline === pipelineFor(row.type));

  return (
    <>
      <TodaySection rows={dueToday(rows, today)} today={today} stagesFor={stagesFor} />
      <ListSection
        rows={applyFilters(rows, filters)}
        hasAny={rows.length > 0}
        filters={filters}
        stages={stages}
        sources={sources}
        today={today}
        stagesFor={stagesFor}
      />
    </>
  );
}

type StagesFor = (row: ListRow) => Stage[];

function TodaySection({ rows, today, stagesFor }: { rows: ListRow[]; today: string; stagesFor: StagesFor }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        Do zrobienia dziś <span className="font-normal text-gray-500">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-gray-600">Na dziś nic. Wszystkie follow-upy są w terminie.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {rows.map((row) => {
            const late = daysLate(row.next_step_at!, today);
            return (
              <li key={row.id} className="flex flex-wrap items-start gap-3 p-3">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="font-medium">
                    {row.next_step}{" "}
                    <span className={`text-sm ${late > 0 ? "text-red-700" : "text-gray-500"}`}>
                      · {lateLabel(late)}
                    </span>
                  </p>
                  <p className="truncate text-sm text-gray-600">
                    {row.company} · {row.title}
                  </p>
                </div>
                <div className="w-44">
                  <StageSelect key={row.stage_id} opportunityId={row.id} stageId={row.stage_id} stages={stagesFor(row)} />
                </div>
                <NextStepPanel
                  key={`${row.stage_id}-${row.next_step_at}`}
                  opportunityId={row.id}
                  stageId={row.stage_id}
                  stages={stagesFor(row)}
                  nextStep={row.next_step}
                  today={today}
                  heading={`${row.company} · ${row.title}`}
                />
                <Link href={`/opportunities/${row.id}/edit`} className="py-1 text-sm underline">
                  Edytuj
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Na telefonie wiersz to karta, od szerokości md: tabela z nagłówkami.
// Każdy wiersz to osobna siatka, więc kolumny muszą mieć szerokość niezależną od treści:
// minmax(0, …fr) nie pozwala długiemu tekstowi rozepchać kolumny, a ostatnia ma stałe 4rem.
// Dzięki temu nagłówki i wartości zawsze są w tych samych miejscach.
const COLUMNS =
  "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_4rem]";

function ListSection({
  rows,
  hasAny,
  filters,
  stages,
  sources,
  today,
  stagesFor,
}: {
  rows: ListRow[];
  hasAny: boolean;
  filters: ListFilters;
  stages: Stage[];
  sources: Source[];
  today: string;
  stagesFor: StagesFor;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        Aplikacje <span className="font-normal text-gray-500">({rows.length})</span>
      </h2>
      <ListFilterBar filters={filters} stages={stages} sources={sources} />

      {!hasAny ? (
        <p className="text-gray-600">Brak aplikacji. Dodaj pierwszą.</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-600">Brak aplikacji dla tych filtrów.</p>
      ) : (
        <div className="rounded border border-gray-200">
          <div className={`hidden gap-3 border-b border-gray-200 p-3 text-sm font-medium text-gray-500 md:grid ${COLUMNS}`}>
            <span>Firma i stanowisko</span>
            <span>Źródło</span>
            <span>Etap</span>
            <span>Wysłano</span>
            <span>Następny krok</span>
            <span />
          </div>
          <ul className="divide-y divide-gray-200">
            {rows.map((row) => {
              const open = row.opportunity_stages?.outcome === "open";
              const overdue = open && !!row.next_step_at && row.next_step_at < today;
              return (
                <li key={row.id} className={`grid grid-cols-1 gap-2 p-3 md:items-center md:gap-3 ${COLUMNS}`}>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.company}</p>
                    <p className="truncate text-sm text-gray-600">
                      {row.title} · {typeLabel(row.type)}
                    </p>
                  </div>
                  <p className="text-sm">
                    <span className="text-gray-500 md:hidden">Źródło: </span>
                    {row.sources?.name ?? "—"}
                  </p>
                  <StageSelect key={row.stage_id} opportunityId={row.id} stageId={row.stage_id} stages={stagesFor(row)} />
                  <p className="text-sm">
                    <span className="text-gray-500 md:hidden">Wysłano: </span>
                    {formatDate(row.submitted_at)}
                  </p>
                  <p className={`text-sm ${overdue ? "text-red-700" : ""}`}>
                    <span className="text-gray-500 md:hidden">Następny krok: </span>
                    {open && row.next_step_at ? `${row.next_step ?? "—"} · ${formatDate(row.next_step_at)}` : "brak"}
                  </p>
                  <Link href={`/opportunities/${row.id}/edit`} className="text-sm underline md:text-right">
                    Edytuj
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
