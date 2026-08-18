-- Reditus CRM — reemplaza los 2 costos fijos hardcodeados (ElevenLabs,
-- Google Storage) por una tabla real de gastos fijos mensuales, para que
-- el CEO pueda agregar/quitar los que quiera desde la app (ej. Magnific)
-- sin que yo tenga que tocar código cada vez.
create table public.gastos_fijos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  monto_usd numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gastos_fijos enable row level security;

create policy "gastos_fijos_ceo_only" on public.gastos_fijos
  for all using (public.current_role() = 'ceo') with check (public.current_role() = 'ceo');

create trigger set_updated_at before update on public.gastos_fijos
  for each row execute function public.set_updated_at();

-- Migra lo que ya existía en payroll_settings, más el nuevo (Magnific).
-- Solo la primera vez (por si este script se corre más de una vez).
do $$
begin
  if not exists (select 1 from public.gastos_fijos) then
    insert into public.gastos_fijos (nombre, monto_usd)
    select 'ElevenLabs', elevenlabs_usd_mes from public.payroll_settings where id = true
    union all
    select 'Google Storage', google_storage_usd_mes from public.payroll_settings where id = true;

    insert into public.gastos_fijos (nombre, monto_usd) values ('Magnific', 44);
  end if;
end $$;
