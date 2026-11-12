// Nowa aplikacja. Odczyt sesji i słowników jest w <Suspense>, bo przy cacheComponents
// dane z żądania (ciasteczka) nie mogą trafić do statycznej "skorupy" strony.
import { Suspense } from "react";
import { connection } from "next/server";
import { AppHeader } from "../../app-header";
import { createClient } from "@/lib/supabase/server";
import { emptyFormValues, getFormOptions, todayInWarsaw } from "@/lib/data";
import { OpportunityForm } from "../opportunity-form";

export default function NewOpportunityPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl space-y-6 p-4">
        <h1 className="text-2xl font-semibold">Nowa aplikacja</h1>
        <Suspense fallback={<p>Ładowanie formularza…</p>}>
          <NewOpportunityForm />
        </Suspense>
      </main>
    </>
  );
}

async function NewOpportunityForm() {
  // Domyślna data wysłania = dziś, liczona przy każdym wejściu.
  await connection();
  const supabase = await createClient();
  const options = await getFormOptions(supabase);
  return <OpportunityForm opportunityId={null} initial={emptyFormValues(todayInWarsaw())} {...options} />;
}
