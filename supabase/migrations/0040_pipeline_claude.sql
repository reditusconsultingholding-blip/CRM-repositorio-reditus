-- Reditus CRM — nuevo servicio "Claude" además de Video y Landing page.
-- ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción que un
-- statement que USE el valor nuevo — por eso este archivo va solo, sin
-- nada más.
alter type public.requerimiento_pipeline add value if not exists 'claude';
