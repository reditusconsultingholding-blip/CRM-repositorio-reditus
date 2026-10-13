// Video automático para un prospecto — tipos (seguro para componentes de cliente).
//
// Con solo el prospecto (tienda o producto, enlace y país) el sistema entra a
// la página, toma las fotos reales, investiga el mercado de ESE país, escribe
// el guion, elige formato, propone oferta y llamado, y lanza el modo directo.
// Antes, el dueño dice Sí o No (salvo que apague esa pregunta en «Topes y
// automatización»). El estado vive en Storage, junto a la cola: no toca la
// ficha del prospecto.
import type { FichaProducto } from "@/lib/proyecto-video";

export const ETAPAS_VIDEO_PROSPECTO = ["sin-decidir", "no", "agendado", "pagina", "investigacion", "lanzado", "detenido"] as const;
export type EtapaVideoProspecto = (typeof ETAPAS_VIDEO_PROSPECTO)[number];
export const ETAPA_VIDEO_LABELS: Record<EtapaVideoProspecto, string> = {
  "sin-decidir": "Espera tu decisión",
  no: "No se hace",
  agendado: "Agendado",
  pagina: "Fotos y producto listos",
  investigacion: "Investigación lista",
  lanzado: "Video en marcha",
  detenido: "Detenido",
};

export type VideoProspecto = {
  prospectoId: string;
  etapa: EtapaVideoProspecto;
  /** Qué pasó o qué falta, dicho en claro. */
  detalle: string;
  decididoPor: string;
  decididoPorId: string;
  decididoAt: string;
  guionId: string | null;
  /** Lo que se detectó en la página. */
  producto: string;
  productoUrl: string;
  precio: string;
  fotos: string[];
  ficha: FichaProducto | null;
  oferta: string;
  llamado: string;
  /** Datos del video ya investigados (se guardan entre etapas para no repetir la investigación). */
  datos: unknown;
  /** Etapa en la que se detuvo, para reintentar desde ahí. */
  retomarEn: EtapaVideoProspecto | "";
  actualizadoAt: string;
};

/** Un prospecto al que se le puede hacer video: solo sus datos de producción. */
export type CandidatoVideo = { id: string; nombre: string; producto: string; tienda: string; pais: string; creado: string };

export type FilaVideoProspecto = { candidato: CandidatoVideo; video: VideoProspecto };

export const videoVacio = (prospectoId: string): VideoProspecto => ({
  prospectoId,
  etapa: "sin-decidir",
  detalle: "",
  decididoPor: "",
  decididoPorId: "",
  decididoAt: "",
  guionId: null,
  producto: "",
  productoUrl: "",
  precio: "",
  fotos: [],
  ficha: null,
  oferta: "",
  llamado: "",
  datos: null,
  retomarEn: "",
  actualizadoAt: "",
});

export const enMarcha = (e: EtapaVideoProspecto) => e === "agendado" || e === "pagina" || e === "investigacion";

/** Lo que cuesta, dicho antes de decidir. Los créditos exactos dependen del proveedor; aquí va lo que se genera. */
export const COSTO_ESTIMADO_PROSPECTO =
  "Costo estimado: 1 consulta de anuncios del país + de 3 a 5 imágenes y de 3 a 5 clips de hasta 8 s (unos 30 s de video generado). Las escenas con foto real y el armado no cuestan. Se detiene si llega a un tope.";
