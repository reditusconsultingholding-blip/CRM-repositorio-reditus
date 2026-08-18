-- Reditus CRM — permite apagar el agente de IA en una conversación
-- puntual de WhatsApp para que un humano tome el control (sin dejar de
-- recibir los mensajes, solo deja de responder solo). Default true —
-- todas las conversaciones existentes y nuevas siguen respondiendo
-- automáticamente a menos que alguien lo apague.
alter table public.prospectos
  add column if not exists bot_activo boolean not null default true;
