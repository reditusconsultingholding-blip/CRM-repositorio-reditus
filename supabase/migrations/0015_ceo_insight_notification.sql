-- Reditus CRM — tipo de notificación para la recomendación semanal del
-- asesor IA del CEO.
alter type public.notification_type add value if not exists 'recomendacion_ceo';
