-- "SUBIDA" ya existe en el código (REQUERIMIENTO_ESTADOS, su color, el
-- desplegable de estado) pero nunca se agregó al enum real de Postgres —
-- eso rompía en silencio CUALQUIER consulta que lo mencionara (ej. Flujo
-- de trabajo, que por eso aparecía siempre vacío) y habría fallado también
-- si alguien elegía "SUBIDA" en el desplegable de estado.
alter type requerimiento_estado add value if not exists 'SUBIDA';
