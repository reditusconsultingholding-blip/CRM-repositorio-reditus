// Configuración de «Crear video» pensada para volumen — tipos y valores por
// defecto (seguro para componentes de cliente). La edita el CEO dentro de la
// sección; se guarda como JSON en Storage (`lib/videos-config-server.ts`).

export const EXIGENCIAS = ["estricto", "normal"] as const;
export type Exigencia = (typeof EXIGENCIAS)[number];
export const EXIGENCIA_LABELS: Record<Exigencia, string> = {
  estricto: "Estricto: ante la duda, a una persona",
  normal: "Normal: solo se detiene por el producto o el texto",
};

export type ConfigVideos = {
  /** La IA de visión aprueba sola las imágenes base que pasan la lista. */
  autoImagenes: boolean;
  exigencia: Exigencia;
  /** Al terminar los clips se arma de una vez: la persona revisa el video armado, no clip por clip. */
  armarAlTerminarClips: boolean;
  /** Videos nuevos (proyectos que piden clips) por día. */
  videosPorDia: number;
  /** Variaciones (proyectos hijos) por día. */
  variacionesPorDia: number;
  /** Intentos por escena y por tipo (imagen / clip). */
  intentosPorEscena: number;
  /** Gasto máximo en créditos por proyecto; null = sin límite. */
  creditosPorProyecto: number | null;
  /** Gasto máximo en créditos por día (todos los proyectos); null = sin límite. */
  creditosPorDia: number | null;
  actualizadoPor: string;
  actualizadoAt: string;
};

export const CONFIG_VIDEOS_BASE: ConfigVideos = {
  autoImagenes: true,
  exigencia: "estricto",
  armarAlTerminarClips: true,
  videosPorDia: 6,
  variacionesPorDia: 12,
  intentosPorEscena: 3,
  creditosPorProyecto: null,
  creditosPorDia: null,
  actualizadoPor: "",
  actualizadoAt: "",
};

const entero = (v: unknown, def: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def);
const limite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(10_000_000, Math.round(v)) : null);

/** Normaliza lo leído de Storage o lo que manda la pantalla. Nunca lanza. */
export function leerConfigVideos(raw: unknown): ConfigVideos {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const b = CONFIG_VIDEOS_BASE;
  return {
    autoImagenes: typeof o.autoImagenes === "boolean" ? o.autoImagenes : b.autoImagenes,
    exigencia: o.exigencia === "normal" ? "normal" : "estricto",
    armarAlTerminarClips: typeof o.armarAlTerminarClips === "boolean" ? o.armarAlTerminarClips : b.armarAlTerminarClips,
    videosPorDia: entero(o.videosPorDia, b.videosPorDia, 1, 200),
    variacionesPorDia: entero(o.variacionesPorDia, b.variacionesPorDia, 0, 500),
    intentosPorEscena: entero(o.intentosPorEscena, b.intentosPorEscena, 1, 6),
    creditosPorProyecto: limite(o.creditosPorProyecto),
    creditosPorDia: limite(o.creditosPorDia),
    actualizadoPor: typeof o.actualizadoPor === "string" ? o.actualizadoPor.slice(0, 160) : "",
    actualizadoAt: typeof o.actualizadoAt === "string" ? o.actualizadoAt.slice(0, 40) : "",
  };
}

/** Sin ningún límite de gasto configurado: se avisa en pantalla. */
export const sinLimiteDeGasto = (c: ConfigVideos) => c.creditosPorProyecto === null && c.creditosPorDia === null;
