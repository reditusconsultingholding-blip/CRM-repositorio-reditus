-- Reditus CRM — paso 2b: servicios combinados (ingreso_items) y chat interno.
-- Correr después de 0003a_programador_role.sql (en una query nueva, una vez
-- que el paso 2a haya confirmado "Success").

-- ─────────────────────────────────────────────────────────────────────────
-- requerimientos: encargado del diseño (encargado_id) vs. quién la publica
-- ─────────────────────────────────────────────────────────────────────────
alter table public.requerimientos add column programador_id uuid references public.users (id);

-- ─────────────────────────────────────────────────────────────────────────
-- Servicios combinados: un ingreso puede tener varias líneas
-- (ej. 10 landing pages + 10 videos, cada una con su propio precio)
-- ─────────────────────────────────────────────────────────────────────────
create table public.ingreso_items (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null references public.ingresos (id) on delete cascade,
  servicio text,
  producto text not null,
  cantidad integer not null default 1,
  precio_unitario numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.ingreso_items enable row level security;

create policy "ingreso_items_ceo_gc_only" on public.ingreso_items
  for all using (public.can_see_ingresos())
  with check (public.can_see_ingresos());

-- ─────────────────────────────────────────────────────────────────────────
-- Chat interno (tipo Slack): canales fijos + mensajes
-- ─────────────────────────────────────────────────────────────────────────
create table public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.chat_channels (slug, name) values
  ('grupo-operativo', 'Grupo Operativo'),
  ('editores-video', 'Editores de Video'),
  ('editores-landing', 'Editores de Landing'),
  ('programador', 'Programador');

-- Un mensaje pertenece a un canal (channel_id) O es un mensaje directo entre
-- dos usuarios (recipient_id) — nunca ambos ni ninguno.
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.chat_channels (id) on delete cascade,
  recipient_id uuid references public.users (id),
  author_id uuid not null references public.users (id),
  body text not null,
  created_at timestamptz not null default now(),
  constraint chat_messages_target_check check (
    (channel_id is not null and recipient_id is null) or
    (channel_id is null and recipient_id is not null)
  )
);

alter table public.chat_channels enable row level security;
alter table public.chat_messages enable row level security;

create policy "chat_channels_select_all_authenticated" on public.chat_channels
  for select using (auth.uid() is not null);

-- Mensajes de canal: cualquier autenticado los lee y escribe (canales
-- públicos internos, como en Slack).
create policy "chat_messages_channel_select" on public.chat_messages
  for select using (channel_id is not null and auth.uid() is not null);

create policy "chat_messages_channel_insert" on public.chat_messages
  for insert with check (channel_id is not null and author_id = auth.uid());

-- Mensajes directos: solo emisor y destinatario pueden verlos.
create policy "chat_messages_dm_select" on public.chat_messages
  for select using (
    recipient_id is not null and (author_id = auth.uid() or recipient_id = auth.uid())
  );

create policy "chat_messages_dm_insert" on public.chat_messages
  for insert with check (recipient_id is not null and author_id = auth.uid());

-- Realtime for the chat (notifications table is already enabled from 0001).
alter publication supabase_realtime add table public.chat_messages;

-- ─────────────────────────────────────────────────────────────────────────
-- Permisos: el nuevo rol "programador" entra al mismo grupo que ya
-- ve Requerimientos (no Ingresos).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.can_see_requerimientos()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_role() in (
    'ceo', 'gerente_comercial', 'directora_operativa',
    'editor_video', 'disenador_landing', 'programador'
  );
$$;
