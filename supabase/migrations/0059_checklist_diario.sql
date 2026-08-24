-- Checklist diario por rol — para que a nadie se le olviden sus tareas
-- del día. checklist_items es la plantilla (editable por el CEO);
-- checklist_marcas guarda, por persona y por día, cuáles ya marcó.
create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  texto text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_marcas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  item_id uuid not null references public.checklist_items (id) on delete cascade,
  fecha date not null default current_date,
  completado boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, item_id, fecha)
);

alter table public.checklist_items enable row level security;
alter table public.checklist_marcas enable row level security;

-- Cualquiera con sesión puede LEER la plantilla (para ver su propio
-- checklist), pero solo el CEO puede editarla.
drop policy if exists "lee plantilla de checklist" on public.checklist_items;
create policy "lee plantilla de checklist" on public.checklist_items
  for select using (auth.uid() is not null);

drop policy if exists "ceo administra plantilla de checklist" on public.checklist_items;
create policy "ceo administra plantilla de checklist" on public.checklist_items
  for all using (public.current_role() = 'ceo') with check (public.current_role() = 'ceo');

drop policy if exists "ve sus propias marcas de checklist" on public.checklist_marcas;
create policy "ve sus propias marcas de checklist" on public.checklist_marcas
  for select using (user_id = auth.uid());

drop policy if exists "marca su propio checklist" on public.checklist_marcas;
create policy "marca su propio checklist" on public.checklist_marcas
  for insert with check (user_id = auth.uid());

drop policy if exists "quita su propia marca de checklist" on public.checklist_marcas;
create policy "quita su propia marca de checklist" on public.checklist_marcas
  for delete using (user_id = auth.uid());

-- Plantilla inicial — un punto de partida razonable por rol, editable
-- después desde la app (CEO → Checklist → Administrar).
insert into public.checklist_items (role, texto, orden)
select * from (values
  ('gerente_comercial', 'Revisar prospectos nuevos y darles seguimiento', 1),
  ('gerente_comercial', 'Dar seguimiento a cotizaciones pendientes de cierre', 2),
  ('gerente_comercial', 'Confirmar y cerrar los tratos del día en Ingresos', 3),
  ('gerente_comercial', 'Revisar recordatorios de cobro pendientes en Ingresos', 4),
  ('gerente_comercial', 'Marcar como "Pagado" los ingresos que ya cobraron', 5),

  ('directora_operativa', 'Revisar requerimientos nuevos sin asignar', 1),
  ('directora_operativa', 'Asignar encargado y fecha de entrega a lo nuevo', 2),
  ('directora_operativa', 'Revisar el chat de correcciones pendientes', 3),
  ('directora_operativa', 'Control de calidad de los requerimientos "Por revisión"', 4),
  ('directora_operativa', 'Revisar el checklist de nómina de la semana (si aplica)', 5),

  ('editor_video', 'Revisar mis videos asignados "En progreso"', 1),
  ('editor_video', 'Subir a la carpeta de Drive los videos ya terminados', 2),
  ('editor_video', 'Marcar como completados los que ya entregué', 3),

  ('disenador_landing', 'Revisar mis landing pages asignadas "En progreso"', 1),
  ('disenador_landing', 'Subir el PSD de lo que vaya terminando', 2),
  ('disenador_landing', 'Pasar a "Por revisión" lo que ya esté listo', 3),

  ('programador', 'Revisar la cola de landing pages "POR SUBIR"', 1),
  ('programador', 'Publicar las páginas listas en la plataforma del cliente', 2),
  ('programador', 'Marcar como entregado lo ya publicado', 3),

  ('ceo', 'Revisar el Panel CEO (rentabilidad y estado de la plataforma)', 1),
  ('ceo', 'Revisar los ingresos nuevos del día', 2),
  ('ceo', 'Revisar el checklist de nómina si es lunes', 3)
) as v(role, texto, orden)
where not exists (select 1 from public.checklist_items);
