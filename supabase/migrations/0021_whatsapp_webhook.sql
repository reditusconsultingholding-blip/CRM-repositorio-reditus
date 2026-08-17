-- Reditus CRM — historial de conversación de WhatsApp por prospecto, para
-- que el agente de ventas tenga contexto de los mensajes anteriores.
alter table public.prospectos add column historial_whatsapp jsonb not null default '[]'::jsonb;
