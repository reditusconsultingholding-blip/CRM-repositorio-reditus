-- Reditus CRM — corrige un problema real: requerimientos.pagado YA
-- EXISTÍA como boolean desde el inicio (0001_init.sql). Las migraciones
-- 0027/0029 usaban "add column if not exists pagado text..." que, como la
-- columna ya existía (aunque fuera boolean), NO HIZO NADA — se quedó en
-- boolean, sin las 3 opciones (Sí/No/Por terminar). Esto lo arregla de
-- verdad, convirtiendo el tipo con seguridad tenga los valores que tenga
-- hoy. También agrega la columna PSD que faltaba (solo aplica a landing).

do $$
declare
  col_type text;
begin
  select data_type into col_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'requerimientos' and column_name = 'pagado';

  if col_type = 'boolean' then
    alter table public.requerimientos alter column pagado drop default;
    alter table public.requerimientos alter column pagado type text
      using (case when pagado then 'Sí' else 'Por terminar' end);
    alter table public.requerimientos alter column pagado set default 'Por terminar';
  end if;
end $$;

alter table public.requerimientos drop constraint if exists requerimientos_pagado_check;
alter table public.requerimientos add constraint requerimientos_pagado_check
  check (pagado in ('Sí', 'No', 'Por terminar'));

alter table public.requerimientos add column if not exists psd_url text;

-- Columnas específicas de la hoja "Programador" (publicación de landing
-- pages en tienda/plataforma).
alter table public.requerimientos add column if not exists permisos text;
alter table public.requerimientos add column if not exists plataforma text;
alter table public.requerimientos add column if not exists tienda text;
alter table public.requerimientos add column if not exists oferta_precios text;
alter table public.requerimientos add column if not exists link_producto_imagen text;
alter table public.requerimientos add column if not exists link_pagina_subida text;

