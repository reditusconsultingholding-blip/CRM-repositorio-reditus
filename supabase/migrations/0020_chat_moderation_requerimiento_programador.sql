-- Reditus CRM — el CEO puede borrar cualquier mensaje de chat (moderación),
-- no solo los propios. Reemplaza la política que solo dejaba al autor.
drop policy "chat_messages_delete_own" on public.chat_messages;

create policy "chat_messages_delete_own_or_ceo" on public.chat_messages
  for delete using (author_id = auth.uid() or public.current_role() = 'ceo');
