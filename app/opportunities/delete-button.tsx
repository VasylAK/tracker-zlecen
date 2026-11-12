"use client";

// Usuwanie z potwierdzeniem w dwóch kliknięciach (bez okna przeglądarki), po usunięciu powrót do listy.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteOpportunity } from "./actions";

export function DeleteOpportunityButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-sm text-red-700 underline">
        Usuń aplikację
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded border border-red-700 p-3">
      <p className="text-sm">Usunąć tę aplikację? Zniknie z listy i z „Do zrobienia dziś”.</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteOpportunity(opportunityId);
              if (result.ok) router.push("/");
              else setError(result.error);
            })
          }
          className="rounded bg-red-700 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Usuwam…" : "Tak, usuń"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="px-3 py-1 text-sm underline">
          Anuluj
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
