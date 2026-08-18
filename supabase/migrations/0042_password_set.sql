-- Reditus CRM — permite crear usuarios sin contraseña (el CEO ya no la
-- inventa) y que cada quien cree la suya la primera vez que entra.
-- Default true para que todos los usuarios ya existentes (que sí tienen
-- contraseña puesta desde que se crearon) no se vean afectados.
alter table public.users
  add column if not exists password_set boolean not null default true;
