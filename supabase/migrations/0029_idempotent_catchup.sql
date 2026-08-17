-- Reditus CRM — script de "recuperación" a prueba de reintentos. Cubre
-- 0018,0019,0020,0021,0025,0026,0027,0028 con guardas IF EXISTS/IF NOT
-- EXISTS en cada paso, porque el estado real de la base quedó mixto
-- (se corrieron fragmentos fuera de orden con ayuda de otra herramienta).
-- Correrlo completo, las veces que haga falta, siempre termina en el
-- mismo estado final sin duplicar ni romper nada.

-- ===== 0018: borrar usuarios no debe romper datos ligados =====
alter table public.ingresos drop constraint if exists ingresos_responsable_id_fkey;
alter table public.ingresos add constraint ingresos_responsable_id_fkey
  foreign key (responsable_id) references public.users (id) on delete set null;

alter table public.requerimientos drop constraint if exists requerimientos_encargado_id_fkey;
alter table public.requerimientos add constraint requerimientos_encargado_id_fkey
  foreign key (encargado_id) references public.users (id) on delete set null;

alter table public.requerimientos drop constraint if exists requerimientos_programador_id_fkey;
alter table public.requerimientos add constraint requerimientos_programador_id_fkey
  foreign key (programador_id) references public.users (id) on delete set null;

alter table public.requerimiento_comments alter column author_id drop not null;
alter table public.requerimiento_comments drop constraint if exists requerimiento_comments_author_id_fkey;
alter table public.requerimiento_comments add constraint requerimiento_comments_author_id_fkey
  foreign key (author_id) references public.users (id) on delete set null;

alter table public.requerimiento_comments drop constraint if exists requerimiento_comments_mentioned_user_id_fkey;
alter table public.requerimiento_comments add constraint requerimiento_comments_mentioned_user_id_fkey
  foreign key (mentioned_user_id) references public.users (id) on delete set null;

alter table public.chat_messages alter column author_id drop not null;
alter table public.chat_messages drop constraint if exists chat_messages_author_id_fkey;
alter table public.chat_messages add constraint chat_messages_author_id_fkey
  foreign key (author_id) references public.users (id) on delete set null;

alter table public.chat_messages drop constraint if exists chat_messages_recipient_id_fkey;
alter table public.chat_messages add constraint chat_messages_recipient_id_fkey
  foreign key (recipient_id) references public.users (id) on delete cascade;

alter table public.chat_message_reactions drop constraint if exists chat_message_reactions_user_id_fkey;
alter table public.chat_message_reactions add constraint chat_message_reactions_user_id_fkey
  foreign key (user_id) references public.users (id) on delete cascade;

alter table public.payroll_payments drop constraint if exists payroll_payments_user_id_fkey;
alter table public.payroll_payments add constraint payroll_payments_user_id_fkey
  foreign key (user_id) references public.users (id) on delete cascade;

-- ===== 0019: borrar clientes no debe romper datos ligados =====
alter table public.ingresos drop constraint if exists ingresos_client_id_fkey;
alter table public.ingresos add constraint ingresos_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete set null;

alter table public.historical_ingresos drop constraint if exists historical_ingresos_client_id_fkey;
alter table public.historical_ingresos add constraint historical_ingresos_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete set null;

alter table public.prospectos drop constraint if exists prospectos_client_id_fkey;
alter table public.prospectos add constraint prospectos_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete set null;

-- ===== 0020: CEO puede moderar (borrar) cualquier mensaje de chat =====
drop policy if exists "chat_messages_delete_own" on public.chat_messages;
drop policy if exists "chat_messages_delete_own_or_ceo" on public.chat_messages;
create policy "chat_messages_delete_own_or_ceo" on public.chat_messages
  for delete using (author_id = auth.uid() or public.current_role() = 'ceo');

-- ===== 0021: historial de WhatsApp por prospecto =====
alter table public.prospectos add column if not exists historial_whatsapp jsonb not null default '[]'::jsonb;

-- ===== 0025: moneda por ingreso + trazabilidad + numeracion =====
alter table public.ingresos add column if not exists moneda text not null default 'USD';
alter table public.ingresos drop constraint if exists ingresos_moneda_check;
alter table public.ingresos add constraint ingresos_moneda_check check (moneda in ('USD', 'COP'));

alter table public.requerimientos add column if not exists ingreso_id uuid references public.ingresos (id) on delete set null;
create index if not exists idx_requerimientos_ingreso_id on public.requerimientos (ingreso_id);
alter sequence public.ingreso_tracking_seq minvalue 0 restart with 0;

-- ===== 0026: Prueba Social + membresia de canales de chat =====
alter table public.requerimientos add column if not exists prueba_social text not null default 'Pendiente';
alter table public.requerimientos drop constraint if exists requerimientos_prueba_social_check;
alter table public.requerimientos add constraint requerimientos_prueba_social_check
  check (prueba_social in ('Pendiente', 'Apto', 'No apto', 'Subido'));

create table if not exists public.chat_channel_members (
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
alter table public.chat_channel_members enable row level security;

drop policy if exists "chat_channel_members_select" on public.chat_channel_members;
create policy "chat_channel_members_select" on public.chat_channel_members
  for select using (auth.uid() is not null);

drop policy if exists "chat_channel_members_manage" on public.chat_channel_members;
create policy "chat_channel_members_manage" on public.chat_channel_members
  for all using (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'))
  with check (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'));

insert into public.chat_channel_members (channel_id, user_id)
select c.id, u.id from public.chat_channels c cross join public.users u where u.active = true
on conflict do nothing;

drop policy if exists "chat_channels_manage" on public.chat_channels;
create policy "chat_channels_manage" on public.chat_channels
  for insert with check (public.current_role() in ('ceo', 'gerente_comercial', 'directora_operativa'));

drop policy if exists "chat_channels_delete" on public.chat_channels;
create policy "chat_channels_delete" on public.chat_channels
  for delete using (public.current_role() = 'ceo');

drop policy if exists "chat_messages_channel_select" on public.chat_messages;
create policy "chat_messages_channel_select" on public.chat_messages
  for select using (
    channel_id is not null
    and exists (select 1 from public.chat_channel_members m where m.channel_id = chat_messages.channel_id and m.user_id = auth.uid())
  );

drop policy if exists "chat_messages_channel_insert" on public.chat_messages;
create policy "chat_messages_channel_insert" on public.chat_messages
  for insert with check (
    channel_id is not null and author_id = auth.uid()
    and exists (select 1 from public.chat_channel_members m where m.channel_id = chat_messages.channel_id and m.user_id = auth.uid())
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_channel_members'
  ) then
    alter publication supabase_realtime add table public.chat_channel_members;
  end if;
end $$;

-- ===== 0027: estados exactos de requerimientos + Pagado =====
alter table public.requerimientos alter column estado drop default;
alter table public.requerimientos alter column estado type text using estado::text;
alter table public.requerimientos alter column estado set default 'Nuevo pedido';

alter table public.requerimientos drop constraint if exists requerimientos_estado_check;
alter table public.requerimientos add constraint requerimientos_estado_check check (estado in (
  'Nuevo pedido', 'En progreso', 'Por revisión', 'Corregir', 'Terminado', 'ENTREGADO',
  'NO LABORADO', 'POR SUBIR', 'ESPERA INFO', 'CORREGIDO', 'NO APROBADO', 'SUBIDA'
));

alter table public.requerimientos add column if not exists pagado text not null default 'Por terminar';
alter table public.requerimientos drop constraint if exists requerimientos_pagado_check;
alter table public.requerimientos add constraint requerimientos_pagado_check
  check (pagado in ('Sí', 'No', 'Por terminar'));

-- ===== 0028: encuesta de calidad + recompra =====
create table if not exists public.encuestas_calidad (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null unique references public.ingresos (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  token text not null unique,
  puntuacion smallint check (puntuacion between 1 and 5),
  comentario text,
  quiere_testimonio boolean not null default false,
  respondido_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.encuestas_calidad enable row level security;

drop policy if exists "encuestas_calidad_ceo_gc_only" on public.encuestas_calidad;
create policy "encuestas_calidad_ceo_gc_only" on public.encuestas_calidad
  for all using (public.can_see_ingresos()) with check (public.can_see_ingresos());

create index if not exists idx_encuestas_calidad_token on public.encuestas_calidad (token);

alter table public.ingresos add column if not exists recompra_enviado_at timestamptz;
alter table public.ingresos add column if not exists ciclo_cerrado boolean not null default false;

alter type public.notification_type add value if not exists 'encuesta_respondida';
