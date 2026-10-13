// Las secciones de «Creativos» (`/videos?vista=…`). Las usa el menú lateral (subentradas)
// y la propia pantalla (pestañas). Los enlaces viejos `/videos?guion=<id>` siguen abriendo
// ese video (en el Estudio si ya es un proyecto).

export const VISTAS_CREATIVOS = [
  { clave: "crear", nombre: "Crear video", para: "Un video nuevo a partir del producto.", enMenu: true },
  { clave: "clonar", nombre: "Clonar video", para: "Un video nuevo con la estructura de uno que ya funciona.", enMenu: true },
  { clave: "estudio", nombre: "Estudio de video", para: "El video por escenas: revisar, aprobar y corregir.", enMenu: true },
  { clave: "mis-videos", nombre: "Mis videos", para: "Lo que espera por ti y en qué va cada video.", enMenu: true },
  { clave: "lotes", nombre: "Lotes", para: "Varios videos de una vez.", enMenu: false },
  { clave: "ajustes", nombre: "Ajustes", para: "Topes de gasto, automatización, música y cola.", enMenu: false },
  { clave: "aprendizajes", nombre: "Aprendizajes", para: "Lo que el equipo ha ido corrigiendo, para que no se repita.", enMenu: false },
] as const;

export type VistaCreativos = (typeof VISTAS_CREATIVOS)[number]["clave"];

export const esVistaCreativos = (v: unknown): v is VistaCreativos => VISTAS_CREATIVOS.some((x) => x.clave === v);

/** La vista que corresponde a una dirección de `/videos` (sin `vista`, un `?guion=` lleva al Estudio). */
export function vistaDeParametros(vista: string | null, guion: string | null): VistaCreativos {
  return esVistaCreativos(vista) ? vista : guion ? "estudio" : "crear";
}
