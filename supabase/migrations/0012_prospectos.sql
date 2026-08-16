-- Reditus CRM — prospectos/leads: terreno para el agente de ventas de
-- WhatsApp (línea 1, pendiente de acceso a la API de Meta) y la
-- sincronización automática con Calendly (línea ya conectada).
create type public.prospecto_estado as enum (
  'nuevo',
  'calificando',
  'agendado',
  'calificado',
  'descartado',
  'convertido'
);

create table public.prospectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  whatsapp_number text,
  email text,
  estado public.prospecto_estado not null default 'nuevo',
  origen text not null default 'whatsapp', -- 'whatsapp' | 'calendly' | 'manual'
  respuestas_calificacion jsonb,
  fecha_reunion timestamptz,
  link_reunion text,
  calendly_event_uri text unique,
  notas text,
  client_id uuid references public.clients (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prospectos enable row level security;

create policy "prospectos_ceo_gc_only" on public.prospectos
  for all using (public.can_see_ingresos())
  with check (public.can_see_ingresos());

create trigger set_updated_at before update on public.prospectos
  for each row execute function public.set_updated_at();

create index if not exists idx_prospectos_estado on public.prospectos (estado);
create index if not exists idx_prospectos_fecha_reunion on public.prospectos (fecha_reunion);
