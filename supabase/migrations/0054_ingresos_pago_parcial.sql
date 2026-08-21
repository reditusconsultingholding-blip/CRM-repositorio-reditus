-- Modalidad de pago: completo (default, comportamiento de siempre) o
-- parcial — cuánto pagó ahora y para cuándo se comprometió a pagar el
-- resto. El % pagado y el saldo se calculan en la app, no se guardan.
alter table public.ingresos
  add column if not exists modalidad_pago text not null default 'completo',
  add column if not exists monto_pagado numeric,
  add column if not exists fecha_compromiso_saldo date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ingresos_modalidad_pago_check'
  ) then
    alter table public.ingresos
      add constraint ingresos_modalidad_pago_check check (modalidad_pago in ('completo', 'parcial'));
  end if;
end $$;
