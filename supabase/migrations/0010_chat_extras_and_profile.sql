-- Reditus CRM — reacciones y respuestas en el chat, foto de perfil y datos
-- adicionales de usuario.

-- ─────────────────────────────────────────────────────────────────────────
-- Chat: responder a un mensaje específico
-- ─────────────────────────────────────────────────────────────────────────
alter table public.chat_messages add column reply_to_id uuid references public.chat_messages (id);

-- ─────────────────────────────────────────────────────────────────────────
-- Chat: reacciones con emoji (un usuario, un emoji, un mensaje — sin repetir)
-- ─────────────────────────────────────────────────────────────────────────
create table public.chat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  user_id uuid not null references public.users (id),
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

alter table public.chat_message_reactions enable row level security;

create policy "chat_reactions_select_all_authenticated" on public.chat_message_reactions
  for select using (auth.uid() is not null);

create policy "chat_reactions_insert_own" on public.chat_message_reactions
  for insert with check (user_id = auth.uid());

create policy "chat_reactions_delete_own" on public.chat_message_reactions
  for delete using (user_id = auth.uid());

alter publication supabase_realtime add table public.chat_message_reactions;

-- Por defecto Postgres solo incluye la llave primaria en el "old record" de
-- eventos UPDATE/DELETE de replicación (lo que usa Realtime). Necesitamos
-- message_id/emoji/user_id completos cuando alguien quita una reacción, así
-- que forzamos identidad completa en esta tabla.
alter table public.chat_message_reactions replica identity full;

-- Permitir borrar el propio mensaje de chat (canal o directo).
create policy "chat_messages_delete_own" on public.chat_messages
  for delete using (author_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- Perfil: foto, fecha de nacimiento, teléfono
-- ─────────────────────────────────────────────────────────────────────────
alter table public.users add column avatar_url text;
alter table public.users add column birthdate date;
alter table public.users add column phone text;

-- Autoservicio: cualquier usuario puede actualizar SU PROPIA fila (para
-- last_chat_read_at, foto, fecha de nacimiento, etc. — la política
-- original solo dejaba escribir al CEO). Un trigger evita que alguien se
-- autoescale rol/estado/correo por esta vía.
create policy "users_update_own_limited" on public.users
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  -- OJO: "is distinct from" trata null como distinto de 'ceo' (TRUE), lo
  -- cual bloquearía por error las escrituras hechas con el cliente admin
  -- (service role, sin auth.uid() -> current_role() = null) — ahí es
  -- exactamente donde vive /admin/usuarios (crear usuario, cambiar rol,
  -- activar/desactivar) y changeMyEmail. Por eso el guard solo aplica
  -- cuando SÍ sabemos que quien escribe es un usuario autenticado que no
  -- es CEO; null (contexto admin/backend, de confianza) pasa de largo.
  if public.current_role() is not null and public.current_role() <> 'ceo' then
    new.role := old.role;
    new.active := old.active;
    new.email := old.email;
  end if;
  return new;
end;
$$;

create trigger prevent_self_privilege_escalation
  before update on public.users
  for each row execute function public.prevent_self_privilege_escalation();

-- ─────────────────────────────────────────────────────────────────────────
-- Storage: bucket público para fotos de perfil
-- ─────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_insert_own" on storage.objects
  for insert with check (bucket_id = 'avatars' and owner = auth.uid());

create policy "avatars_update_own" on storage.objects
  for update using (bucket_id = 'avatars' and owner = auth.uid());

create policy "avatars_delete_own" on storage.objects
  for delete using (bucket_id = 'avatars' and owner = auth.uid());
