-- Reditus CRM — paso 2a: agregar el valor 'programador' al enum user_role.
-- Debe correrse SOLO y confirmarse (commit) antes de 0003b, porque Postgres
-- no permite usar un valor de enum recién agregado en la misma transacción
-- en la que se agrega.
alter type public.user_role add value if not exists 'programador';
