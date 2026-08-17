-- Reditus CRM — se descartó el clock in/clock out. Por si la migración
-- 0016 llegó a correr en algún intento anterior, esto la deshace.
drop table if exists public.attendance;
