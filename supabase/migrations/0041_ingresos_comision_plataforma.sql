-- Reditus CRM — comisión que cobra la plataforma de pago por ese ingreso
-- (Wompi, PayU, pasarela, etc.) — para llevar el costo real y mostrarlo
-- discriminado en la cotización/cuenta de cobro que ve el cliente.
alter table public.ingresos
  add column if not exists comision_plataforma numeric(12, 2) not null default 0;
