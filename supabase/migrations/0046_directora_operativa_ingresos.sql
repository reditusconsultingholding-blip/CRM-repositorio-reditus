-- Reditus CRM — le da acceso a Ingresos (y Clientes, Prospectos,
-- histórico) a la Directora Operativa, no solo a CEO/Gerente Comercial.
-- can_see_ingresos() es el gate real a nivel de base de datos (RLS) que
-- usan esas tablas — sin esto, aunque la app se lo permitiera en la UI,
-- Supabase seguiría bloqueando sus lecturas/escrituras.
create or replace function public.can_see_ingresos()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa');
$$;
