// Strona startowa: tymczasowa, prosta lista z linkami do edycji.
// Pełna lista z filtrem i widok "Do zrobienia dziś" to krok 4.
import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tracker Zleceń</h1>
        <div className="flex gap-2">
          <Link href="/opportunities/new" className="rounded bg-black px-4 py-2 font-medium text-white">
            Nowa aplikacja
          </Link>
          <form action={signOut}>
            <button type="submit" className="rounded border border-gray-300 px-4 py-2">
              Wyloguj
            </button>
          </form>
        </div>
      </header>
      <Suspense fallback={<p>Ładowanie aplikacji…</p>}>
        <OpportunityList />
      </Suspense>
    </main>
  );
}

type Row = {
  id: string;
  title: string;
  company: string;
  submitted_at: string | null;
  opportunity_stages: { name: string } | null;
};

async function OpportunityList() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("id, title, company, submitted_at, opportunity_stages(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return <p className="text-red-700">Błąd odczytu: {error.message}</p>;
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return <p className="text-gray-600">Brak aplikacji. Dodaj pierwszą.</p>;

  return (
    <ul className="divide-y divide-gray-200 rounded border border-gray-200">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-3 p-3">
          <div>
            <p className="font-medium">{row.title}</p>
            <p className="text-sm text-gray-600">
              {row.company} · {row.opportunity_stages?.name ?? "—"}
              {row.submitted_at ? ` · wysłano ${row.submitted_at}` : ""}
            </p>
          </div>
          <Link href={`/opportunities/${row.id}/edit`} className="text-sm underline">
            Edytuj
          </Link>
        </li>
      ))}
    </ul>
  );
}
