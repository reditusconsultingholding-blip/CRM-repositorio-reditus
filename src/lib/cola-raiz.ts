import "server-only";

// Carpeta raíz de la cola de videos dentro del bucket privado `trabajos`. En
// producción es siempre «videos». Solo las pruebas la cambian
// (COLA_VIDEOS_CARPETA) para que un trabajo, un lote o una configuración de
// prueba jamás se mezclen con los reales ni los tome el servidor real.
export const RAIZ_COLA = /^[a-z0-9-]{1,40}$/.test(process.env.COLA_VIDEOS_CARPETA ?? "") ? (process.env.COLA_VIDEOS_CARPETA as string) : "videos";
export const ES_COLA_DE_PRUEBA = RAIZ_COLA !== "videos";
