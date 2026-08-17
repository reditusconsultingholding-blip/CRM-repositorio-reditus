-- Reditus CRM — reemplaza el enum de estado de requerimientos por texto
-- libre con constraint (más fácil de ajustar sin migraciones de enum), con
-- las opciones exactas de la hoja de cálculo original. Agrega "Pagado" a
-- nivel de requerimiento (además del pago a nivel de ingreso).

alter table public.requerimientos alter column estado drop default;
alter table public.requerimientos alter column estado type text using estado::text;
alter table public.requerimientos alter column estado set default 'Nuevo pedido';

alter table public.requerimientos add constraint requerimientos_estado_check check (estado in (
  'Nuevo pedido', 'En progreso', 'Por revisión', 'Corregir', 'Terminado', 'ENTREGADO',
  'NO LABORADO', 'POR SUBIR', 'ESPERA INFO', 'CORREGIDO', 'NO APROBADO', 'SUBIDA'
));

alter table public.requerimientos
  add column pagado text not null default 'Por terminar'
  check (pagado in ('Sí', 'No', 'Por terminar'));
