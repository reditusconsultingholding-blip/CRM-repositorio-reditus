-- Reditus CRM — "fijar" en un canal ahora admite 3 tipos, no solo link:
-- link, nota (texto libre) y recordatorio (con fecha/hora opcional).
-- Máximo 3 elementos fijados por canal, para que la barra no se sature.
alter table public.chat_channel_bookmarks
  add column if not exists tipo text not null default 'link' check (tipo in ('link', 'nota', 'recordatorio')),
  add column if not exists nota text,
  add column if not exists recordatorio_en timestamptz;

-- El link ya no es obligatorio cuando el tipo es nota o recordatorio.
alter table public.chat_channel_bookmarks alter column url drop not null;
