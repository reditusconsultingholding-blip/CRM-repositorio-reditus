-- Reditus CRM — nómina por persona (reemplaza las tarifas por rol de
-- payroll_settings, que asumían que todos en un rol ganan igual — no es
-- el caso real). payroll_settings se queda solo para los costos fijos
-- mensuales de SaaS (ElevenLabs, Google Storage).
create table public.user_payroll_rates (
  user_id uuid primary key references public.users (id) on delete cascade,
  modo text not null check (modo in ('semanal_fijo', 'por_pieza')),
  monto numeric(12, 2) not null,
  moneda text not null default 'USD' check (moneda in ('USD', 'COP')),
  updated_at timestamptz not null default now()
);

alter table public.user_payroll_rates enable row level security;

create policy "user_payroll_rates_ceo_only" on public.user_payroll_rates
  for all using (public.current_role() = 'ceo')
  with check (public.current_role() = 'ceo');

create trigger set_updated_at before update on public.user_payroll_rates
  for each row execute function public.set_updated_at();
