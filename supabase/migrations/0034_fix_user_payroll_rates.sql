-- Reditus CRM — catchup idempotente para el error real que estaba tumbando
-- /ceo en producción: "Could not find the table 'public.user_payroll_rates'
-- in the schema cache" (5 veces en las últimas 24h). Las migraciones 0014,
-- 0023 y 0024 nunca se corrieron en producción — este script las junta de
-- forma segura de re-ejecutar sin importar qué tanto de eso ya exista.

create table if not exists public.user_payroll_rates (
  user_id uuid primary key references public.users (id) on delete cascade,
  modo text not null check (modo in ('semanal_fijo', 'por_pieza')),
  monto numeric(12, 2) not null,
  moneda text not null default 'USD' check (moneda in ('USD', 'COP')),
  updated_at timestamptz not null default now()
);

alter table public.user_payroll_rates enable row level security;

drop policy if exists "user_payroll_rates_ceo_only" on public.user_payroll_rates;
create policy "user_payroll_rates_ceo_only" on public.user_payroll_rates
  for all using (public.current_role() = 'ceo')
  with check (public.current_role() = 'ceo');

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.user_payroll_rates'::regclass
  ) then
    create trigger set_updated_at before update on public.user_payroll_rates
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.user_payroll_rates
  add column if not exists activo boolean not null default true;

alter table public.users
  add column if not exists incluir_en_nomina boolean not null default true;
