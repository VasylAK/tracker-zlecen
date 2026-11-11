-- =========================================================
-- Migracja: cv_optional
-- Tracker Zleceń, krok 3 (decyzja z 11.11.2026)
-- CV przestaje być obowiązkowe przy etacie i B2B: zdarzają się aplikacje bez CV,
-- np. powrót do firmy, z którą już współpracowałem.
-- =========================================================

alter table public.opportunities
  drop constraint opportunities_cv_required;
