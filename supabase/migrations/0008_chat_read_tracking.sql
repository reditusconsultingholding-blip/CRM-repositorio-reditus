-- Reditus CRM — marca de "último chat leído" por usuario, para la
-- burbuja de mensajes pendientes sobre "Chat interno" en la barra lateral.
alter table public.users add column last_chat_read_at timestamptz not null default now();
