-- Reditus CRM — permite excluir a alguien del cálculo de nómina/rentabilidad
-- sin desactivar su cuenta (sigue pudiendo iniciar sesión normalmente).
alter table public.user_payroll_rates add column activo boolean not null default true;
