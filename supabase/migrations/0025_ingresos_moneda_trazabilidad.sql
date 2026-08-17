-- Reditus CRM — moneda por ingreso (COP o USD), trazabilidad
-- ingreso→requerimiento, y reinicio de la numeración de ingresos.

alter table public.ingresos
  add column moneda text not null default 'USD' check (moneda in ('USD', 'COP'));

alter table public.requerimientos
  add column ingreso_id uuid references public.ingresos (id) on delete set null;

create index if not exists idx_requerimientos_ingreso_id on public.requerimientos (ingreso_id);

-- Reinicia la numeración de ingresos (#0, #1, #2...) — seguro porque solo
-- hay un ingreso real hoy (#352), muy lejos de volver a colisionar.
alter sequence public.ingreso_tracking_seq minvalue 0 restart with 0;
