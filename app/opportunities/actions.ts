"use server";

// Zapis aplikacji (nowej i edytowanej). Działa na serwerze z sesją z ciasteczek,
// więc RLS przepuszcza tylko zalogowanego. Pliki są już w Storage: dostajemy same ścieżki.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatContact, isOpportunityType, normalizeUrl, pipelineFor } from "@/lib/opportunities";

export type SaveResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): SaveResult => ({ ok: false, error });

export async function saveOpportunity(id: string | null, formData: FormData): Promise<SaveResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return fail("Sesja wygasła. Zaloguj się ponownie.");

  // Pole tekstowe: przycięte, a puste → null
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  };

  // 1. Pola wymagane
  const type = text("type");
  if (!type || !isOpportunityType(type)) return fail("Wybierz typ aplikacji.");
  const title = text("title");
  let company = text("company");
  const sourceId = text("source_id");
  const stageId = text("stage_id");
  const offerText = text("offer_text");
  if (!title) return fail("Podaj stanowisko lub nazwę zlecenia.");
  if (!company) return fail("Podaj firmę lub klienta.");
  if (!sourceId) return fail("Wybierz źródło.");
  if (!stageId) return fail("Wybierz etap.");
  if (!offerText) return fail("Wklej treść ogłoszenia: link może wygasnąć.");

  // 1a. Firma już zapisana inną wielkością liter ("allegro" vs "Allegro") → używamy istniejącej pisowni,
  //     żeby jedna firma miała jedną nazwę (ułatwi migrację do tabeli companies po przeglądzie).
  const { data: sameCompany } = await supabase
    .from("opportunities")
    .select("company")
    .ilike("company", company.replace(/[\\%_]/g, "\\$&"))
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (sameCompany?.[0]?.company) company = sameCompany[0].company;

  // 2. Etap musi należeć do ścieżki typu (tę regułę pilnuje aplikacja, nie baza)
  const { data: stage, error: stageError } = await supabase
    .from("opportunity_stages")
    .select("pipeline, outcome")
    .eq("id", stageId)
    .single();
  if (stageError || !stage) return fail("Nie znaleziono etapu.");
  if (stage.pipeline !== pipelineFor(type)) return fail("Etap nie pasuje do typu aplikacji.");

  // 3. Dla otwartych: następny krok i data są obowiązkowe
  const nextStep = text("next_step");
  const nextStepAt = text("next_step_at");
  if (stage.outcome === "open" && (!nextStep || !nextStepAt)) {
    return fail("Dla otwartej aplikacji ustaw następny krok i jego datę.");
  }

  // 4. Ścieżki plików: przyjmujemy tylko nasze foldery w buckecie documents
  const cvFilePath = text("cv_file_path");
  const snapshotPath = text("offer_snapshot_path");
  if (cvFilePath && !isSafePath(cvFilePath, "cv/")) return fail("Nieprawidłowa ścieżka CV.");
  if (snapshotPath && !isSafePath(snapshotPath, "offers/")) return fail("Nieprawidłowa ścieżka PDF-a oferty.");

  // 5. CV (nieobowiązkowe): nowy plik → nowa wersja w cv_versions; inaczej wybrana z listy albo brak
  let cvVersionId = cvFilePath ? null : text("cv_version_id");
  const cvLanguage = text("cv_language");
  if (cvFilePath && cvLanguage !== "pl" && cvLanguage !== "en") return fail("Wybierz język CV.");

  if (cvFilePath) {
    const { data: cv, error } = await supabase
      .from("cv_versions")
      .insert({
        name: text("cv_name") ?? fileNameFromPath(cvFilePath),
        storage_path: cvFilePath,
        language: cvLanguage,
      })
      .select("id")
      .single();
    if (error || !cv) return fail(`Nie udało się zapisać wersji CV: ${error?.message}`);
    cvVersionId = cv.id;
  }

  // 6. Wiersz szansy
  const offerUrl = text("offer_url");
  const row = {
    type,
    title,
    company,
    contact:
      formatContact({
        name: text("contact_name") ?? "",
        email: text("contact_email") ?? "",
        phone: text("contact_phone") ?? "",
      }) || null,
    source_id: sourceId,
    offer_url: offerUrl ? normalizeUrl(offerUrl) : null,
    offer_text: offerText,
    salary_range: text("salary_range"),
    stage_id: stageId,
    submitted_at: text("submitted_at"),
    next_step: nextStep,
    next_step_at: nextStepAt,
    cv_version_id: cvVersionId,
    notes: text("notes"),
    // Przy edycji bez nowego pliku zostawiamy poprzednią ścieżkę
    ...(snapshotPath ? { offer_snapshot_path: snapshotPath } : {}),
  };

  if (id === null) {
    const { data: created, error } = await supabase
      .from("opportunities")
      .insert(row)
      .select("id")
      .single();
    if (error || !created) return fail(`Nie udało się zapisać aplikacji: ${error?.message}`);

    const { error: historyError } = await supabase
      .from("stage_history")
      .insert({ opportunity_id: created.id, stage_id: stageId, note: "Dodano aplikację" });
    if (historyError) return fail(`Aplikacja zapisana, ale bez historii etapu: ${historyError.message}`);
  } else {
    const { data: before, error: readError } = await supabase
      .from("opportunities")
      .select("stage_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (readError || !before) return fail("Nie znaleziono aplikacji do edycji.");

    const { error } = await supabase.from("opportunities").update(row).eq("id", id);
    if (error) return fail(`Nie udało się zapisać zmian: ${error.message}`);

    // Historia tylko wtedy, gdy etap naprawdę się zmienił
    if (before.stage_id !== stageId) {
      const { error: historyError } = await supabase
        .from("stage_history")
        .insert({ opportunity_id: id, stage_id: stageId });
      if (historyError) return fail(`Zmiany zapisane, ale bez historii etapu: ${historyError.message}`);
    }
  }

  revalidatePath("/");
  return { ok: true };
}

function isSafePath(path: string, prefix: string) {
  return path.startsWith(prefix) && !path.includes("..") && !path.startsWith("/");
}

// "cv/1b2c...-CV_Integracje.pdf" → "CV_Integracje"
function fileNameFromPath(path: string) {
  const file = path.split("/").pop() ?? path;
  return file.replace(/^[0-9a-f-]{36}-/i, "").replace(/\.[^.]+$/, "");
}
