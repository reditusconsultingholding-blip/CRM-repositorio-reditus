-- Reditus CRM — permite esconder a alguien de la tabla de Nómina (y de
-- todos los cálculos de costo/rentabilidad) sin necesidad de haberle
-- configurado antes una tarifa, y sin desactivar su cuenta. Reemplaza al
-- enfoque anterior (user_payroll_rates.activo, que exigía tener ya una
-- tarifa guardada para poder usarlo).
alter table public.users add column incluir_en_nomina boolean not null default true;
