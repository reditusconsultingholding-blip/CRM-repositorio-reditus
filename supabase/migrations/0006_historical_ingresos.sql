-- Reditus CRM — histórico de ingresos importado de las hojas de cálculo
-- (2024-2025-2026), separado de `ingresos` a propósito: `ingresos` alimenta
-- el dashboard/rentabilidad de la semana/mes actual, y mezclar años de
-- historial ahí distorsionaría esas métricas. Esta tabla es solo para
-- analítica de clientes (gasto histórico, AOV) y contexto del asistente CEO.
create table public.historical_ingresos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id),
  cliente_nombre_original text not null,
  fecha date,
  servicio text,
  producto text,
  pais text,
  precio_usd_aprox numeric(12, 2) not null default 0,
  moneda_original text,
  monto_original numeric(14, 2),
  estado_pago text,
  fuente text not null default 'import_csv_2024_2026',
  created_at timestamptz not null default now()
);

alter table public.historical_ingresos enable row level security;

create policy "historical_ingresos_ceo_gc_only" on public.historical_ingresos
  for all using (public.can_see_ingresos())
  with check (public.can_see_ingresos());

create index if not exists idx_historical_ingresos_client_id
  on public.historical_ingresos (client_id);
create index if not exists idx_historical_ingresos_fecha
  on public.historical_ingresos (fecha);
