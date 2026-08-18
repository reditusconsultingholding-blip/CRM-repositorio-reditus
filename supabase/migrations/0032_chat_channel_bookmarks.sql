-- Reditus CRM — marcadores fijados por canal (links o archivos que el
-- equipo necesita siempre a la mano dentro de un canal, tipo "bookmarks"
-- de Slack). Cualquier miembro los ve; solo quien administra el canal
-- (CEO/Gerente Comercial/Directora Operativa) los agrega o quita.
create table public.chat_channel_bookmarks (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  nombre text not null,
  url text not null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.chat_channel_bookmarks enable row level security;

create policy "chat_channel_bookmarks_select" on public.chat_channel_bookmarks
  for select using (
    exists (
      select 1 from public.chat_channel_members m
      where m.channel_id = chat_channel_bookmarks.channel_id and m.user_id = auth.uid()
    )
  );

create policy "chat_channel_bookmarks_manage" on public.chat_channel_bookmarks
  for insert with check (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'));

create policy "chat_channel_bookmarks_delete" on public.chat_channel_bookmarks
  for delete using (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'));

alter publication supabase_realtime add table public.chat_channel_bookmarks;
