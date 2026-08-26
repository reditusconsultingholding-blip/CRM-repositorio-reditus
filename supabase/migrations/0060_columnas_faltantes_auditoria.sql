-- Auditoría completa: probé cada columna que el código espera contra
-- producción y encontré estas 6 sin crear (mismo problema que ya
-- arreglamos varias veces — migraciones escritas pero nunca corridas).
alter table public.clients
  add column if not exists historico_pedidos_ajuste integer,
  add column if not exists historico_gasto_ajuste_usd numeric;

alter table public.ingresos
  add column if not exists recompra_enviado_at timestamptz,
  add column if not exists ciclo_cerrado boolean not null default false;

alter table public.prospectos
  add column if not exists historial_whatsapp jsonb not null default '[]'::jsonb;

alter table public.user_payroll_rates
  add column if not exists activo boolean not null default true;
