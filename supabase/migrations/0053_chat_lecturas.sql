-- Lectura por canal/DM — antes solo existía un timestamp global
-- (users.last_chat_read_at) que se marcaba con solo abrir /chat, sin
-- importar qué canal se veía. Ahora cada canal y cada conversación directa
-- se marca leída por separado, así el indicador de "no leído" en el chat
-- muestra exactamente de dónde viene el mensaje nuevo y desaparece solo
-- para esa conversación al entrar a ella.
create table if not exists public.chat_lecturas (
  user_id uuid not null references public.users (id) on delete cascade,
  -- 'canal:<channel_id>' para canales, 'dm:<other_user_id>' para directos.
  clave text not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, clave)
);

alter table public.chat_lecturas enable row level security;

drop policy if exists "lee su propio estado de lectura" on public.chat_lecturas;
create policy "lee su propio estado de lectura" on public.chat_lecturas
  for select using (user_id = auth.uid());

drop policy if exists "escribe su propio estado de lectura" on public.chat_lecturas;
create policy "escribe su propio estado de lectura" on public.chat_lecturas
  for insert with check (user_id = auth.uid());

drop policy if exists "actualiza su propio estado de lectura" on public.chat_lecturas;
create policy "actualiza su propio estado de lectura" on public.chat_lecturas
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
