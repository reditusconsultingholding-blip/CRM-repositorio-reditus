-- Últimas dos tablas que faltaban desde hace mucho (0026/0028 nunca se
-- corrieron): membresía de canales de chat y encuestas de calidad post-
-- entrega (con eso, el seguimiento de recompra funciona de verdad).
create table if not exists public.chat_channel_members (
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
alter table public.chat_channel_members enable row level security;

drop policy if exists "chat_channel_members_select" on public.chat_channel_members;
create policy "chat_channel_members_select" on public.chat_channel_members
  for select using (auth.uid() is not null);

drop policy if exists "chat_channel_members_manage" on public.chat_channel_members;
create policy "chat_channel_members_manage" on public.chat_channel_members
  for all using (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'))
  with check (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'));

insert into public.chat_channel_members (channel_id, user_id)
select c.id, u.id from public.chat_channels c cross join public.users u where u.active = true
on conflict do nothing;

create table if not exists public.encuestas_calidad (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null unique references public.ingresos (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  token text not null unique,
  puntuacion smallint check (puntuacion between 1 and 5),
  comentario text,
  quiere_testimonio boolean not null default false,
  respondido_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.encuestas_calidad enable row level security;

drop policy if exists "encuestas_calidad_ceo_gc_only" on public.encuestas_calidad;
create policy "encuestas_calidad_ceo_gc_only" on public.encuestas_calidad
  for all using (public.can_see_ingresos()) with check (public.can_see_ingresos());

create index if not exists idx_encuestas_calidad_token on public.encuestas_calidad (token);

-- CRÍTICO para "tiempo real" de verdad: ingresos, requerimientos y
-- notifications nunca se agregaron a la publicación de Realtime de
-- Supabase — sin esto, postgres_changes nunca dispara para ellas y todo
-- dependía solo del refresco cada 5 segundos de LiveSync (o, en el caso
-- de la campanita, de recargar la página — no había ningún refresco).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ingresos'
  ) then
    alter publication supabase_realtime add table public.ingresos;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'requerimientos'
  ) then
    alter publication supabase_realtime add table public.requerimientos;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_channel_members'
  ) then
    alter publication supabase_realtime add table public.chat_channel_members;
  end if;
end $$;
