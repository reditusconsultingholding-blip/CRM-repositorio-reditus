-- Reditus CRM — permite que CEO/Gerente Comercial ajusten manualmente los
-- pedidos y el gasto histórico que se muestran por cliente en "Base de
-- datos de clientes". El histórico viene de una importación (historical_ingresos)
-- que a veces necesita una corrección puntual sin tener que editar el
-- import completo. Si el ajuste está lleno (no null), reemplaza el valor
-- calculado; si está vacío, se sigue mostrando el total calculado normal.
alter table public.clients
  add column if not exists historico_pedidos_ajuste integer,
  add column if not exists historico_gasto_ajuste_usd numeric;
