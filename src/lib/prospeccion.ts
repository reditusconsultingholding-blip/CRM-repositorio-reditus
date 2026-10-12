// Embudo de prospección «video gratis» — tipos y constantes puras (seguro
// para importar desde componentes de cliente).
//
// La tabla `prospectos` no se puede ampliar, así que todo lo propio del
// embudo vive dentro de la columna jsonb `respuestas_calificacion`, bajo la
// clave `prospeccion`, y la fila lleva `origen = 'prospeccion'`. La etapa
// fina se guarda ahí; la columna `estado` (enum) recibe el valor equivalente
// para que el resto del CRM siga entendiendo la fila.
import type { ProspectoEstado } from "@/lib/statuses";

export const ORIGEN_PROSPECCION = "prospeccion";
export const CALENDLY_URL = "https://calendly.com/reditusconsultingholding/15min";
export const BUCKET_VIDEOS = "chat-files";
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export const ETAPAS = ["falta_enviar_video", "video_enviado", "respondio", "convertido", "descartado"] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETAPA_LABELS: Record<Etapa, string> = {
  falta_enviar_video: "Falta enviar video",
  video_enviado: "Video enviado",
  respondio: "Respondió / agendó",
  convertido: "Convertido",
  descartado: "Descartado",
};

export const ETAPA_A_ESTADO: Record<Etapa, ProspectoEstado> = {
  falta_enviar_video: "nuevo",
  video_enviado: "calificando",
  respondio: "agendado",
  convertido: "convertido",
  descartado: "descartado",
};

export const SERVICIOS = ["video", "landing"] as const;
export type Servicio = (typeof SERVICIOS)[number];
export const SERVICIO_LABELS: Record<Servicio, string> = {
  video: "Video creativo",
  landing: "Landing / CRO",
};
/** Cómo se llama la pieza gratis de cada línea. */
export const PIEZA: Record<Servicio, string> = { video: "video", landing: "muestra de landing" };

export const CANALES = ["correo", "instagram", "whatsapp"] as const;
export type Canal = (typeof CANALES)[number];
export const CANAL_LABELS: Record<Canal, string> = {
  correo: "Correo",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
};

export type EventoHistorial = { fecha: string; quien: string; accion: string };

export type Prospeccion = {
  servicio: Servicio;
  etapa: Etapa;
  tienda: string;
  producto: string;
  falencia: string;
  respuesta: string;
  canal: Canal;
  contacto: string;
  pais: string;
  ads_library: string;
  guion: string;
  guion_generado_at: string | null;
  editor_id: string | null;
  video_url: string | null;
  video_nombre: string | null;
  video_path: string | null;
  video_terminado_at: string | null;
  mensaje: string;
  enviado_at: string | null;
  id_externo: string | null;
  fuente: "manual" | "api";
  historial: EventoHistorial[];
};

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function textoONulo(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** Lee el bloque `prospeccion` del jsonb. Devuelve null si la fila no es del
 * embudo (los prospectos de Calendly guardan ahí un arreglo de preguntas). */
export function leerProspeccion(raw: unknown): Prospeccion | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = (raw as Record<string, unknown>).prospeccion;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const o = p as Record<string, unknown>;
  return {
    servicio: (SERVICIOS as readonly string[]).includes(texto(o.servicio)) ? (o.servicio as Servicio) : "video",
    etapa: (ETAPAS as readonly string[]).includes(texto(o.etapa)) ? (o.etapa as Etapa) : "falta_enviar_video",
    tienda: texto(o.tienda),
    producto: texto(o.producto),
    falencia: texto(o.falencia),
    respuesta: texto(o.respuesta),
    canal: (CANALES as readonly string[]).includes(texto(o.canal)) ? (o.canal as Canal) : "correo",
    contacto: texto(o.contacto),
    pais: texto(o.pais),
    ads_library: texto(o.ads_library),
    guion: texto(o.guion),
    guion_generado_at: textoONulo(o.guion_generado_at),
    editor_id: textoONulo(o.editor_id),
    video_url: textoONulo(o.video_url),
    video_nombre: textoONulo(o.video_nombre),
    video_path: textoONulo(o.video_path),
    video_terminado_at: textoONulo(o.video_terminado_at),
    mensaje: texto(o.mensaje),
    enviado_at: textoONulo(o.enviado_at),
    id_externo: textoONulo(o.id_externo),
    fuente: o.fuente === "api" ? "api" : "manual",
    historial: Array.isArray(o.historial) ? (o.historial as EventoHistorial[]) : [],
  };
}

/** La etapa real: si otra parte del CRM cerró la fila (Ingresos marca
 * `convertido` al crear el cliente; alguien la descarta), manda la columna. */
export function etapaEfectiva(estado: string, p: Prospeccion): Etapa {
  if (estado === "convertido") return "convertido";
  if (estado === "descartado") return "descartado";
  return p.etapa === "convertido" || p.etapa === "descartado" ? "respondio" : p.etapa;
}

export type Produccion = "sin_guion" | "sin_editor" | "en_edicion" | "listo";
export const PRODUCCION_LABELS: Record<Produccion, string> = {
  sin_guion: "Sin guion",
  sin_editor: "Sin editor",
  en_edicion: "En edición",
  listo: "Listo para enviar",
};
export function produccion(p: Prospeccion): Produccion {
  if (p.video_terminado_at && p.video_url) return "listo";
  if (p.editor_id) return "en_edicion";
  if (!p.guion.trim()) return "sin_guion";
  return "sin_editor";
}

/** Quién puede recibir la pieza de cada línea. */
export const ROLES_ASIGNABLES: Record<Servicio, string[]> = {
  video: ["editor_video"],
  landing: ["disenador_landing", "programador"],
};

export function urlTienda(tienda: string): string | null {
  const t = tienda.trim();
  if (!t) return null;
  const conProtocolo = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(conProtocolo);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function fmtPeso(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(/[.]0$/, "")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
