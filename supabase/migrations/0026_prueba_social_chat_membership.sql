-- Reditus CRM — Prueba Social (Apto/No apto/Subido) en requerimientos +
-- membresía de canales de chat (solo ciertos roles pueden agregar gente).

alter table public.requerimientos
  add column prueba_social text not null default 'Pendiente'
  check (prueba_social in ('Pendiente', 'Apto', 'No apto', 'Subido'));

-- ─────────────────────────────────────────────────────────────────────────
-- Membresía de canales: quién pertenece a cada canal. Antes cualquier
-- autenticado veía todos los canales — ahora solo ve los que integra.
-- ─────────────────────────────────────────────────────────────────────────
create table public.chat_channel_members (
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

alter table public.chat_channel_members enable row level security;

create policy "chat_channel_members_select" on public.chat_channel_members
  for select using (auth.uid() is not null);

-- Solo CEO / Gerente Comercial / Directora Operativa pueden agregar o
-- quitar gente de un canal.
create policy "chat_channel_members_manage" on public.chat_channel_members
  for all using (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'))
  with check (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'));

-- Mantiene el comportamiento actual: todo el mundo sigue viendo los 4
-- canales que ya existían (se mete a todos los usuarios activos).
insert into public.chat_channel_members (channel_id, user_id)
select c.id, u.id from public.chat_channels c cross join public.users u where u.active = true
on conflict do nothing;

-- Crear/borrar canales: mismos 3 roles.
create policy "chat_channels_manage" on public.chat_channels
  for insert with check (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'));

create policy "chat_channels_delete" on public.chat_channels
  for delete using (public.current_role() = 'ceo');

-- Leer/escribir mensajes de canal ahora exige ser miembro (antes era
-- "cualquier autenticado").
drop policy "chat_messages_channel_select" on public.chat_messages;
create policy "chat_messages_channel_select" on public.chat_messages
  for select using (
    channel_id is not null
    and exists (
      select 1 from public.chat_channel_members m
      where m.channel_id = chat_messages.channel_id and m.user_id = auth.uid()
    )
  );

drop policy "chat_messages_channel_insert" on public.chat_messages;
create policy "chat_messages_channel_insert" on public.chat_messages
  for insert with check (
    channel_id is not null
    and author_id = auth.uid()
    and exists (
      select 1 from public.chat_channel_members m
      where m.channel_id = chat_messages.channel_id and m.user_id = auth.uid()
    )
  );

alter publication supabase_realtime add table public.chat_channel_members;
