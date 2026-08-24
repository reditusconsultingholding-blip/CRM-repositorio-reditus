-- Reto 75 Hard (Andy Frisella) — tracker personal por usuario. Cada
-- intento ("run") genera sus 75 días de una vez; si falla un día, se
-- reinicia el conteo (regla del reto), lo que archiva el run activo como
-- "fallido" y arranca uno nuevo desde el día 1.
create table if not exists public.reto75_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  numero_intento integer not null,
  fecha_inicio date not null,
  estado text not null default 'activo' check (estado in ('activo', 'completado', 'fallido')),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_reto75_runs_user_intento
  on public.reto75_runs (user_id, numero_intento);

-- Solo un intento activo a la vez por persona.
create unique index if not exists idx_reto75_runs_activo_unico
  on public.reto75_runs (user_id)
  where estado = 'activo';

create table if not exists public.reto75_dias (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.reto75_runs (id) on delete cascade,
  dia_numero integer not null check (dia_numero between 1 and 75),
  fecha date not null,
  dieta boolean not null default false,
  entreno1 boolean not null default false,
  entreno2_outdoor boolean not null default false,
  agua boolean not null default false,
  lectura boolean not null default false,
  foto_url text,
  updated_at timestamptz not null default now(),
  unique (run_id, dia_numero)
);

alter table public.reto75_runs enable row level security;
alter table public.reto75_dias enable row level security;

drop policy if exists "ve sus propios runs de reto75" on public.reto75_runs;
create policy "ve sus propios runs de reto75" on public.reto75_runs
  for select using (user_id = auth.uid());

drop policy if exists "crea sus propios runs de reto75" on public.reto75_runs;
create policy "crea sus propios runs de reto75" on public.reto75_runs
  for insert with check (user_id = auth.uid());

drop policy if exists "actualiza sus propios runs de reto75" on public.reto75_runs;
create policy "actualiza sus propios runs de reto75" on public.reto75_runs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "ve sus propios dias de reto75" on public.reto75_dias;
create policy "ve sus propios dias de reto75" on public.reto75_dias
  for select using (exists (select 1 from public.reto75_runs r where r.id = run_id and r.user_id = auth.uid()));

drop policy if exists "crea sus propios dias de reto75" on public.reto75_dias;
create policy "crea sus propios dias de reto75" on public.reto75_dias
  for insert with check (exists (select 1 from public.reto75_runs r where r.id = run_id and r.user_id = auth.uid()));

drop policy if exists "actualiza sus propios dias de reto75" on public.reto75_dias;
create policy "actualiza sus propios dias de reto75" on public.reto75_dias
  for update using (exists (select 1 from public.reto75_runs r where r.id = run_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.reto75_runs r where r.id = run_id and r.user_id = auth.uid()));

-- Fotos del día a día — carpeta por usuario, cada quien solo sube/borra
-- dentro de la suya (mismo patrón de propiedad que ya usa avatars).
insert into storage.buckets (id, name, public)
values ('reto75-fotos', 'reto75-fotos', true)
on conflict (id) do nothing;

drop policy if exists "reto75_fotos_public_read" on storage.objects;
create policy "reto75_fotos_public_read" on storage.objects
  for select using (bucket_id = 'reto75-fotos');

drop policy if exists "reto75_fotos_insert_propio" on storage.objects;
create policy "reto75_fotos_insert_propio" on storage.objects
  for insert with check (bucket_id = 'reto75-fotos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "reto75_fotos_delete_propio" on storage.objects;
create policy "reto75_fotos_delete_propio" on storage.objects
  for delete using (bucket_id = 'reto75-fotos' and (storage.foldername(name))[1] = auth.uid()::text);
