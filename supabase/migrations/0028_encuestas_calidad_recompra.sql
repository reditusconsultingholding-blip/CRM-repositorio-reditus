-- Reditus CRM — encuesta de calidad post-entrega (etapa 11, Seguimiento) y
-- cierre del ciclo con recompra (etapa 12, Recompra).

create table public.encuestas_calidad (
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

-- Solo el equipo comercial/CEO ve las encuestas desde la app. El propio
-- cliente accede por token vía el endpoint público (service role), no
-- entra por aquí.
create policy "encuestas_calidad_ceo_gc_only" on public.encuestas_calidad
  for all using (public.can_see_ingresos()) with check (public.can_see_ingresos());

create index if not exists idx_encuestas_calidad_token on public.encuestas_calidad (token);

-- Cierre de ciclo: cuándo se mandó el mensaje de recompra y cuándo se dio
-- por finalizado el servicio completo.
alter table public.ingresos add column recompra_enviado_at timestamptz;
alter table public.ingresos add column ciclo_cerrado boolean not null default false;

alter type public.notification_type add value if not exists 'encuesta_respondida';
