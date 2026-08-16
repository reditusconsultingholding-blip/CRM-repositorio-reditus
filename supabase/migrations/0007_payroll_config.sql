-- Reditus CRM — nómina configurable + checklist semanal de pagos.

-- Tabla de una sola fila (patrón "id boolean primary key default true"):
-- el CEO edita estos valores desde la UI en vez de que estén hardcodeados
-- en el código.
create table public.payroll_settings (
  id boolean primary key default true check (id),
  disenadora_landing_usd_dia numeric(10, 2) not null default 26.5,
  gerente_comercial_usd_dia numeric(10, 2) not null default 16.66,
  project_manager_usd_dia numeric(10, 2) not null default 14.66,
  dias_por_semana integer not null default 6,
  editor_video_usd_por_video numeric(10, 2) not null default 6,
  programador_cop_por_pagina numeric(12, 2) not null default 20000,
  elevenlabs_usd_mes numeric(10, 2) not null default 12,
  google_storage_usd_mes numeric(10, 2) not null default 30,
  updated_at timestamptz not null default now()
);

insert into public.payroll_settings (id) values (true);

alter table public.payroll_settings enable row level security;

create policy "payroll_settings_ceo_only" on public.payroll_settings
  for all using (public.current_role() = 'ceo')
  with check (public.current_role() = 'ceo');

-- Checklist semanal: cuánto se le calculó a cada persona esa semana, si ya
-- se le pagó, y cuándo — para poder medir puntualidad (a tiempo vs. tarde).
create table public.payroll_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  week_start date not null,
  amount_usd numeric(12, 2) not null default 0,
  detalle text,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.payroll_payments enable row level security;

create policy "payroll_payments_ceo_only" on public.payroll_payments
  for all using (public.current_role() = 'ceo')
  with check (public.current_role() = 'ceo');

create index if not exists idx_payroll_payments_week on public.payroll_payments (week_start);
