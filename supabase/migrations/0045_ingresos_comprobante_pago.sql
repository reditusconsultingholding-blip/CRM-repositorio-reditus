-- Reditus CRM — plataforma de pago + comprobante adjunto por ingreso
-- (reemplaza el campo "precio final" manual, que se quitó del formulario).
alter table public.ingresos
  add column if not exists plataforma_pago text,
  add column if not exists comprobante_pago_url text,
  add column if not exists comprobante_pago_nombre text;

-- Bucket para los comprobantes — mismo patrón que chat-files/avatars,
-- pero solo CEO/Gerente Comercial pueden subir (son los que manejan
-- ingresos).
insert into storage.buckets (id, name, public)
values ('comprobantes-pago', 'comprobantes-pago', true)
on conflict (id) do nothing;

drop policy if exists "comprobantes_pago_public_read" on storage.objects;
create policy "comprobantes_pago_public_read" on storage.objects
  for select using (bucket_id = 'comprobantes-pago');

drop policy if exists "comprobantes_pago_insert" on storage.objects;
create policy "comprobantes_pago_insert" on storage.objects
  for insert with check (
    bucket_id = 'comprobantes-pago'
    and public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa')
  );

drop policy if exists "comprobantes_pago_delete" on storage.objects;
create policy "comprobantes_pago_delete" on storage.objects
  for delete using (
    bucket_id = 'comprobantes-pago'
    and public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa')
  );
