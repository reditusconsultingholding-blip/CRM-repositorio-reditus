-- Reditus CRM — editar mensajes y adjuntar archivos en el chat interno.
alter table public.chat_messages add column edited_at timestamptz;
alter table public.chat_messages add column attachment_url text;
alter table public.chat_messages add column attachment_name text;
alter table public.chat_messages add column attachment_size bigint;

-- Solo el autor puede editar su propio mensaje.
create policy "chat_messages_update_own" on public.chat_messages
  for update using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Bucket público para archivos compartidos en el chat.
insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', true)
on conflict (id) do nothing;

create policy "chat_files_public_read" on storage.objects
  for select using (bucket_id = 'chat-files');

create policy "chat_files_insert_own" on storage.objects
  for insert with check (bucket_id = 'chat-files' and owner = auth.uid());

create policy "chat_files_delete_own" on storage.objects
  for delete using (bucket_id = 'chat-files' and owner = auth.uid());
