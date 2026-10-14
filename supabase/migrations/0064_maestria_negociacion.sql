-- Maestría en negociación (/maestria): sección privada del CEO para entrenar
-- negociación con IA. Dos tablas: las sesiones (clase, práctica libre o examen,
-- con su conversación y su calificación) y el progreso por módulo.
-- Se puede correr las veces que haga falta: no duplica ni pisa nada.

create table if not exists public.negociacion_sesiones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  tipo text not null check (tipo in ('clase', 'practica', 'examen')),
  modulo int,
  escenario text not null,
  -- Instrucciones de la escena para la IA: se fijan al crear la sesión para
  -- que no cambien a mitad de la conversación.
  contexto text not null,
  dificultad text not null default 'media' check (dificultad in ('facil', 'media', 'dificil')),
  mensajes jsonb not null default '[]'::jsonb,
  nota int,
  evaluacion jsonb,
  created_at timestamptz not null default now(),
  calificada_en timestamptz
);

create index if not exists idx_negociacion_sesiones_user
  on public.negociacion_sesiones (user_id, created_at desc);

create table if not exists public.negociacion_progreso (
  user_id uuid not null references public.users (id) on delete cascade,
  modulo int not null,
  mejor_nota int not null default 0,
  intentos int not null default 0,
  aprobado_en timestamptz,
  primary key (user_id, modulo)
);

alter table public.negociacion_sesiones enable row level security;
alter table public.negociacion_progreso enable row level security;

drop policy if exists "cada quien sus sesiones de negociacion" on public.negociacion_sesiones;
create policy "cada quien sus sesiones de negociacion" on public.negociacion_sesiones
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "cada quien su progreso de negociacion" on public.negociacion_progreso;
create policy "cada quien su progreso de negociacion" on public.negociacion_progreso
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

select 'LISTO: la maestría en negociación quedó instalada' as resultado;
