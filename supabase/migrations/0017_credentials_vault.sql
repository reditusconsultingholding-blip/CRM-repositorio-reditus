-- Reditus CRM — bóveda de contraseñas internas del equipo (cuentas de
-- Gmail, Instagram, Facebook, etc.). Solo el CEO puede ver/editar. La
-- contraseña se guarda cifrada (AES-256-GCM, cifrado/descifrado ocurre en
-- el servidor de la app, no en Postgres) — nunca en texto plano.
create table public.credentials_vault (
  id uuid primary key default gen_random_uuid(),
  app text not null,
  correo text,
  password_encrypted text not null,
  utilidad text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.credentials_vault enable row level security;

create policy "vault_ceo_only" on public.credentials_vault
  for all using (public.current_role() = 'ceo') with check (public.current_role() = 'ceo');

create trigger set_updated_at before update on public.credentials_vault
  for each row execute function public.set_updated_at();
