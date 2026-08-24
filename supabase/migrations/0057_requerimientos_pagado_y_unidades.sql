-- 1) requerimientos.pagado seguía siendo boolean en producción (la
-- migración 0030 que lo arreglaba nunca se corrió) — por eso se veía el
-- texto crudo "false" en vez de "Sí"/"No"/"Por terminar".
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

-- 2) Un pedido de "10 videos" o "20 landing pages" ahora es UN solo
-- requerimiento (antes se creaba una fila por unidad, inundando la
-- tabla) — con un desglose de unidades adentro para trackear cada una.
alter table public.requerimientos add column if not exists cantidad integer not null default 1;

create table if not exists public.requerimiento_unidades (
  id uuid primary key default gen_random_uuid(),
  requerimiento_id uuid not null references public.requerimientos (id) on delete cascade,
  unidad_numero integer not null,
  completado boolean not null default false,
  link_entrega text,
  notas text,
  created_at timestamptz not null default now(),
  unique (requerimiento_id, unidad_numero)
);

alter table public.requerimiento_unidades enable row level security;

drop policy if exists "requerimiento_unidades_all_roles" on public.requerimiento_unidades;
create policy "requerimiento_unidades_all_roles" on public.requerimiento_unidades
  for all using (public.can_see_requerimientos())
  with check (public.can_see_requerimientos());
