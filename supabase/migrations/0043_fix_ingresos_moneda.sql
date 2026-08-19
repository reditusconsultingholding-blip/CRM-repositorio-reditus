-- Reditus CRM — arregla que a la columna 'moneda' de ingresos le faltó
-- aplicarse en producción (la migración 0025 quedó incompleta ahí) —
-- causaba "Could not find the 'moneda' column of 'ingresos'" al crear un
-- ingreso nuevo. Idempotente: no rompe nada si ya existe.
alter table public.ingresos
  add column if not exists moneda text not null default 'USD' check (moneda in ('USD', 'COP'));
