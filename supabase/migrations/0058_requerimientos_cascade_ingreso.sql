-- Al borrar un ingreso, sus requerimientos generados deben irse con él
-- (antes quedaban huérfanos con ingreso_id = null y seguían contando en
-- el Dashboard / Flujo como si algo siguiera pendiente).
alter table public.requerimientos drop constraint if exists requerimientos_ingreso_id_fkey;
alter table public.requerimientos
  add constraint requerimientos_ingreso_id_fkey
  foreign key (ingreso_id) references public.ingresos (id) on delete cascade;
