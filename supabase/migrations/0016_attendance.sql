-- Reditus CRM — clock in / clock out: cada usuario marca su entrada y su
-- salida diaria. El CEO ve un reporte de horarios de todo el equipo para
-- saber quién entra a tiempo. Hora mostrada en la UI siempre en
-- America/Bogota, pero se guarda en UTC como cualquier timestamptz.
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  created_at timestamptz not null default now()
);

alter table public.attendance enable row level security;

-- Cada usuario ve y crea/actualiza solo sus propias marcas.
create policy "attendance_self_select" on public.attendance
  for select using (user_id = auth.uid() or public.current_role() = 'ceo');

create policy "attendance_self_insert" on public.attendance
  for insert with check (user_id = auth.uid());

create policy "attendance_self_update" on public.attendance
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists idx_attendance_user_clockin on public.attendance (user_id, clock_in desc);

alter publication supabase_realtime add table public.attendance;
