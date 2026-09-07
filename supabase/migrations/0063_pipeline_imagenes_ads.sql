-- Nuevo servicio "Imágenes Ads" en Ingresos — su propio pipeline en
-- requerimientos, igual patrón que "claude". ALTER TYPE ADD VALUE va solo
-- en su propia migración/transacción (no se puede usar el valor nuevo en
-- la misma transacción en que se agrega).
alter type public.requerimiento_pipeline add value if not exists 'imagenes_ads';
