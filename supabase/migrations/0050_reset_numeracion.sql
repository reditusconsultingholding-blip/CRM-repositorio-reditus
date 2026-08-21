-- Arranque limpio de toda la numeración de negocio ("estamos iniciando de
-- nuevo"): hoy solo existe 1 ingreso de prueba en producción, así que es
-- seguro reiniciar los tres contadores a 1 sin riesgo de choque con datos
-- reales. Antes, tracking_id seguía la numeración externa (arrancaba en
-- 351); ahora arranca en 1 igual que cotización y cuenta de cobro.
alter sequence public.ingreso_tracking_seq restart with 1;
alter sequence public.cotizacion_seq restart with 1;
alter sequence public.cuenta_cobro_seq restart with 1;
