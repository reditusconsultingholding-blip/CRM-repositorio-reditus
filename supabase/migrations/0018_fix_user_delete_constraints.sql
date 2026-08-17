-- Reditus CRM — arregla la causa real del error al borrar usuarios:
-- borrar un usuario en Auth cae en cascada a public.users, pero varias
-- tablas apuntaban a ese usuario SIN "on delete set null" (algunas ni
-- siquiera permitían null) — Postgres rechazaba el borrado completo con
-- una violación de llave foránea, que llegaba al navegador como un error
-- genérico ("Minified React error #441") en vez de un mensaje claro.
-- Con este cambio, borrar un usuario preserva el historial (ingresos,
-- requerimientos, mensajes, comentarios) pero deja esa referencia en null.

alter table public.ingresos
  drop constraint ingresos_responsable_id_fkey,
  add constraint ingresos_responsable_id_fkey
    foreign key (responsable_id) references public.users (id) on delete set null;

alter table public.requerimientos
  drop constraint requerimientos_encargado_id_fkey,
  add constraint requerimientos_encargado_id_fkey
    foreign key (encargado_id) references public.users (id) on delete set null;

alter table public.requerimientos
  drop constraint requerimientos_programador_id_fkey,
  add constraint requerimientos_programador_id_fkey
    foreign key (programador_id) references public.users (id) on delete set null;

alter table public.requerimiento_comments
  alter column author_id drop not null,
  drop constraint requerimiento_comments_author_id_fkey,
  add constraint requerimiento_comments_author_id_fkey
    foreign key (author_id) references public.users (id) on delete set null;

alter table public.requerimiento_comments
  drop constraint requerimiento_comments_mentioned_user_id_fkey,
  add constraint requerimiento_comments_mentioned_user_id_fkey
    foreign key (mentioned_user_id) references public.users (id) on delete set null;

-- chat_messages: el autor se pone en null si se borra (el mensaje se
-- conserva). El destinatario de un DM en cambio SÍ borra el mensaje en
-- cascada si se borra — el check existente exige que un DM siempre tenga
-- recipient_id, así que no se puede dejar en null sin romper esa regla.
alter table public.chat_messages
  alter column author_id drop not null,
  drop constraint chat_messages_author_id_fkey,
  add constraint chat_messages_author_id_fkey
    foreign key (author_id) references public.users (id) on delete set null;

alter table public.chat_messages
  drop constraint chat_messages_recipient_id_fkey,
  add constraint chat_messages_recipient_id_fkey
    foreign key (recipient_id) references public.users (id) on delete cascade;

alter table public.chat_message_reactions
  drop constraint chat_message_reactions_user_id_fkey,
  add constraint chat_message_reactions_user_id_fkey
    foreign key (user_id) references public.users (id) on delete cascade;

alter table public.payroll_payments
  drop constraint payroll_payments_user_id_fkey,
  add constraint payroll_payments_user_id_fkey
    foreign key (user_id) references public.users (id) on delete cascade;
