-- Greenland Pump Suite – shared Document Library (company documents, pump datasheets, drawings).
-- Every signed-in team member reads and writes the same library. Anonymous visitors get nothing.

create table if not exists public.library_state (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid()
);

create table if not exists public.library_files (
  id text primary key,
  slot text not null,
  name text not null,
  size bigint,
  pages int,
  encrypted boolean not null default false,
  ord double precision not null default 0,
  path text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid()
);
create index if not exists library_files_slot_idx on public.library_files (slot);

alter table public.library_state enable row level security;
alter table public.library_files enable row level security;

drop policy if exists "team read state" on public.library_state;
drop policy if exists "team write state" on public.library_state;
create policy "team read state" on public.library_state for select to authenticated using (true);
create policy "team write state" on public.library_state for all to authenticated using (true) with check (true);

drop policy if exists "team read files" on public.library_files;
drop policy if exists "team write files" on public.library_files;
create policy "team read files" on public.library_files for select to authenticated using (true);
create policy "team write files" on public.library_files for all to authenticated using (true) with check (true);

-- Private storage bucket for the PDFs (50 MB per file).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library', 'library', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "team read library pdfs" on storage.objects;
drop policy if exists "team upload library pdfs" on storage.objects;
drop policy if exists "team update library pdfs" on storage.objects;
drop policy if exists "team delete library pdfs" on storage.objects;
create policy "team read library pdfs" on storage.objects for select to authenticated using (bucket_id = 'library');
create policy "team upload library pdfs" on storage.objects for insert to authenticated with check (bucket_id = 'library');
create policy "team update library pdfs" on storage.objects for update to authenticated using (bucket_id = 'library');
create policy "team delete library pdfs" on storage.objects for delete to authenticated using (bucket_id = 'library');
