-- Reditus CRM — índices de rendimiento.
-- Ninguna tabla tenía índices más allá de la llave primaria. Con pocos
-- registros no se nota, pero apenas crezca el histórico (ingresos,
-- requerimientos, chat) las consultas por fecha/estado/canal se ponen
-- lentas. Estos índices son puramente aditivos: no cambian datos ni
-- comportamiento, solo aceleran las consultas que ya hace la app.

create index if not exists idx_ingresos_fecha on public.ingresos (fecha);
create index if not exists idx_ingresos_estado on public.ingresos (estado);
create index if not exists idx_ingresos_estado_pago on public.ingresos (estado_pago);
create index if not exists idx_ingresos_client_id on public.ingresos (client_id);

create index if not exists idx_requerimientos_pipeline_estado
  on public.requerimientos (pipeline, estado);
create index if not exists idx_requerimientos_encargado_id on public.requerimientos (encargado_id);
create index if not exists idx_requerimientos_programador_id on public.requerimientos (programador_id);
create index if not exists idx_requerimientos_ingreso_id on public.requerimientos (ingreso_id);
create index if not exists idx_requerimientos_updated_at on public.requerimientos (updated_at);

create index if not exists idx_requerimiento_comments_requerimiento_id
  on public.requerimiento_comments (requerimiento_id);

create index if not exists idx_notifications_user_read on public.notifications (user_id, read);

create index if not exists idx_ingreso_items_ingreso_id on public.ingreso_items (ingreso_id);

create index if not exists idx_chat_messages_channel_created
  on public.chat_messages (channel_id, created_at);
