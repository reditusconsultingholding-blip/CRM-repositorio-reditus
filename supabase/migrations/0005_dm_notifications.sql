-- Reditus CRM — tipo de notificación para mensajes directos del chat interno.
-- Statement standalone a propósito (no se combina con nada que lo use en la
-- misma transacción) — mismo motivo que 0003a: Postgres no deja usar un
-- valor de enum nuevo en la transacción donde se agrega.
alter type public.notification_type add value if not exists 'mensaje_directo';
