-- Reditus CRM — Fase 1 schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.

-- ─────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────

create type public.user_role as enum (
  'ceo',
  'gerente_comercial',
  'directora_operativa',
  'editor_video',
  'disenador_landing'
);

create type public.ingreso_estado as enum (
  'Nuevo pedido',
  'En progreso',
  'Terminado',
  'NADA',
  'ESPERANDO',
  'Por revisión',
  'Corregir',
  'CORREGIDO',
  'ENTREGADO',
  'ASIGNANDO',
  'NO APROBADO',
  'ESPERANDO INFO'
);

create type public.requerimiento_estado as enum (
  'Nuevo pedido',
  'En tabla',
  'Asignado',
  'En progreso',
  'Por revisión',
  'Corregir',
  'Por subir',
  'Terminado',
  'ENTREGADO',
  'Sin nada',
  'POR CONFIRMAR',
  'ESPERA INFO'
);

create type public.requerimiento_pipeline as enum ('video', 'landing');

create type public.notification_type as enum (
  'nuevo_pedido',
  'asignado',
  'correccion',
  'mencion',
  'terminado'
);

-- ─────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────

-- Mirrors auth.users with app-level profile data (name + role). Rows are
-- created by the admin-only "create user" flow (service role), not by
-- self-serve signup — there is none in this app.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role public.user_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Prepared for future LTV tracking; not surfaced in fase 1 UI beyond
-- linking an ingreso to a client by WhatsApp number.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  whatsapp_number text not null unique,
  name text not null,
  country text,
  created_at timestamptz not null default now()
);

create table public.ingresos (
  id uuid primary key default gen_random_uuid(),
  tracking_id text not null unique,
  client_id uuid references public.clients (id),
  fecha date not null default current_date,
  servicio text,
  pais text,
  producto text,
  precio_total numeric(12, 2),
  precio_final_descuento numeric(12, 2),
  estado_pago text,
  estado public.ingreso_estado not null default 'Nuevo pedido',
  responsable_id uuid references public.users (id),
  entrega_project_manager_date date,
  entrega_comercial_date date,
  entrega_real_date date,
  reporte text,
  comprobante_pago_1 text,
  comprobante_pago_2 text,
  factura_1 text,
  factura_2 text,
  reportado_contabilidad_1 boolean not null default false,
  reportado_contabilidad_2 boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.requerimientos (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid references public.ingresos (id) on delete set null,
  pipeline public.requerimiento_pipeline not null,
  estado public.requerimiento_estado not null default 'Nuevo pedido',
  nombre_producto text,
  requerimiento_texto text,
  pais_acento text,
  carpeta_drive_url text,
  documento_inf_url text,
  encargado_id uuid references public.users (id),
  f_entrega_prometida date,
  f_entrega_real date,
  notas text,
  pagado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.requerimiento_comments (
  id uuid primary key default gen_random_uuid(),
  requerimiento_id uuid not null references public.requerimientos (id) on delete cascade,
  author_id uuid not null references public.users (id),
  body text not null,
  mentioned_user_id uuid references public.users (id),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Auto-generated tracking_id (e.g. "#354") for every new ingreso.
create sequence public.ingreso_tracking_seq start 351;

create or replace function public.set_ingreso_tracking_id()
returns trigger
language plpgsql
as $$
begin
  if new.tracking_id is null then
    new.tracking_id = '#' || nextval('public.ingreso_tracking_seq');
  end if;
  return new;
end;
$$;

create trigger set_ingreso_tracking_id before insert on public.ingresos
  for each row execute function public.set_ingreso_tracking_id();

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.ingresos
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.requerimientos
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- Role helper (SECURITY DEFINER to avoid RLS recursion on public.users)
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.current_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.can_see_ingresos()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_role() in ('ceo', 'gerente_comercial');
$$;

create or replace function public.can_see_requerimientos()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_role() in (
    'ceo', 'gerente_comercial', 'directora_operativa',
    'editor_video', 'disenador_landing'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.ingresos enable row level security;
alter table public.requerimientos enable row level security;
alter table public.requerimiento_comments enable row level security;
alter table public.notifications enable row level security;

-- users: everyone signed in can read (needed for assignment dropdowns,
-- @mentions, nav display); only ceo can write.
create policy "users_select_all_authenticated" on public.users
  for select using (auth.uid() is not null);

create policy "users_write_ceo_only" on public.users
  for all using (public.current_role() = 'ceo')
  with check (public.current_role() = 'ceo');

-- clients + ingresos: ceo/gerente_comercial only, per Sebastian's explicit
-- requirement that other roles have zero access to sales data.
create policy "clients_ceo_gc_only" on public.clients
  for all using (public.can_see_ingresos())
  with check (public.can_see_ingresos());

create policy "ingresos_ceo_gc_only" on public.ingresos
  for all using (public.can_see_ingresos())
  with check (public.can_see_ingresos());

-- requerimientos + comments: all five roles share full visibility of the
-- production queue (director operativa needs to see both pipelines).
create policy "requerimientos_all_roles" on public.requerimientos
  for all using (public.can_see_requerimientos())
  with check (public.can_see_requerimientos());

create policy "requerimiento_comments_all_roles" on public.requerimiento_comments
  for all using (public.can_see_requerimientos())
  with check (public.can_see_requerimientos());

-- notifications: any signed-in user can create a notification for someone
-- else (e.g. assigning work), but can only read/update their own.
create policy "notifications_insert_any_authenticated" on public.notifications
  for insert with check (auth.uid() is not null);

create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid());
