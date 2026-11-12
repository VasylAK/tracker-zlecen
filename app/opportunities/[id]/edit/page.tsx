// Edycja aplikacji: ten sam formularz, wypełniony danymi z bazy.
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFormOptions, getOpportunityFormValues } from "@/lib/data";
import { OpportunityForm } from "../../opportunity-form";
import { DeleteOpportunityButton } from "../../delete-button";

type Params = Promise<{ id: string }>;

export default function EditOpportunityPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Edycja aplikacji</h1>
      <Suspense fallback={<p>Ładowanie aplikacji…</p>}>
        <EditOpportunityForm params={params} />
      </Suspense>
    </main>
  );
}

async function EditOpportunityForm({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createClient();

  const [initial, options] = await Promise.all([
    getOpportunityFormValues(supabase, id),
    getFormOptions(supabase),
  ]);
  if (!initial) notFound();

  // Prywatny bucket: do podglądu potrzebny jest podpisany link ważny 10 minut
  let snapshotUrl: string | null = null;
  if (initial.offer_snapshot_path) {
    const { data } = await supabase.storage
      .from("documents")
      .createSignedUrl(initial.offer_snapshot_path, 600);
    snapshotUrl = data?.signedUrl ?? null;
  }

  return (
    <>
      <OpportunityForm opportunityId={id} initial={initial} snapshotUrl={snapshotUrl} {...options} />
      <div className="border-t border-gray-200 pt-4">
        <DeleteOpportunityButton opportunityId={id} />
      </div>
    </>
  );
}
