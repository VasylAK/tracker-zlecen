-- =========================================================
-- Migracja: init_sales_schema
-- Tracker Zleceń (MyTechSpace, moduł Sprzedaż), krok 2
-- =========================================================

-- 1. Pomocnik: ustawia updated_at na bieżący czas przy każdej zmianie wiersza
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Słownik źródeł ofert (LinkedIn, Useme, ...), edytowalny z aplikacji
create table public.sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

-- 3. Słownik etapów szans: dwie ścieżki (recruitment, service_sales)
create table public.opportunity_stages (
  id          uuid primary key default gen_random_uuid(),
  pipeline    text not null check (pipeline in ('recruitment', 'service_sales')),
  name        text not null,
  position    integer not null,
  outcome     text not null check (outcome in ('open', 'won', 'lost')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (pipeline, name)
);

create trigger opportunity_stages_set_updated_at
  before update on public.opportunity_stages
  for each row execute function public.set_updated_at();

  -- 4. Wersje CV: dokładnie te pliki, które wysłałem
create table public.cv_versions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  storage_path  text not null,
  language      text not null check (language in ('pl', 'en')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create trigger cv_versions_set_updated_at
  before update on public.cv_versions
  for each row execute function public.set_updated_at();

-- 5. Szanse (w aplikacji: aplikacje)
create table public.opportunities (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  type                 text not null check (type in ('employment', 'b2b_contract', 'freelance')),
  company              text not null,
  contact              text,
  source_id            uuid not null references public.sources (id),
  offer_url            text,
  offer_text           text not null check (length(trim(offer_text)) > 0),
  offer_snapshot_path  text,
  salary_range         text,
  stage_id             uuid not null references public.opportunity_stages (id),
  submitted_at         date,
  next_step            text,
  next_step_at         date,
  cv_version_id        uuid references public.cv_versions (id),
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint opportunities_cv_required
    check (type = 'freelance' or cv_version_id is not null)
);

create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

-- 6. Historia etapów: tylko dopisywanie (bez updated_at i deleted_at)
create table public.stage_history (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references public.opportunities (id),
  stage_id        uuid not null references public.opportunity_stages (id),
  changed_at      timestamptz not null default now(),
  note            text,
  created_at      timestamptz not null default now()
);

-- 7. Row Level Security: bez logowania nikt nic nie widzi
alter table public.sources            enable row level security;
alter table public.opportunity_stages enable row level security;
alter table public.cv_versions        enable row level security;
alter table public.opportunities      enable row level security;
alter table public.stage_history      enable row level security;

create policy "authenticated_all" on public.sources
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.opportunity_stages
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.cv_versions
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.opportunities
  for all to authenticated using (true) with check (true);
create policy "authenticated_select" on public.stage_history
  for select to authenticated using (true);
create policy "authenticated_insert" on public.stage_history
  for insert to authenticated with check (true);

-- 8a. Dane słowników: źródła
insert into public.sources (name, position) values
  ('LinkedIn', 10),
  ('Useme', 20),
  ('OLX', 30),
  ('RocketJobs', 40),
  ('Just Join IT', 50),
  ('Pracuj.pl', 60),
  ('Polecenie', 70),
  ('Kontakt bezpośredni', 80),
  ('Inne', 90);

-- 8b. Dane słowników: etapy obu ścieżek
insert into public.opportunity_stages (pipeline, name, position, outcome) values
  ('recruitment', 'Do wysłania',       1, 'open'),
  ('recruitment', 'Wysłane',           2, 'open'),
  ('recruitment', 'Odpowiedź',         3, 'open'),
  ('recruitment', 'Rozmowa',           4, 'open'),
  ('recruitment', 'Zadanie / wycena',  5, 'open'),
  ('recruitment', 'Oferta',            6, 'open'),
  ('recruitment', 'Przyjęte',          7, 'won'),
  ('recruitment', 'Odrzucone',         8, 'lost'),
  ('recruitment', 'Wycofałem się',     9, 'lost'),
  ('recruitment', 'Brak odpowiedzi',  10, 'lost'),
  ('service_sales', 'Nowe zapytanie',   1, 'open'),
  ('service_sales', 'Kwalifikacja',     2, 'open'),
  ('service_sales', 'Wycena wysłana',   3, 'open'),
  ('service_sales', 'Negocjacje',       4, 'open'),
  ('service_sales', 'Wygrana',          5, 'won'),
  ('service_sales', 'Przegrana',        6, 'lost'),
  ('service_sales', 'Wycofałem się',    7, 'lost'),
  ('service_sales', 'Brak odpowiedzi',  8, 'lost');

-- 9. Storage: prywatny bucket na CV i PDF-y ofert (foldery cv/ i offers/)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg']);

create policy "documents_select" on storage.objects
  for select to authenticated using (bucket_id = 'documents');
create policy "documents_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'documents');
create policy "documents_update" on storage.objects
  for update to authenticated using (bucket_id = 'documents') with check (bucket_id = 'documents');
create policy "documents_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'documents');