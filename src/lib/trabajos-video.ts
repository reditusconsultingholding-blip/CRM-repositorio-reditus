// Cola de videos — tipos y funciones puras (seguro para componentes de cliente).
//
// El video NO se genera dentro del CRM: lo hace un servidor externo (el
// «trabajador») que cada minuto le pregunta al CRM si hay trabajo. Aquí vive
// el contrato entre los dos: qué es un trabajo y por qué estados pasa.
//
// No hay tabla (no se puede cambiar el esquema): cada trabajo es un JSON en
// Supabase Storage, bucket PRIVADO `trabajos`. La carpeta dice en qué va:
//
//   videos/pendientes/<id>.json   esperando a que un trabajador lo tome
//   videos/en-curso/<id>.json     tomado · generando · montando
//   videos/listos/<id>.json       terminado, con su video
//   videos/fallos/<id>.json       falló definitivamente o se canceló
//
// Lectura y escritura: `src/lib/trabajos-video-server.ts`.

import { leerContexto, leerEscenas, type ContextoProyecto, type EscenaProyecto, type TipoPieza } from "@/lib/proyecto-video";

/** Tope de videos que se pueden pedir por día (hora de Bogotá). Edítalo aquí. */
export const TOPE_DIARIO_VIDEOS = 6;
/** Veces que un trabajo puede tomarse antes de quedar en `fallo`. */
export const MAX_INTENTOS_VIDEO = 3;
/** Si un trabajo tomado pasa este tiempo sin reportar, se le quita al trabajador. */
export const VENCIMIENTO_TOMA_MS = 10 * 60 * 1000;
/** Espera antes de reintentar, según el intento que acaba de fallar (1.º, 2.º…). */
export const ESPERA_REINTENTO_MS = [2 * 60 * 1000, 10 * 60 * 1000];

export const BUCKET_TRABAJOS = "trabajos";
/** Los MP4 terminados quedan junto a los guiones, en el bucket de siempre. */
export const BUCKET_VIDEOS_GENERADOS = "chat-files";
export const CARPETA_VIDEOS_GENERADOS = "videos-generados";

export const ESTADOS_TRABAJO = ["pendiente", "tomado", "generando", "montando", "listo", "fallo"] as const;
export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number];
export const ESTADO_TRABAJO_LABELS: Record<EstadoTrabajo, string> = {
  pendiente: "En cola",
  tomado: "Tomado por el servidor",
  generando: "Generando escenas",
  montando: "Montando el video",
  listo: "Listo",
  fallo: "Falló",
};
export const TONO_TRABAJO: Record<EstadoTrabajo, "neutro" | "azul" | "ambar" | "verde"> = {
  pendiente: "neutro",
  tomado: "azul",
  generando: "azul",
  montando: "azul",
  listo: "verde",
  fallo: "ambar",
};

export function trabajoActivo(e: EstadoTrabajo): boolean {
  return e === "pendiente" || e === "tomado" || e === "generando" || e === "montando";
}

/** `20261011-153012-a1b2c3d4e5f6`: fecha y hora de Bogotá + azar. Ordena por antigüedad. */
export const ID_TRABAJO = /^\d{8}-\d{6}-[0-9a-f]{12}$/;

export type EscenaTrabajo = {
  n: number;
  nombre: string;
  /** Prompt de la escena del formato + lo que dice el guion en ese paso. */
  prompt: string;
  /** Segundos que debe durar en el video final. */
  duracion: number;
  /** La escena muestra el producto: se genera a partir de su foto real si la hay. */
  usaImagenProducto: boolean;
  /** Lo que se dice en la escena (voz y subtítulos). Vacío si no habla nadie. */
  voz: string;
};

export type OpcionesVideo = {
  subtitulos: boolean;
  voz: boolean;
  /** Música de fondo del armado (enlace https o nombre de pista del servidor); null = sin música. */
  musica: string | null;
  /** Identificador del modelo en el proveedor; null = el que diga la configuración del servidor. */
  modelo: string | null;
};

export const OPCIONES_VIDEO_BASE: OpcionesVideo = { subtitulos: true, voz: true, musica: null, modelo: null };

/** Etapas del proyecto por escenas. Un trabajo sin etapa es un video completo de los de antes. */
export const ETAPAS_TRABAJO = ["imagenes", "clips", "armado"] as const;
export type EtapaTrabajo = (typeof ETAPAS_TRABAJO)[number];
export const ETAPA_LABELS: Record<EtapaTrabajo, string> = { imagenes: "Imágenes base", clips: "Clips", armado: "Armado" };

/** Lo que el trabajador reportó de UNA escena (llega por `progreso`, en cuanto la termina). */
export type ReporteEscena = {
  n: number;
  tipo: TipoPieza;
  /** Enlace público de la pieza; vacío si falló. */
  url: string;
  ruta: string | null;
  creditos: number;
  segundos: number;
  error: string;
  fecha: string;
};
export const MAX_REPORTES = 120;
/** Extensiones de imagen base que puede subir el trabajador. */
export const EXT_IMAGEN: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
export const MAX_IMAGENES_PRODUCTO = 4;
/** Fotos del producto subidas desde «Crear video» (pegadas o arrastradas): carpeta dentro de `BUCKET_VIDEOS_GENERADOS`. */
export const CARPETA_FOTOS_PRODUCTO = "videos-fotos";
export const MAX_FOTO_PRODUCTO_BYTES = 10 * 1024 * 1024;
export const TIPOS_FOTO_PRODUCTO: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export type ProgresoTrabajo = { hecho: number; total: number; detalle: string };

export type ResultadoTrabajo = {
  /** Ruta dentro de `BUCKET_VIDEOS_GENERADOS`, o null si el trabajador entregó un enlace externo. */
  ruta: string | null;
  videoUrl: string;
  /** Duración del video montado, en segundos. */
  duracion: number | null;
  proveedor: string;
  modelos: string[];
  sinVoz: boolean;
  avisos: string[];
};

export type TrabajoVideo = {
  id: string;
  tipo: "video";
  guionId: string;
  /** Número de la versión del guion a la que queda ligado el video. */
  version: number;
  formato: string;
  formatoNombre: string;
  producto: string;
  cliente: string;
  pais: string;
  relacionAspecto: string;
  /** Segundos: la suma de las escenas. */
  duracionObjetivo: number;
  escenas: EscenaTrabajo[];
  imagenesProducto: string[];
  opciones: OpcionesVideo;
  pedidoPor: { id: string; nombre: string };
  /** `correccion`: se encoló solo al regenerar el guion con una corrección del cliente. */
  origen: "manual" | "correccion";
  /** Cosas que quien revise debe saber (campos sin completar en los prompts, etc.). */
  avisos: string[];
  /**
   * Cierre obligatorio del video. El trabajador lo dibuja como RÓTULO FINAL en
   * pantalla (texto grande, legible en celular, encima del producto real),
   * además de los subtítulos. Son las palabras del cliente: no se reescriben.
   * Vacíos si el guion se guardó sin esos datos.
   */
  cierre: { oferta: string; llamadoALaAccion: string };

  // ---- proyecto por escenas (servidor/CONTRATO-PROYECTO-VIDEO.md) ----
  /** Null = video completo de los de antes. */
  etapa: EtapaTrabajo | null;
  contexto: ContextoProyecto | null;
  /** SOLO las escenas que hay que procesar en esta etapa (al trabajador le llegan como `escenas`). */
  escenasEtapa: EscenaProyecto[];
  /** Etapa `armado`: todas las escenas en orden, con `clip.url` o `fotoUrl`. */
  todas: EscenaProyecto[];
  /** Escenas ya reportadas por el trabajador. Solo él escribe aquí. */
  reportes: ReporteEscena[];
  /** Créditos totales que el trabajador dijo haber gastado al cerrar. */
  creditos: number;

  estado: EstadoTrabajo;
  motivo: string;
  intentos: number;
  maxIntentos: number;
  creadoAt: string;
  tomadoAt: string | null;
  /** Último reporte del trabajador: con esto se detecta uno muerto. */
  latidoAt: string | null;
  terminadoAt: string | null;
  /** No entregarlo antes de esta hora (espera creciente entre reintentos). */
  noAntesDe: string | null;
  /** Clave de ESTA toma: el trabajador la manda en cada reporte. Nunca viaja a la pantalla. */
  toma: string | null;
  trabajador: string | null;
  progreso: ProgresoTrabajo | null;
  /** Segundos de video pedidos al proveedor (lo que se cobra), sumando reintentos. */
  segundosGenerados: number;
  costoEstimadoUsd: number | null;
  resultado: ResultadoTrabajo | null;
  historial: { fecha: string; estado: EstadoTrabajo; nota: string }[];
};

/** Lo que ve la pantalla: el trabajo sin la clave de la toma. */
export type TrabajoVista = Omit<TrabajoVideo, "toma">;

export function vistaTrabajo(t: TrabajoVideo): TrabajoVista {
  const copia: Partial<TrabajoVideo> = { ...t };
  delete copia.toma;
  // A la pantalla no le hacen falta los prompts completos de cada escena del trabajo.
  if (t.etapa) {
    copia.todas = [];
    copia.contexto = null;
  }
  return copia as TrabajoVista;
}

/** Escenas de un trabajo por etapa que el trabajador todavía no reportó (ni bien ni mal). */
export function escenasSinReportar(t: Pick<TrabajoVideo, "etapa" | "escenasEtapa" | "reportes">): EscenaProyecto[] {
  if (t.etapa !== "imagenes" && t.etapa !== "clips") return [];
  const tipo: TipoPieza = t.etapa === "imagenes" ? "imagen" : "clip";
  return t.escenasEtapa.filter((e) => !t.reportes.some((r) => r.n === e.n && r.tipo === tipo));
}

const piezaFuera = (p: EscenaProyecto["imagen"]) => ({ estado: p.estado, url: p.url, intentos: p.intentos, nota: p.nota });
const escenaFuera = (e: EscenaProyecto) => ({
  n: e.n,
  paso: e.paso,
  tipo: e.tipo,
  titulo: e.titulo,
  nombre: e.titulo,
  duracion: e.duracion,
  voz: e.voz,
  promptImagen: e.promptImagen,
  promptVideo: e.promptVideo,
  fotoUrl: e.fotoUrl,
  movimiento: e.movimiento,
  imagen: piezaFuera(e.imagen),
  clip: piezaFuera(e.clip),
});

/**
 * El trabajo tal como lo recibe el trabajador en `/tomar`. Uno de antes viaja
 * igual que siempre. Uno por etapa lleva `etapa`, `contexto`, `escenas` (solo
 * las que faltan: si se retoma tras una caída no se vuelve a pagar lo ya
 * entregado) y `todas`.
 */
export function paraTrabajador(t: TrabajoVideo): Record<string, unknown> {
  if (!t.etapa) {
    const deAntes: Record<string, unknown> = { ...t };
    for (const k of ["etapa", "contexto", "escenasEtapa", "todas", "reportes", "creditos"]) delete deAntes[k];
    return deAntes;
  }
  const resto: Record<string, unknown> = { ...t };
  delete resto.escenasEtapa;
  delete resto.reportes;
  const pendientes = t.etapa === "armado" ? t.escenasEtapa : escenasSinReportar(t);
  return { ...resto, escenas: pendientes.map(escenaFuera), todas: t.todas.map(escenaFuera) };
}

const txt = (v: unknown, max: number) => (typeof v === "string" ? v : "").slice(0, max);
const num = (v: unknown, def = 0) => (typeof v === "number" && Number.isFinite(v) ? v : def);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const lista = (v: unknown) => (Array.isArray(v) ? v : []);

/** Normaliza un trabajo leído de Storage. Devuelve null si no es un trabajo. */
export function leerTrabajo(raw: unknown): TrabajoVideo | null {
  const o = obj(raw);
  const id = txt(o.id, 40);
  if (!ID_TRABAJO.test(id)) return null;
  const estado = txt(o.estado, 20);
  const op = obj(o.opciones);
  const por = obj(o.pedidoPor);
  const pr = o.progreso ? obj(o.progreso) : null;
  const re = o.resultado ? obj(o.resultado) : null;
  return {
    id,
    tipo: "video",
    guionId: txt(o.guionId, 40),
    version: Math.max(1, Math.floor(num(o.version, 1))),
    formato: txt(o.formato, 60),
    formatoNombre: txt(o.formatoNombre, 80),
    producto: txt(o.producto, 240),
    cliente: txt(o.cliente, 160),
    pais: txt(o.pais, 4),
    relacionAspecto: txt(o.relacionAspecto, 10) || "9:16",
    duracionObjetivo: num(o.duracionObjetivo),
    escenas: lista(o.escenas)
      .slice(0, 20)
      .map((e, i) => {
        const x = obj(e);
        return {
          n: Math.floor(num(x.n, i + 1)),
          nombre: txt(x.nombre, 160),
          prompt: txt(x.prompt, 5000),
          duracion: num(x.duracion, 5),
          usaImagenProducto: x.usaImagenProducto === true,
          voz: txt(x.voz, 1200),
        };
      }),
    imagenesProducto: lista(o.imagenesProducto)
      .map((u) => txt(u, 600))
      .filter(Boolean)
      .slice(0, MAX_IMAGENES_PRODUCTO),
    opciones: { subtitulos: op.subtitulos !== false, voz: op.voz !== false, musica: txt(op.musica, 600) || null, modelo: txt(op.modelo, 160) || null },
    etapa: (ETAPAS_TRABAJO as readonly string[]).includes(txt(o.etapa, 12)) ? (txt(o.etapa, 12) as EtapaTrabajo) : null,
    contexto: o.contexto ? leerContexto(o.contexto) : null,
    escenasEtapa: leerEscenas(o.escenasEtapa),
    todas: leerEscenas(o.todas),
    reportes: lista(o.reportes)
      .slice(-MAX_REPORTES)
      .map((r) => {
        const x = obj(r);
        return {
          n: Math.floor(num(x.n)),
          tipo: x.tipo === "clip" ? ("clip" as const) : ("imagen" as const),
          url: txt(x.url, 600),
          ruta: txt(x.ruta, 400) || null,
          creditos: Math.max(0, num(x.creditos)),
          segundos: Math.max(0, num(x.segundos)),
          error: txt(x.error, 600),
          fecha: txt(x.fecha, 40),
        };
      }),
    creditos: Math.max(0, num(o.creditos)),
    pedidoPor: { id: txt(por.id, 40), nombre: txt(por.nombre, 160) },
    origen: o.origen === "correccion" ? "correccion" : "manual",
    cierre: {
      oferta: txt((o.cierre as Record<string, unknown> | undefined)?.oferta, 400),
      llamadoALaAccion: txt((o.cierre as Record<string, unknown> | undefined)?.llamadoALaAccion, 200),
    },
    avisos: lista(o.avisos)
      .map((a) => txt(a, 400))
      .filter(Boolean)
      .slice(0, 12),
    estado: (ESTADOS_TRABAJO as readonly string[]).includes(estado) ? (estado as EstadoTrabajo) : "pendiente",
    motivo: txt(o.motivo, 800),
    intentos: Math.max(0, Math.floor(num(o.intentos))),
    maxIntentos: Math.max(1, Math.floor(num(o.maxIntentos, MAX_INTENTOS_VIDEO))),
    creadoAt: txt(o.creadoAt, 40),
    tomadoAt: txt(o.tomadoAt, 40) || null,
    latidoAt: txt(o.latidoAt, 40) || null,
    terminadoAt: txt(o.terminadoAt, 40) || null,
    noAntesDe: txt(o.noAntesDe, 40) || null,
    toma: txt(o.toma, 60) || null,
    trabajador: txt(o.trabajador, 80) || null,
    progreso: pr ? { hecho: num(pr.hecho), total: num(pr.total), detalle: txt(pr.detalle, 200) } : null,
    segundosGenerados: Math.max(0, num(o.segundosGenerados)),
    costoEstimadoUsd: typeof o.costoEstimadoUsd === "number" && Number.isFinite(o.costoEstimadoUsd) ? o.costoEstimadoUsd : null,
    resultado: re
      ? {
          ruta: txt(re.ruta, 400) || null,
          videoUrl: txt(re.videoUrl, 600),
          duracion: typeof re.duracion === "number" ? re.duracion : null,
          proveedor: txt(re.proveedor, 60),
          modelos: lista(re.modelos)
            .map((m) => txt(m, 160))
            .filter(Boolean)
            .slice(0, 6),
          sinVoz: re.sinVoz === true,
          avisos: lista(re.avisos)
            .map((a) => txt(a, 400))
            .filter(Boolean)
            .slice(0, 12),
        }
      : null,
    historial: lista(o.historial)
      .slice(-40)
      .map((h) => {
        const x = obj(h);
        const e = txt(x.estado, 20);
        return {
          fecha: txt(x.fecha, 40),
          estado: (ESTADOS_TRABAJO as readonly string[]).includes(e) ? (e as EstadoTrabajo) : "pendiente",
          nota: txt(x.nota, 400),
        };
      }),
  };
}

// --------------------------------------------- del guion a las escenas ----

/** Cada paso de la estructura (1 Impacto … 5 CTA) tal como quedó escrito en el guion. */
export type PasoGuion = { paso: number; texto: string; voz: string };

const CORTE_GUION = /^\s*(TEXTO EN PANTALLA|M[ÚU]SICA|B-?ROLL|\d+\s+HOOKS|HOOKS ALTERNATIVOS|NOTAS PARA|POR COMPLETAR)/i;

/** Lo que va entre comillas en un bloque: eso es lo que se dice. */
function dialogo(bloque: string): string {
  const frases: string[] = [];
  for (const linea of bloque.split("\n")) {
    if (/PRODUCTO EN PANTALLA/i.test(linea)) continue;
    for (const m of linea.matchAll(/"([^"]{2,})"|“([^”]{2,})”|«([^»]{2,})»/g)) {
      frases.push((m[1] ?? m[2] ?? m[3] ?? "").trim());
    }
  }
  return frases.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Parte el guion por sus rótulos «PASO n». Un guion sin rótulos devuelve []. */
export function pasosDelGuion(guion: string): PasoGuion[] {
  const lineas = guion.split("\n");
  const pasos: PasoGuion[] = [];
  let actual: { paso: number; lineas: string[] } | null = null;
  const cerrar = () => {
    if (!actual) return;
    const texto = actual.lineas.join("\n").trim();
    pasos.push({ paso: actual.paso, texto, voz: dialogo(texto) });
    actual = null;
  };
  for (const l of lineas) {
    const m = /^\s*PASO\s+(\d)\b/i.exec(l);
    if (m) {
      cerrar();
      actual = { paso: Number(m[1]), lineas: [l] };
    } else if (actual) {
      if (CORTE_GUION.test(l)) cerrar();
      else actual.lineas.push(l);
    }
  }
  cerrar();
  return pasos.filter((p) => p.paso >= 1 && p.paso <= 5);
}

/** Datos entre [corchetes] que quedaron sin completar en un texto. */
export function corchetes(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\[[^\]\n]{1,80}\]/g)].map((m) => m[0]))];
}

/** Qué pasos de la estructura cubre una escena del formato, por su nombre. */
function pasosDeEscena(nombre: string): number[] {
  const n = nombre.toLowerCase();
  const pasos: number[] = [];
  if (/impacto|hook/.test(n)) pasos.push(1);
  if (/bajada/.test(n)) pasos.push(2);
  if (/refuerzo/.test(n)) pasos.push(3);
  if (/subida|coro/.test(n)) pasos.push(4);
  if (/\bcta\b/.test(n)) pasos.push(5);
  return pasos;
}

/** «3–8 s» → 5. Devuelve 0 si no se entiende. */
export function segundosDeTramo(tiempo: string): number {
  const m = /(\d+(?:[.,]\d+)?)\s*[–—-]\s*(\d+(?:[.,]\d+)?)/.exec(tiempo);
  if (!m) return 0;
  const d = Number(m[2].replace(",", ".")) - Number(m[1].replace(",", "."));
  return d > 0 ? d : 0;
}

export type EntradaEscenas = {
  guion: string;
  /** Prompts por escena de la versión (ya rellenados con producto, país y oferta). */
  escenas: { escena: string; prompt: string }[];
  /** Estructura del formato: de aquí salen los tiempos de cada paso. */
  estructura: { paso: number; tiempo: string }[];
  hayImagenes: boolean;
};

/**
 * Arma las escenas que va a generar el trabajador.
 *
 * De los prompts del formato solo son escenas de video los que se llaman
 * «Escena…»; los demás (imagen base, voz narradora, canción, toma real, b-roll)
 * son material de apoyo para producir a mano y no se mandan. A cada escena se
 * le agrega lo que el guion dice en su paso, que es lo único escrito para ESTE
 * producto: los prompts del formato traen campos genéricos entre [corchetes].
 */
export function escenasParaVideo(e: EntradaEscenas): { escenas: EscenaTrabajo[]; avisos: string[] } {
  const avisos: string[] = [];
  const pasos = pasosDelGuion(e.guion);
  const dePaso = (n: number) => pasos.find((p) => p.paso === n) ?? null;
  const deVideo = e.escenas.filter((x) => /^\s*escenas?\b/i.test(x.escena));
  if (!deVideo.length) return { escenas: [], avisos: ["El formato de este guion no trae escenas de video."] };

  // A qué escena le toca cada paso. Un paso que ninguna escena nombra se suma
  // a la escena anterior, para que su frase no se pierda.
  const asignados: number[][] = deVideo.map((x) => pasosDeEscena(x.escena));
  const reclamados = new Set(asignados.flat());
  for (const n of [1, 2, 3, 4, 5]) {
    if (reclamados.has(n) || !dePaso(n)) continue;
    let destino = 0;
    asignados.forEach((ps, i) => {
      if (ps.some((p) => p < n)) destino = i;
    });
    asignados[destino].push(n);
    asignados[destino].sort();
  }
  // Un paso repartido entre varias escenas reparte también su tiempo.
  const veces = new Map<number, number>();
  for (const ps of asignados) for (const p of ps) veces.set(p, (veces.get(p) ?? 0) + 1);
  const yaDicho = new Set<number>();

  const escenas = deVideo.map((x, i): EscenaTrabajo => {
    const ps = asignados[i];
    let duracion = 0;
    const contexto: string[] = [];
    const voces: string[] = [];
    for (const p of ps) {
      const tramo = e.estructura.find((t) => t.paso === p);
      duracion += (tramo ? segundosDeTramo(tramo.tiempo) : 0) / (veces.get(p) ?? 1);
      const pg = dePaso(p);
      if (!pg) continue;
      contexto.push(pg.texto);
      // La frase se dice una sola vez, en la primera escena de ese paso.
      if (pg.voz && !yaDicho.has(p)) {
        voces.push(pg.voz);
        yaDicho.add(p);
      }
    }
    const usaProducto = /foto real|producto/i.test(x.prompt) && ps.some((p) => p >= 4);
    return {
      n: i + 1,
      nombre: x.escena.slice(0, 160),
      prompt: [x.prompt.trim(), contexto.length ? `LO QUE PASA EN ESTA ESCENA SEGÚN EL GUION:\n${contexto.join("\n")}` : ""]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 5000),
      duracion: Math.min(15, Math.max(2, Math.round(duracion || 5))),
      usaImagenProducto: usaProducto && e.hayImagenes,
      voz: voces.join(" ").slice(0, 1200),
    };
  });

  if (!pasos.length) avisos.push("El guion no tiene los rótulos «PASO 1…5»: las escenas salen solo de los prompts del formato, sin voz ni subtítulos.");
  const sinCompletar = corchetes(deVideo.map((x) => x.prompt).join("\n"));
  if (sinCompletar.length) {
    avisos.push(
      `Los prompts del formato traen ${sinCompletar.length} ${sinCompletar.length === 1 ? "campo genérico" : "campos genéricos"} entre [corchetes]: el modelo los interpreta con lo que dice el guion.`,
    );
  }
  if (escenas.some((s) => /foto real|producto/i.test(s.prompt)) && !e.hayImagenes) {
    avisos.push("No se pegaron fotos del producto: las escenas donde aparece se generan solo con texto y el envase puede no parecerse al real.");
  }
  return { escenas, avisos };
}

/** Fecha de Bogotá (AAAAMMDD) y hora (HHMMSS) de un instante: con eso empieza el id. */
export function selloBogota(ahora: Date): { dia: string; hora: string } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(ahora)
    .reduce<Record<string, string>>((a, x) => ({ ...a, [x.type]: x.value }), {});
  return { dia: `${p.year}${p.month}${p.day}`, hora: `${p.hour}${p.minute}${p.second}` };
}
