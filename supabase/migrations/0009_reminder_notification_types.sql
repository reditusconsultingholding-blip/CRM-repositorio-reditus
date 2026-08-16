-- Reditus CRM — tipos de notificación para los recordatorios automáticos
-- (costos fijos SaaS el día 1, nómina lista los lunes).
alter type public.notification_type add value if not exists 'recordatorio_costos';
alter type public.notification_type add value if not exists 'nomina_lista';
