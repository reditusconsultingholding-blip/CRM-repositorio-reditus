-- Reditus CRM — igual que 0018 pero para clientes: borrar un cliente
-- fallaba porque ingresos / ingresos históricos / prospectos lo referencian
-- sin permitir null. Ahora esa referencia se pone en null y se conserva el
-- historial (el ingreso ya no queda "sin cliente", pero no desaparece).

alter table public.ingresos
  drop constraint ingresos_client_id_fkey;

alter table public.ingresos
  add constraint ingresos_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete set null;

alter table public.historical_ingresos
  drop constraint historical_ingresos_client_id_fkey;

alter table public.historical_ingresos
  add constraint historical_ingresos_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete set null;

alter table public.prospectos
  drop constraint prospectos_client_id_fkey;

alter table public.prospectos
  add constraint prospectos_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete set null;
