-- Reditus CRM — recordatorio opcional por ingreso ("recuérdame en X días
-- sobre esto"). El cron diario existente (api/cron/keepalive) revisa esta
-- columna y avisa cuando se cumple la fecha.
alter table public.ingresos
  add column if not exists recordatorio_fecha timestamptz,
  add column if not exists recordatorio_nota text,
  add column if not exists recordatorio_enviado boolean not null default false;

create index if not exists idx_ingresos_recordatorio_pendiente
  on public.ingresos (recordatorio_fecha)
  where recordatorio_fecha is not null and recordatorio_enviado = false;
