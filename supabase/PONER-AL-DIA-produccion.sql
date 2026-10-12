-- ═════════════════════════════════════════════════════════════════════════
-- Reditus CRM — PONER AL DÍA LA BASE DE PRODUCCIÓN (un solo archivo)
--
-- Junta todo lo que las migraciones 0009 y 0018…0063 definen y que en
-- producción nunca se aplicó (o no se puede comprobar desde fuera).
--
-- CÓMO USARLO: Supabase → proyecto del CRM → SQL Editor → New query →
-- pegar TODO este archivo → Run. Al final debe salir una fila que dice
-- "LISTO". Se puede volver a correr las veces que haga falta: no duplica
-- datos ni rompe nada.
--
-- QUÉ NO HACE: no borra tablas, columnas ni filas; no cambia el tipo de
-- ninguna columna; no reinicia la numeración de ingresos, cotizaciones ni
-- cuentas de cobro (migraciones 0025 y 0050, dejadas fuera a propósito).
--
-- Todo va dentro de una transacción: si algo fallara, no queda nada a
-- medias (la base queda exactamente como estaba).
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. FUNCIONES
-- ─────────────────────────────────────────────────────────────────────────

-- Ya existe (0001); se redefine idéntica para garantizar que los triggers
-- de más abajo la encuentren.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ⚠ AMPLÍA ACCESO A DINERO (migración 0046, confirmado por el dueño):
-- la Directora Operativa pasa a ver y editar Ingresos, Clientes,
-- Prospectos, el histórico de ingresos, las líneas de cada ingreso y las
-- encuestas de calidad — igual que CEO y Gerente Comercial. Es el único
-- cambio de este archivo que da acceso nuevo a información de ventas.
create or replace function public.can_see_ingresos()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa');
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. VALORES DE ENUM QUE FALTAN
-- (solo se agregan; nada de este archivo los usa, así que cabe todo en una
-- sola transacción sin el error "unsafe use of new value")
-- ─────────────────────────────────────────────────────────────────────────

-- 0009: recordatorios automáticos del cron diario.
alter type public.notification_type add value if not exists 'recordatorio_costos';
alter type public.notification_type add value if not exists 'nomina_lista';
-- 0028/0029: aviso cuando un cliente responde la encuesta de calidad.
alter type public.notification_type add value if not exists 'encuesta_respondida';
-- Ya están en producción; se repiten por si acaso (no hacen nada si existen).
alter type public.notification_type add value if not exists 'mensaje_directo';
alter type public.notification_type add value if not exists 'recomendacion_ceo';
alter type public.notification_type add value if not exists 'recordatorio_ingreso';

-- 0040 / 0063: servicios "Claude" e "Imágenes Ads".
alter type public.requerimiento_pipeline add value if not exists 'claude';
alter type public.requerimiento_pipeline add value if not exists 'imagenes_ads';

-- 0027 (versión NO destructiva): en producción requerimientos.estado sigue
-- siendo un enum (la 0027, que lo pasaba a texto, nunca se aplicó) y le
-- faltan cuatro estados que la app sí ofrece. En vez de cambiar el tipo de
-- la columna, se agregan los valores que faltan.
alter type public.requerimiento_estado add value if not exists 'NO LABORADO';
alter type public.requerimiento_estado add value if not exists 'POR SUBIR';
alter type public.requerimiento_estado add value if not exists 'CORREGIDO';
alter type public.requerimiento_estado add value if not exists 'NO APROBADO';
alter type public.requerimiento_estado add value if not exists 'SUBIDA';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. COLUMNAS QUE FALTAN EN TABLAS QUE YA EXISTEN
-- ─────────────────────────────────────────────────────────────────────────

-- 0021 / 0060
alter table public.prospectos
  add column if not exists historial_whatsapp jsonb not null default '[]'::jsonb;

-- 0023 / 0034 / 0060
alter table public.user_payroll_rates
  add column if not exists activo boolean not null default true;

-- 0033 / 0060
alter table public.clients
  add column if not exists historico_pedidos_ajuste integer,
  add column if not exists historico_gasto_ajuste_usd numeric;

-- 0028 / 0060
alter table public.ingresos
  add column if not exists recompra_enviado_at timestamptz,
  add column if not exists ciclo_cerrado boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. CHAT: MEMBRESÍA DE CANALES (0026 / 0029 / 0061)
-- ─────────────────────────────────────────────────────────────────────────

-- La tabla se crea y, SOLO si es nueva en esta corrida, se mete a todos los
-- usuarios activos en todos los canales (para que nadie pierda de vista los
-- canales que ya tenía). En corridas posteriores no se vuelve a meter a
-- nadie: se respeta a quien se haya sacado de un canal desde la app.
do $$
declare
  es_nueva boolean := to_regclass('public.chat_channel_members') is null;
begin
  create table if not exists public.chat_channel_members (
    channel_id uuid not null references public.chat_channels (id) on delete cascade,
    user_id uuid not null references public.users (id) on delete cascade,
    added_at timestamptz not null default now(),
    primary key (channel_id, user_id)
  );

  if es_nueva then
    insert into public.chat_channel_members (channel_id, user_id)
    select c.id, u.id
    from public.chat_channels c
    cross join public.users u
    where u.active = true
    on conflict do nothing;
  end if;
end $$;

alter table public.chat_channel_members enable row level security;

drop policy if exists "chat_channel_members_select" on public.chat_channel_members;
create policy "chat_channel_members_select" on public.chat_channel_members
  for select using (auth.uid() is not null);

drop policy if exists "chat_channel_members_manage" on public.chat_channel_members;
create policy "chat_channel_members_manage" on public.chat_channel_members
  for all using (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'))
  with check (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'));

-- Crear canales: CEO / Gerente Comercial / Directora Operativa. Borrarlos: CEO.
drop policy if exists "chat_channels_manage" on public.chat_channels;
create policy "chat_channels_manage" on public.chat_channels
  for insert with check (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'));

drop policy if exists "chat_channels_delete" on public.chat_channels;
create policy "chat_channels_delete" on public.chat_channels
  for delete using (public.current_role() = 'ceo');

-- Leer / escribir mensajes de un canal exige ser miembro de ese canal.
drop policy if exists "chat_messages_channel_select" on public.chat_messages;
create policy "chat_messages_channel_select" on public.chat_messages
  for select using (
    channel_id is not null
    and exists (
      select 1 from public.chat_channel_members m
      where m.channel_id = chat_messages.channel_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "chat_messages_channel_insert" on public.chat_messages;
create policy "chat_messages_channel_insert" on public.chat_messages
  for insert with check (
    channel_id is not null
    and author_id = auth.uid()
    and exists (
      select 1 from public.chat_channel_members m
      where m.channel_id = chat_messages.channel_id and m.user_id = auth.uid()
    )
  );

-- 0020 / 0029: el CEO puede borrar cualquier mensaje (moderación).
drop policy if exists "chat_messages_delete_own" on public.chat_messages;
drop policy if exists "chat_messages_delete_own_or_ceo" on public.chat_messages;
create policy "chat_messages_delete_own_or_ceo" on public.chat_messages
  for delete using (author_id = auth.uid() or public.current_role() = 'ceo');

-- 0044: canal fijo "Sala de voz". Solo si el canal se crea en esta corrida
-- se mete en él a todos los usuarios activos.
with nuevo as (
  insert into public.chat_channels (slug, name)
  values ('sala-de-voz', '🔊 Sala de voz')
  on conflict (slug) do nothing
  returning id
)
insert into public.chat_channel_members (channel_id, user_id)
select n.id, u.id
from nuevo n
cross join public.users u
where u.active = true
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. CHAT: MARCADORES FIJADOS POR CANAL (0032 + 0035)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.chat_channel_bookmarks (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  nombre text not null,
  url text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  tipo text not null default 'link' check (tipo in ('link', 'nota', 'recordatorio')),
  nota text,
  recordatorio_en timestamptz
);

-- Por si la tabla ya existía con la forma de la 0032 (sin los tipos):
alter table public.chat_channel_bookmarks
  add column if not exists tipo text not null default 'link' check (tipo in ('link', 'nota', 'recordatorio')),
  add column if not exists nota text,
  add column if not exists recordatorio_en timestamptz;
alter table public.chat_channel_bookmarks alter column url drop not null;

alter table public.chat_channel_bookmarks enable row level security;

drop policy if exists "chat_channel_bookmarks_select" on public.chat_channel_bookmarks;
create policy "chat_channel_bookmarks_select" on public.chat_channel_bookmarks
  for select using (
    exists (
      select 1 from public.chat_channel_members m
      where m.channel_id = chat_channel_bookmarks.channel_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "chat_channel_bookmarks_manage" on public.chat_channel_bookmarks;
create policy "chat_channel_bookmarks_manage" on public.chat_channel_bookmarks
  for insert with check (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'));

drop policy if exists "chat_channel_bookmarks_delete" on public.chat_channel_bookmarks;
create policy "chat_channel_bookmarks_delete" on public.chat_channel_bookmarks
  for delete using (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'));

-- ─────────────────────────────────────────────────────────────────────────
-- 6. CHAT: NO LEÍDOS POR CANAL / CONVERSACIÓN (0053)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.chat_lecturas (
  user_id uuid not null references public.users (id) on delete cascade,
  -- 'canal:<channel_id>' para canales, 'dm:<other_user_id>' para directos.
  clave text not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, clave)
);

alter table public.chat_lecturas enable row level security;

drop policy if exists "lee su propio estado de lectura" on public.chat_lecturas;
create policy "lee su propio estado de lectura" on public.chat_lecturas
  for select using (user_id = auth.uid());

drop policy if exists "escribe su propio estado de lectura" on public.chat_lecturas;
create policy "escribe su propio estado de lectura" on public.chat_lecturas
  for insert with check (user_id = auth.uid());

drop policy if exists "actualiza su propio estado de lectura" on public.chat_lecturas;
create policy "actualiza su propio estado de lectura" on public.chat_lecturas
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 7. ENCUESTAS DE CALIDAD (0028 / 0029 / 0061)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.encuestas_calidad (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null unique references public.ingresos (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  token text not null unique,
  puntuacion smallint check (puntuacion between 1 and 5),
  comentario text,
  quiere_testimonio boolean not null default false,
  respondido_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.encuestas_calidad enable row level security;

-- El cliente responde por el link público (lo atiende el servidor de la
-- app); desde dentro de la app solo las ve quien ve Ingresos.
drop policy if exists "encuestas_calidad_ceo_gc_only" on public.encuestas_calidad;
create policy "encuestas_calidad_ceo_gc_only" on public.encuestas_calidad
  for all using (public.can_see_ingresos()) with check (public.can_see_ingresos());

create index if not exists idx_encuestas_calidad_token on public.encuestas_calidad (token);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. GASTOS FIJOS MENSUALES (0031)
-- ─────────────────────────────────────────────────────────────────────────

-- Los tres gastos iniciales (ElevenLabs y Google Storage con el valor que
-- hoy tiene Nómina, más Magnific) se cargan SOLO si la tabla se crea en
-- esta corrida. Si el CEO después los edita o los borra, volver a correr
-- el archivo no los toca.
do $$
declare
  es_nueva boolean := to_regclass('public.gastos_fijos') is null;
begin
  create table if not exists public.gastos_fijos (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    monto_usd numeric(12, 2) not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  if es_nueva then
    insert into public.gastos_fijos (nombre, monto_usd)
    select 'ElevenLabs', elevenlabs_usd_mes from public.payroll_settings where id = true
    union all
    select 'Google Storage', google_storage_usd_mes from public.payroll_settings where id = true;

    insert into public.gastos_fijos (nombre, monto_usd) values ('Magnific', 44);
  end if;
end $$;

alter table public.gastos_fijos enable row level security;

drop policy if exists "gastos_fijos_ceo_only" on public.gastos_fijos;
create policy "gastos_fijos_ceo_only" on public.gastos_fijos
  for all using (public.current_role() = 'ceo') with check (public.current_role() = 'ceo');

drop trigger if exists set_updated_at on public.gastos_fijos;
create trigger set_updated_at before update on public.gastos_fijos
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 9. HISTORIAL DEL ASISTENTE CEO (0052)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.ceo_asistente_mensajes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ceo_asistente_mensajes_user
  on public.ceo_asistente_mensajes (user_id, created_at);

alter table public.ceo_asistente_mensajes enable row level security;

drop policy if exists "ceo ve su propio historial" on public.ceo_asistente_mensajes;
create policy "ceo ve su propio historial" on public.ceo_asistente_mensajes
  for select using (user_id = auth.uid());

drop policy if exists "ceo escribe su propio historial" on public.ceo_asistente_mensajes;
create policy "ceo escribe su propio historial" on public.ceo_asistente_mensajes
  for insert with check (user_id = auth.uid());

drop policy if exists "ceo borra su propio historial" on public.ceo_asistente_mensajes;
create policy "ceo borra su propio historial" on public.ceo_asistente_mensajes
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 10. RETO 75 (0056 + 0062)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.reto75_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  numero_intento integer not null,
  fecha_inicio date not null,
  estado text not null default 'activo' check (estado in ('activo', 'completado', 'fallido')),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_reto75_runs_user_intento
  on public.reto75_runs (user_id, numero_intento);

-- Solo un intento activo a la vez por persona.
create unique index if not exists idx_reto75_runs_activo_unico
  on public.reto75_runs (user_id)
  where estado = 'activo';

create table if not exists public.reto75_dias (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.reto75_runs (id) on delete cascade,
  dia_numero integer not null check (dia_numero between 1 and 75),
  fecha date not null,
  dieta boolean not null default false,
  entreno1 boolean not null default false,
  entreno2_outdoor boolean not null default false,
  agua boolean not null default false,
  lectura boolean not null default false,
  foto_url text,
  updated_at timestamptz not null default now(),
  unique (run_id, dia_numero)
);

-- 0062: a qué hora se marcó cada regla.
alter table public.reto75_dias
  add column if not exists dieta_at timestamptz,
  add column if not exists entreno1_at timestamptz,
  add column if not exists entreno2_outdoor_at timestamptz,
  add column if not exists agua_at timestamptz,
  add column if not exists lectura_at timestamptz;

alter table public.reto75_runs enable row level security;
alter table public.reto75_dias enable row level security;

drop policy if exists "ve sus propios runs de reto75" on public.reto75_runs;
create policy "ve sus propios runs de reto75" on public.reto75_runs
  for select using (user_id = auth.uid());

drop policy if exists "crea sus propios runs de reto75" on public.reto75_runs;
create policy "crea sus propios runs de reto75" on public.reto75_runs
  for insert with check (user_id = auth.uid());

drop policy if exists "actualiza sus propios runs de reto75" on public.reto75_runs;
create policy "actualiza sus propios runs de reto75" on public.reto75_runs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "ve sus propios dias de reto75" on public.reto75_dias;
create policy "ve sus propios dias de reto75" on public.reto75_dias
  for select using (exists (select 1 from public.reto75_runs r where r.id = run_id and r.user_id = auth.uid()));

drop policy if exists "crea sus propios dias de reto75" on public.reto75_dias;
create policy "crea sus propios dias de reto75" on public.reto75_dias
  for insert with check (exists (select 1 from public.reto75_runs r where r.id = run_id and r.user_id = auth.uid()));

drop policy if exists "actualiza sus propios dias de reto75" on public.reto75_dias;
create policy "actualiza sus propios dias de reto75" on public.reto75_dias
  for update using (exists (select 1 from public.reto75_runs r where r.id = run_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.reto75_runs r where r.id = run_id and r.user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────
-- 11. CHECKLIST DIARIO POR ROL (0059)
-- ─────────────────────────────────────────────────────────────────────────

-- La plantilla inicial se carga SOLO si la tabla se crea en esta corrida.
do $$
declare
  es_nueva boolean := to_regclass('public.checklist_items') is null;
begin
  create table if not exists public.checklist_items (
    id uuid primary key default gen_random_uuid(),
    role text not null,
    texto text not null,
    orden integer not null default 0,
    activo boolean not null default true,
    created_at timestamptz not null default now()
  );

  if es_nueva then
    insert into public.checklist_items (role, texto, orden) values
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
      ('ceo', 'Revisar el checklist de nómina si es lunes', 3);
  end if;
end $$;

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

-- ─────────────────────────────────────────────────────────────────────────
-- 12. STORAGE: FOTOS DEL RETO 75 (0056) Y COMPROBANTES DE PAGO (0045)
-- ─────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('reto75-fotos', 'reto75-fotos', true)
on conflict (id) do nothing;

drop policy if exists "reto75_fotos_public_read" on storage.objects;
create policy "reto75_fotos_public_read" on storage.objects
  for select using (bucket_id = 'reto75-fotos');

drop policy if exists "reto75_fotos_insert_propio" on storage.objects;
create policy "reto75_fotos_insert_propio" on storage.objects
  for insert with check (bucket_id = 'reto75-fotos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "reto75_fotos_delete_propio" on storage.objects;
create policy "reto75_fotos_delete_propio" on storage.objects
  for delete using (bucket_id = 'reto75-fotos' and (storage.foldername(name))[1] = auth.uid()::text);

-- El bucket de comprobantes ya existe en producción; sus reglas no se
-- pueden comprobar desde fuera, así que se dejan tal cual las define la 0045.
insert into storage.buckets (id, name, public)
values ('comprobantes-pago', 'comprobantes-pago', true)
on conflict (id) do nothing;

drop policy if exists "comprobantes_pago_public_read" on storage.objects;
create policy "comprobantes_pago_public_read" on storage.objects
  for select using (bucket_id = 'comprobantes-pago');

drop policy if exists "comprobantes_pago_insert" on storage.objects;
create policy "comprobantes_pago_insert" on storage.objects
  for insert with check (
    bucket_id = 'comprobantes-pago'
    and public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa')
  );

drop policy if exists "comprobantes_pago_delete" on storage.objects;
create policy "comprobantes_pago_delete" on storage.objects
  for delete using (
    bucket_id = 'comprobantes-pago'
    and public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 13. REGLAS Y TRIGGERS DE TABLAS QUE YA EXISTEN
-- (no se pueden comprobar desde fuera; se dejan como las definen las
-- migraciones 0034, 0036, 0038 y 0057 — mismos permisos, sin ampliar nada)
-- ─────────────────────────────────────────────────────────────────────────

-- 0034: tarifas de nómina por persona — solo CEO.
alter table public.user_payroll_rates enable row level security;

drop policy if exists "user_payroll_rates_ceo_only" on public.user_payroll_rates;
create policy "user_payroll_rates_ceo_only" on public.user_payroll_rates
  for all using (public.current_role() = 'ceo')
  with check (public.current_role() = 'ceo');

drop trigger if exists set_updated_at on public.user_payroll_rates;
create trigger set_updated_at before update on public.user_payroll_rates
  for each row execute function public.set_updated_at();

-- 0036: base de conocimiento vieja del bot (ya no se usa, se conserva).
alter table public.bot_knowledge_base enable row level security;

drop policy if exists "bot_knowledge_base_select" on public.bot_knowledge_base;
create policy "bot_knowledge_base_select" on public.bot_knowledge_base
  for select using (public.current_role() is not null);

drop policy if exists "bot_knowledge_base_manage" on public.bot_knowledge_base;
create policy "bot_knowledge_base_manage" on public.bot_knowledge_base
  for all using (public.current_role() = 'ceo') with check (public.current_role() = 'ceo');

drop trigger if exists set_updated_at on public.bot_knowledge_base;
create trigger set_updated_at before update on public.bot_knowledge_base
  for each row execute function public.set_updated_at();

-- 0038: secciones de conocimiento del bot — solo CEO.
alter table public.bot_knowledge_sections enable row level security;

drop policy if exists "bot_knowledge_sections_select" on public.bot_knowledge_sections;
create policy "bot_knowledge_sections_select" on public.bot_knowledge_sections
  for select using (public.current_role() = 'ceo');

drop policy if exists "bot_knowledge_sections_manage" on public.bot_knowledge_sections;
create policy "bot_knowledge_sections_manage" on public.bot_knowledge_sections
  for all using (public.current_role() = 'ceo') with check (public.current_role() = 'ceo');

drop trigger if exists set_updated_at on public.bot_knowledge_sections;
create trigger set_updated_at before update on public.bot_knowledge_sections
  for each row execute function public.set_updated_at();

-- 0057: unidades de un requerimiento — los mismos roles que ven Requerimientos.
alter table public.requerimiento_unidades enable row level security;

drop policy if exists "requerimiento_unidades_all_roles" on public.requerimiento_unidades;
create policy "requerimiento_unidades_all_roles" on public.requerimiento_unidades
  for all using (public.can_see_requerimientos())
  with check (public.can_see_requerimientos());

-- ─────────────────────────────────────────────────────────────────────────
-- 14. LLAVES FORÁNEAS (0018 / 0019 / 0029 / 0058)
--
-- Qué pasa con lo ligado cuando se borra un usuario, un cliente o un
-- ingreso. No borra ni cambia ningún dato ahora; solo define el
-- comportamiento de borrados FUTUROS hechos desde la app. Cada llave se
-- toca únicamente si hoy no está como debe (si ya está bien, se salta).
--
-- ⚠ La última fila es la migración 0058: al borrar un ingreso desde la app
-- (acción protegida con código de autenticador) se borran también sus
-- requerimientos, en vez de quedar huérfanos. Si no se quiere ese
-- comportamiento, quitar esa fila antes de correr.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.requerimiento_comments alter column author_id drop not null;
alter table public.chat_messages alter column author_id drop not null;

do $$
declare
  r record;
  actual "char";
begin
  for r in
    select * from (values
      ('ingresos',               'ingresos_responsable_id_fkey',                  'responsable_id',    'users',    'n'),
      ('requerimientos',         'requerimientos_encargado_id_fkey',              'encargado_id',      'users',    'n'),
      ('requerimientos',         'requerimientos_programador_id_fkey',            'programador_id',    'users',    'n'),
      ('requerimiento_comments', 'requerimiento_comments_author_id_fkey',         'author_id',         'users',    'n'),
      ('requerimiento_comments', 'requerimiento_comments_mentioned_user_id_fkey', 'mentioned_user_id', 'users',    'n'),
      ('chat_messages',          'chat_messages_author_id_fkey',                  'author_id',         'users',    'n'),
      ('chat_messages',          'chat_messages_recipient_id_fkey',               'recipient_id',      'users',    'c'),
      ('chat_message_reactions', 'chat_message_reactions_user_id_fkey',           'user_id',           'users',    'c'),
      ('payroll_payments',       'payroll_payments_user_id_fkey',                 'user_id',           'users',    'c'),
      ('ingresos',               'ingresos_client_id_fkey',                       'client_id',         'clients',  'n'),
      ('historical_ingresos',    'historical_ingresos_client_id_fkey',            'client_id',         'clients',  'n'),
      ('prospectos',             'prospectos_client_id_fkey',                     'client_id',         'clients',  'n'),
      ('requerimientos',         'requerimientos_ingreso_id_fkey',                'ingreso_id',        'ingresos', 'c')
    ) as t (tabla, nombre, columna, destino, accion)
  loop
    actual := null;
    select c.confdeltype into actual
    from pg_constraint c
    where c.conname = r.nombre
      and c.conrelid = format('public.%I', r.tabla)::regclass;

    if actual is distinct from r.accion::"char" then
      execute format('alter table public.%I drop constraint if exists %I', r.tabla, r.nombre);
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.%I (id) on delete %s',
        r.tabla, r.nombre, r.columna, r.destino,
        case r.accion when 'n' then 'set null' else 'cascade' end
      );
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 15. ÍNDICES (solo aceleran consultas; no cambian datos)
-- ─────────────────────────────────────────────────────────────────────────
create index if not exists idx_ingresos_fecha on public.ingresos (fecha);
create index if not exists idx_ingresos_estado on public.ingresos (estado);
create index if not exists idx_ingresos_estado_pago on public.ingresos (estado_pago);
create index if not exists idx_ingresos_client_id on public.ingresos (client_id);
create index if not exists ingresos_estado_comercial_idx on public.ingresos (estado_comercial);
create index if not exists idx_ingresos_recordatorio_pendiente
  on public.ingresos (recordatorio_fecha)
  where recordatorio_fecha is not null and recordatorio_enviado = false;
create index if not exists idx_ingresos_referido_por on public.ingresos (referido_por_client_id);

create index if not exists idx_requerimientos_pipeline_estado on public.requerimientos (pipeline, estado);
create index if not exists idx_requerimientos_encargado_id on public.requerimientos (encargado_id);
create index if not exists idx_requerimientos_programador_id on public.requerimientos (programador_id);
create index if not exists idx_requerimientos_ingreso_id on public.requerimientos (ingreso_id);
create index if not exists idx_requerimientos_updated_at on public.requerimientos (updated_at);

create index if not exists idx_requerimiento_comments_requerimiento_id
  on public.requerimiento_comments (requerimiento_id);
create index if not exists idx_notifications_user_read on public.notifications (user_id, read);
create index if not exists idx_ingreso_items_ingreso_id on public.ingreso_items (ingreso_id);
create index if not exists idx_chat_messages_channel_created on public.chat_messages (channel_id, created_at);
create index if not exists idx_chat_messages_dm on public.chat_messages (author_id, recipient_id, created_at);
create index if not exists idx_historical_ingresos_client_id on public.historical_ingresos (client_id);
create index if not exists idx_historical_ingresos_fecha on public.historical_ingresos (fecha);
create index if not exists idx_payroll_payments_week on public.payroll_payments (week_start);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);
create index if not exists idx_prospectos_estado on public.prospectos (estado);
create index if not exists idx_prospectos_fecha_reunion on public.prospectos (fecha_reunion);

-- ─────────────────────────────────────────────────────────────────────────
-- 16. TIEMPO REAL (0003b / 0010 / 0032 / 0061)
-- Cada tabla se agrega a la publicación solo si no está. Si algo de esto
-- no se pudiera hacer, se avisa y se sigue: no tumba el resto del archivo.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'chat_messages', 'chat_message_reactions', 'chat_channel_members',
    'chat_channel_bookmarks', 'ingresos', 'requerimientos', 'notifications'
  ]
  loop
    begin
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    exception
      when duplicate_object then
        null;
      when others then
        raise notice 'Tiempo real: no se pudo agregar % (%). Se continúa.', t, sqlerrm;
    end;
  end loop;
end $$;

-- Avisa a la API de Supabase que relea el esquema (para que las tablas y
-- columnas nuevas se vean de inmediato desde la app).
notify pgrst, 'reload schema';

commit;

select 'LISTO: la base del CRM quedó al día. Se puede volver a correr sin problema.' as resultado;
