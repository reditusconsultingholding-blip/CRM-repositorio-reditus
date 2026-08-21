-- Historial persistente del Asistente CEO — antes vivía solo en memoria del
-- navegador (useState) y se perdía cada vez que se salía de /ceo o se
-- recargaba la página.
create table if not exists public.ceo_asistente_mensajes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ceo_asistente_mensajes_user
  on public.ceo_asistente_mensajes (user_id, created_at);

alter table public.ceo_asistente_mensajes enable row level security;

drop policy if exists "ceo ve su propio historial" on public.ceo_asistente_mensajes;
create policy "ceo ve su propio historial" on public.ceo_asistente_mensajes
  for select using (user_id = auth.uid());

drop policy if exists "ceo escribe su propio historial" on public.ceo_asistente_mensajes;
create policy "ceo escribe su propio historial" on public.ceo_asistente_mensajes
  for insert with check (user_id = auth.uid());

drop policy if exists "ceo borra su propio historial" on public.ceo_asistente_mensajes;
create policy "ceo borra su propio historial" on public.ceo_asistente_mensajes
  for delete using (user_id = auth.uid());
