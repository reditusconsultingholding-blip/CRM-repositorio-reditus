-- Cliente que refirió el nuevo ingreso + comisión por ese referido
-- (~10% sugerido, editable por línea de ingreso).
alter table public.ingresos
  add column if not exists referido_por_client_id uuid references public.clients(id) on delete set null,
  add column if not exists comision_referido numeric;

create index if not exists idx_ingresos_referido_por on public.ingresos(referido_por_client_id);
