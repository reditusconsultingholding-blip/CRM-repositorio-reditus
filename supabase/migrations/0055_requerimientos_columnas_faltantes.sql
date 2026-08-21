-- CRÍTICO: /requerimientos lleva rota en producción porque estas 8
-- columnas nunca se crearon (las migraciones 0026/0029/0030 las definían
-- pero nunca se corrieron) — la consulta de la página fallaba por completo
-- ("column requerimientos.prueba_social does not exist"), así que la
-- tabla siempre se veía vacía en las 4 pestañas de pipeline y en la de
-- Programador, sin ningún error visible para el usuario.
alter table public.requerimientos add column if not exists prueba_social text not null default 'Pendiente';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'requerimientos_prueba_social_check'
  ) then
    alter table public.requerimientos
      add constraint requerimientos_prueba_social_check
      check (prueba_social in ('Pendiente', 'Apto', 'No apto', 'Subido'));
  end if;
end $$;

alter table public.requerimientos add column if not exists psd_url text;
alter table public.requerimientos add column if not exists permisos text;
alter table public.requerimientos add column if not exists plataforma text;
alter table public.requerimientos add column if not exists tienda text;
alter table public.requerimientos add column if not exists oferta_precios text;
alter table public.requerimientos add column if not exists link_producto_imagen text;
alter table public.requerimientos add column if not exists link_pagina_subida text;
