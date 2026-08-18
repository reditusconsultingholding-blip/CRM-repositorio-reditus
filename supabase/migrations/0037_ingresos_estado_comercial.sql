-- Reditus CRM — separa la etapa "Cotización" de "Cierre" en Ingresos
-- (etapas 2 y 3 del flujo comercial). Default 'Cerrado' para no cambiar
-- el comportamiento de ningún ingreso ya existente ni de los que se sigan
-- creando de la forma normal (pedido ya confirmado) — solo cuando alguien
-- marca explícitamente "todavía es una cotización" queda en 'Cotizado' y
-- se excluye de las sumas de ingresos hasta que se cierre.
alter table public.ingresos
  add column if not exists estado_comercial text not null default 'Cerrado'
  check (estado_comercial in ('Cotizado', 'Cerrado'));

create index if not exists ingresos_estado_comercial_idx on public.ingresos (estado_comercial);
