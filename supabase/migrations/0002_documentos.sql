-- Reditus CRM — Fase A: cotización y cuenta de cobro automáticas
-- Run this in the Supabase SQL editor after 0001_init.sql.

-- ─────────────────────────────────────────────────────────────────────────
-- clients: NIT/Cédula opcional del cliente
-- ─────────────────────────────────────────────────────────────────────────
alter table public.clients add column tax_id text;

-- ─────────────────────────────────────────────────────────────────────────
-- ingresos: cantidad
-- ─────────────────────────────────────────────────────────────────────────
alter table public.ingresos add column cantidad integer not null default 1;

-- ─────────────────────────────────────────────────────────────────────────
-- ingresos.estado_pago: de texto libre a enum controlado
-- ─────────────────────────────────────────────────────────────────────────
create type public.estado_pago_ingreso as enum ('Pendiente', 'Pagado');

alter table public.ingresos add column estado_pago_new public.estado_pago_ingreso;

update public.ingresos
set estado_pago_new = case
  when estado_pago ilike '%pag%' then 'Pagado'::public.estado_pago_ingreso
  else 'Pendiente'::public.estado_pago_ingreso
end;

alter table public.ingresos alter column estado_pago_new set default 'Pendiente';
alter table public.ingresos alter column estado_pago_new set not null;
alter table public.ingresos drop column estado_pago;
alter table public.ingresos rename column estado_pago_new to estado_pago;

-- ─────────────────────────────────────────────────────────────────────────
-- Numeración de cotización y cuenta de cobro
-- ─────────────────────────────────────────────────────────────────────────
alter table public.ingresos add column cotizacion_numero text;
alter table public.ingresos add column cuenta_cobro_numero text;

create sequence public.cotizacion_seq start 1;
create sequence public.cuenta_cobro_seq start 1;

-- Cotización: se asigna siempre al crear el ingreso.
create or replace function public.set_cotizacion_numero()
returns trigger
language plpgsql
as $$
begin
  if new.cotizacion_numero is null then
    new.cotizacion_numero = 'COT-' || lpad(nextval('public.cotizacion_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

create trigger set_cotizacion_numero before insert on public.ingresos
  for each row execute function public.set_cotizacion_numero();

-- Cuenta de cobro: se asigna la primera vez que estado_pago pasa a 'Pagado'.
-- Vive a nivel de base de datos (no en el server action) para que cualquier
-- camino que marque un ingreso como pagado dispare la numeración por igual.
create or replace function public.set_cuenta_cobro_numero()
returns trigger
language plpgsql
as $$
begin
  if new.estado_pago = 'Pagado' and new.cuenta_cobro_numero is null then
    new.cuenta_cobro_numero = extract(year from now())::text || '-' ||
      lpad(nextval('public.cuenta_cobro_seq')::text, 7, '0');
  end if;
  return new;
end;
$$;

create trigger set_cuenta_cobro_numero before insert or update on public.ingresos
  for each row execute function public.set_cuenta_cobro_numero();
