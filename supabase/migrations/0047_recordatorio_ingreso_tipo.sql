-- Reditus CRM — nuevo tipo de notificación para recordatorios que el CEO/
-- Gerente Comercial/Directora Operativa dejan sobre un ingreso puntual.
-- Va en su propio archivo porque ALTER TYPE ... ADD VALUE no puede
-- combinarse con nada que USE el valor nuevo en la misma transacción.
alter type public.notification_type add value if not exists 'recordatorio_ingreso';
