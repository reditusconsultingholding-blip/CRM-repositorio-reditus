-- Guarda a qué hora se marcó cada regla (no se muestra en el checklist
-- del día a día — es para el Dashboard, que mide qué tan estable es la
-- rutina: a qué hora sueles cumplir cada cosa).
alter table public.reto75_dias
  add column if not exists dieta_at timestamptz,
  add column if not exists entreno1_at timestamptz,
  add column if not exists entreno2_outdoor_at timestamptz,
  add column if not exists agua_at timestamptz,
  add column if not exists lectura_at timestamptz;
