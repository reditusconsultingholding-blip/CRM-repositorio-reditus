// «Crear video» — tipos y funciones puras (seguro para componentes de cliente).
//
// No hay tabla propia: cada guion es un archivo JSON en Supabase Storage
// (bucket `chat-files`, carpeta `videos/`), escrito y leído solo por acciones
// del servidor. Ver `src/app/(protected)/videos/actions.ts`.
import { leerAnuncios, leerFuentes, type AnuncioVideo, type FuenteConsultada } from "@/lib/investigacion-video/tipos";
import { MAX_FOTOS_PROYECTO, leerFicha, leerProyecto, type FichaProducto, type ProyectoVideo } from "@/lib/proyecto-video";

export { VIDEOS_ROLES } from "@/lib/roles";

export const BUCKET_GUIONES = "chat-files";
export const CARPETA_GUIONES = "videos";
export const MAX_REFERENCIAS = 5;
export const MAX_GUION = 12000;

// Países donde Reditus produce o busca referencias. El código es el que
// espera la biblioteca de anuncios de Meta.
export const PAISES = [
  { codigo: "CO", nombre: "Colombia" },
  { codigo: "EC", nombre: "Ecuador" },
  { codigo: "MX", nombre: "México" },
  { codigo: "PE", nombre: "Perú" },
  { codigo: "CL", nombre: "Chile" },
  { codigo: "AR", nombre: "Argentina" },
  { codigo: "PA", nombre: "Panamá" },
  { codigo: "DO", nombre: "República Dominicana" },
  { codigo: "GT", nombre: "Guatemala" },
  { codigo: "VE", nombre: "Venezuela" },
  { codigo: "ES", nombre: "España" },
  { codigo: "US", nombre: "Estados Unidos" },
] as const;
export type CodigoPais = (typeof PAISES)[number]["codigo"];

export function nombrePais(codigo: string): string {
  return PAISES.find((p) => p.codigo === codigo)?.nombre ?? codigo;
}
export function esPais(codigo: string): codigo is CodigoPais {
  return PAISES.some((p) => p.codigo === codigo);
}
/** Convierte un país escrito a mano («colombia», «Mexico») en su código. */
export function codigoDePais(texto: string): CodigoPais | null {
  const plano = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase();
  const t = plano(texto);
  if (!t) return null;
  const p = PAISES.find((x) => x.codigo.toLowerCase() === t || plano(x.nombre) === t || t.includes(plano(x.nombre)));
  return p?.codigo ?? null;
}

/** Búsqueda de anuncios activos de video en la biblioteca de Meta. */
export function urlAdsLibrary(pais: string, palabra: string): string {
  const q = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: pais,
    q: palabra.trim(),
    search_type: "keyword_unordered",
    media_type: "video",
  });
  return `https://www.facebook.com/ads/library/?${q.toString()}`;
}

/** Anuncios con mejor desempeño en TikTok por país (la palabra se escribe allá). */
export function urlTikTokCreativeCenter(pais: string): string {
  return `https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/es?period=30&region=${encodeURIComponent(pais)}`;
}

export function urlTikTokBusqueda(palabra: string): string {
  return `https://www.tiktok.com/search?q=${encodeURIComponent(palabra.trim())}`;
}

/** Solo enlaces http(s): lo que pega la gente se muestra como enlace. */
export function enlaceSeguro(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export type Referencia = {
  enlace: string;
  /** Qué hace el gancho, con las palabras de quien lo vio. */
  gancho: string;
  /** Días activo, si se sabe (texto libre: «45», «desde agosto»). */
  dias: string;
  /** Duplicados o variaciones del mismo anuncio, si se sabe. */
  duplicados: string;
};

export const REFERENCIA_VACIA: Referencia = { enlace: "", gancho: "", dias: "", duplicados: "" };

export function referenciasUtiles(refs: Referencia[]): Referencia[] {
  return refs.filter((r) => r.enlace.trim() || r.gancho.trim()).slice(0, MAX_REFERENCIAS);
}

export type OrigenGuion = "ia" | "plantilla" | "manual";
export const ORIGEN_LABELS: Record<OrigenGuion, string> = {
  ia: "Escrito con IA",
  plantilla: "Plantilla del formato",
  manual: "Escrito a mano",
};

/** Lo que la persona llena en la pantalla. */
export type DatosVideo = {
  formato: string;
  producto: string;
  pais: string;
  cliente: string;
  enlace: string;
  /** Precio o promoción, qué incluye y su condición, tal como la dio el cliente. */
  oferta: string;
  /** Llamado a la acción: qué debe hacer la persona y dónde («pide el tuyo en el botón de abajo»). */
  llamado: string;
  valores: string;
  paisBusqueda: string;
  palabraClave: string;
  referencias: Referencia[];
  resumenMercado: string;
  /**
   * Modo «clonar un anuncio ganador»: transcripción o descripción del anuncio
   * de referencia, pegada por la persona. Si viene, el guion sigue su
   * estructura bloque a bloque (sin copiar su texto ni su marca).
   */
  anuncioClon: string;
  /** Enlace del anuncio de referencia (solo para volver a verlo). */
  anuncioClonEnlace: string;
  /**
   * Investigación automática: análisis del PRODUCTO hecho por la IA con lo que
   * dio el cliente (y su página, si se pudo leer). No incluye anuncios vistos.
   */
  analisisProducto: string;
  /** El análisis usó lo que publica la página del producto. */
  analisisLeyoPagina: boolean;
  /** Slugs que recomendó el análisis, del más al menos conveniente. */
  formatosRecomendados: string[];
  /** Anuncios activos de Meta que trajo la investigación (hasta 12), con su enlace. */
  anunciosHallados: AnuncioVideo[];
  /** Qué fuentes se consultaron y qué dio cada una (o por qué no). */
  fuentesInvestigacion: FuenteConsultada[];
  /** Fecha ISO si los anuncios salieron de una consulta guardada; vacío si son frescos. */
  investigacionCache: string;
  /** Fotos reales del producto (https). Se animan tal cual en las escenas de producto y en el cierre. */
  fotosProducto: string[];
  /** Ficha del producto: lo que la IA vio en las fotos y lo que se preguntó, confirmado por una persona. */
  fichaProducto: FichaProducto;
};

/** Rótulo honesto de la investigación: dice de dónde salió lo que se lee. */
export function rotuloInvestigacion(
  d: Pick<DatosVideo, "analisisProducto" | "analisisLeyoPagina" | "referencias" | "anunciosHallados" | "fuentesInvestigacion" | "investigacionCache">,
): string {
  const n = referenciasUtiles(d.referencias).length;
  const refs = n ? `${n} ${n === 1 ? "referencia pegada" : "referencias pegadas"} por el equipo` : "";
  if (!d.analisisProducto.trim() && !d.fuentesInvestigacion.length) return refs || "Sin investigación todavía";
  const partes: string[] = [];
  const a = d.anunciosHallados.length;
  if (a) partes.push(`${a} ${a === 1 ? "anuncio activo" : "anuncios activos"} de Meta${d.investigacionCache ? " (consulta guardada)" : ""}`);
  if (d.analisisLeyoPagina) partes.push("página del producto");
  if (refs) partes.push(refs);
  const meta = d.fuentesInvestigacion.find((f) => f.id === "meta-anuncios");
  const sinAnuncios = a
    ? ""
    : meta?.estado === "sin_clave"
      ? `Sin anuncios consultados: falta conectar la fuente de anuncios (${meta.faltan.join(" o ")})`
      : "Sin anuncios consultados";
  const base = partes.length ? `Investigación con ${partes.join(" + ")}` : "Análisis del producto";
  return sinAnuncios ? `${base} · ${sinAnuncios}` : base;
}

export const MAX_ANUNCIO_CLON = 6000;

// ---- estado, correcciones del cliente y versiones ----

export const ESTADOS_GUION = ["borrador", "enviado", "correccion_pendiente", "aprobado"] as const;
export type EstadoGuion = (typeof ESTADOS_GUION)[number];
export const ESTADO_GUION_LABELS: Record<EstadoGuion, string> = {
  borrador: "Borrador",
  enviado: "Enviado al cliente",
  correccion_pendiente: "Con corrección pendiente",
  aprobado: "Aprobado por el cliente",
};

export const MAX_CORRECCION = 4000;
export const MAX_VERSIONES = 80;

/** Lo que pidió el cliente, pegado tal cual. */
export type Correccion = {
  id: string;
  texto: string;
  registradaPor: string;
  registradaPorId: string;
  fecha: string;
  /** `pendiente` hasta que una versión del guion la resuelve. */
  estado: "pendiente" | "aplicada";
  /** Número de la versión que la aplicó. */
  version: number | null;
};

/**
 * Una versión del guion. Nunca se borra ni se reescribe: cada cambio de texto
 * (a mano, con IA, por una corrección o al restaurar) agrega una nueva.
 */
export type VersionGuion = {
  n: number;
  guion: string;
  /** Prompts por escena del formato, rellenados con los datos de ese momento. */
  escenas: { escena: string; prompt: string }[];
  origen: OrigenGuion;
  /** Corrección del cliente que originó esta versión, si la hubo. */
  correccionId: string | null;
  correccion: string;
  /** Nota corta de qué cambió respecto de la versión anterior. */
  queCambio: string;
  restauradaDe: number | null;
  autorId: string;
  autorNombre: string;
  fecha: string;
  /** Video generado con ESTA versión (lo liga el servidor de videos al entregarlo). */
  videoUrl: string | null;
  /** Último trabajo de la cola de videos pedido para esta versión (`lib/trabajos-video.ts`). */
  videoTrabajoId: string | null;
  /** Quién aprobó el video. Sin esto está «Por aprobar» y no puede salir hacia el cliente. */
  videoAprobado: AprobacionVideo | null;
  /** Proyecto por escenas de esta versión (`lib/proyecto-video.ts`). Null en los guiones de antes: se pueden convertir. */
  proyecto: ProyectoVideo | null;
};

export type AprobacionVideo = { porId: string; por: string; fecha: string };

/** El video de una versión ya tiene el sí de alguien del equipo comercial. */
export function videoAprobado(v: Pick<VersionGuion, "videoUrl" | "videoAprobado">): boolean {
  return !!v.videoUrl && !!v.videoAprobado;
}

/** El archivo que se guarda en Storage. */
export type GuionGuardado = DatosVideo & {
  id: string;
  version: 1;
  formatoNombre: string;
  formatosVersion: string;
  /** Texto de la versión vigente (la última de `versiones`). */
  guion: string;
  origen: OrigenGuion;
  estado: EstadoGuion;
  versiones: VersionGuion[];
  correcciones: Correccion[];
  prospectoId: string | null;
  autorId: string;
  autorNombre: string;
  creadoAt: string;
  actualizadoAt: string;
};

export function versionVigente(g: Pick<GuionGuardado, "versiones">): VersionGuion | null {
  return g.versiones[g.versiones.length - 1] ?? null;
}

const txt = (v: unknown, max: number) => (typeof v === "string" ? v : "").slice(0, max);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const origenDe = (v: unknown): OrigenGuion => (v === "ia" || v === "plantilla" ? v : "manual");

function leerAprobacion(raw: unknown): AprobacionVideo | null {
  const a = obj(raw);
  const porId = txt(a.porId, 40);
  const fecha = txt(a.fecha, 40);
  return porId && fecha ? { porId, por: txt(a.por, 160), fecha } : null;
}

function leerVersiones(raw: unknown): VersionGuion[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-MAX_VERSIONES).map((r, i) => {
    const x = obj(r);
    return {
      n: typeof x.n === "number" && x.n > 0 ? Math.floor(x.n) : i + 1,
      guion: txt(x.guion, MAX_GUION),
      escenas: (Array.isArray(x.escenas) ? x.escenas : []).slice(0, 20).map((e) => {
        const y = obj(e);
        return { escena: txt(y.escena, 160), prompt: txt(y.prompt, 3000) };
      }),
      origen: origenDe(x.origen),
      correccionId: txt(x.correccionId, 40) || null,
      correccion: txt(x.correccion, MAX_CORRECCION),
      queCambio: txt(x.queCambio, 1200),
      restauradaDe: typeof x.restauradaDe === "number" ? x.restauradaDe : null,
      autorId: txt(x.autorId, 40),
      autorNombre: txt(x.autorNombre, 160),
      fecha: txt(x.fecha, 40),
      videoUrl: txt(x.videoUrl, 600) || null,
      videoTrabajoId: txt(x.videoTrabajoId, 40) || null,
      videoAprobado: leerAprobacion(x.videoAprobado),
      proyecto: leerProyecto(x.proyecto),
    };
  });
}

function leerCorrecciones(raw: unknown): Correccion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-60)
    .map((r) => {
      const x = obj(r);
      return {
        id: txt(x.id, 40),
        texto: txt(x.texto, MAX_CORRECCION),
        registradaPor: txt(x.registradaPor, 160),
        registradaPorId: txt(x.registradaPorId, 40),
        fecha: txt(x.fecha, 40),
        estado: x.estado === "aplicada" ? ("aplicada" as const) : ("pendiente" as const),
        version: typeof x.version === "number" ? x.version : null,
      };
    })
    .filter((c) => c.id && c.texto.trim());
}

export type LineaDiff = { tipo: "igual" | "quita" | "pone"; texto: string };

/** Diferencias por líneas entre dos textos (subsecuencia común más larga). */
export function diffLineas(antes: string, despues: string): LineaDiff[] {
  const a = antes.split("\n");
  const b = despues.split("\n");
  const n = a.length;
  const m = b.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  const out: LineaDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ tipo: "igual", texto: a[i] });
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) out.push({ tipo: "quita", texto: a[i++] });
    else out.push({ tipo: "pone", texto: b[j++] });
  }
  while (i < n) out.push({ tipo: "quita", texto: a[i++] });
  while (j < m) out.push({ tipo: "pone", texto: b[j++] });
  return out;
}

/** Normaliza lo que llega del cliente o de un archivo viejo. Nunca lanza. */
export function leerDatosVideo(raw: unknown): DatosVideo {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const refs = Array.isArray(o.referencias) ? o.referencias : [];
  const pais = txt(o.pais, 4);
  const paisBusqueda = txt(o.paisBusqueda, 4);
  return {
    formato: txt(o.formato, 60),
    producto: txt(o.producto, 240).trim(),
    pais: esPais(pais) ? pais : "CO",
    cliente: txt(o.cliente, 160).trim(),
    enlace: txt(o.enlace, 500).trim(),
    oferta: txt(o.oferta, 400).trim(),
    llamado: txt(o.llamado, 200).trim(),
    valores: txt(o.valores, 4000).trim(),
    paisBusqueda: esPais(paisBusqueda) ? paisBusqueda : esPais(pais) ? pais : "CO",
    palabraClave: txt(o.palabraClave, 120).trim(),
    referencias: refs.slice(0, MAX_REFERENCIAS).map((r) => {
      const x = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
      return {
        enlace: txt(x.enlace, 500).trim(),
        gancho: txt(x.gancho, 600).trim(),
        dias: txt(x.dias, 60).trim(),
        duplicados: txt(x.duplicados, 60).trim(),
      };
    }),
    resumenMercado: txt(o.resumenMercado, 6000),
    anuncioClon: txt(o.anuncioClon, MAX_ANUNCIO_CLON),
    anuncioClonEnlace: txt(o.anuncioClonEnlace, 500).trim(),
    analisisProducto: txt(o.analisisProducto, 6000),
    analisisLeyoPagina: o.analisisLeyoPagina === true,
    formatosRecomendados: (Array.isArray(o.formatosRecomendados) ? o.formatosRecomendados : [])
      .filter((x): x is string => typeof x === "string" && /^[a-z0-9-]{1,60}$/.test(x))
      .slice(0, 3),
    anunciosHallados: leerAnuncios(o.anunciosHallados),
    fuentesInvestigacion: leerFuentes(o.fuentesInvestigacion),
    investigacionCache: txt(o.investigacionCache, 40),
    fotosProducto: (Array.isArray(o.fotosProducto) ? o.fotosProducto : [])
      .filter((x): x is string => typeof x === "string" && x.startsWith("https://"))
      .map((x) => x.slice(0, 600))
      .slice(0, MAX_FOTOS_PROYECTO),
    fichaProducto: leerFicha(o.fichaProducto),
  };
}

export function leerGuionGuardado(raw: unknown): GuionGuardado | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = txt(o.id, 40);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const prospecto = txt(o.prospectoId, 40);
  const guion = txt(o.guion, MAX_GUION);
  const origen = origenDe(o.origen);
  const autorId = txt(o.autorId, 40);
  const autorNombre = txt(o.autorNombre, 160);
  const creadoAt = txt(o.creadoAt, 40);
  const actualizadoAt = txt(o.actualizadoAt, 40);
  let versiones = leerVersiones(o.versiones);
  // Archivos guardados antes de que existieran las versiones: su guion es la v1.
  if (!versiones.length) {
    versiones = [
      {
        n: 1,
        guion,
        escenas: [],
        origen,
        correccionId: null,
        correccion: "",
        queCambio: "",
        restauradaDe: null,
        autorId,
        autorNombre,
        fecha: actualizadoAt || creadoAt,
        videoUrl: null,
        videoTrabajoId: null,
        videoAprobado: null,
        proyecto: null,
      },
    ];
  }
  const estado = txt(o.estado, 30);
  return {
    ...leerDatosVideo(o),
    id,
    version: 1,
    formatoNombre: txt(o.formatoNombre, 80),
    formatosVersion: txt(o.formatosVersion, 20),
    guion,
    origen,
    estado: (ESTADOS_GUION as readonly string[]).includes(estado) ? (estado as EstadoGuion) : "borrador",
    versiones,
    correcciones: leerCorrecciones(o.correcciones),
    prospectoId: /^[0-9a-f-]{36}$/i.test(prospecto) ? prospecto : null,
    autorId,
    autorNombre,
    creadoAt,
    actualizadoAt,
  };
}

/**
 * Rellena un texto del formato (plantilla de guion o prompt de escena) con
 * los datos que sí se tienen. Lo que falta queda entre [corchetes] para que
 * alguien lo complete con información real del cliente: nunca se inventa.
 */
export function rellenar(texto: string, d: Pick<DatosVideo, "producto" | "pais" | "cliente" | "oferta" | "llamado">): string {
  const valores: Record<string, string> = {
    producto: d.producto || "[producto]",
    pais: nombrePais(d.pais),
    cliente: d.cliente || "[cliente]",
    oferta: d.oferta || "[oferta: precio o promoción, qué incluye y condición que confirme el cliente]",
    llamado: d.llamado || "[llamado a la acción: qué debe hacer la persona y dónde]",
    beneficio: "[beneficio principal, con las palabras del cliente]",
    dolor: "[dolor principal del comprador]",
  };
  return texto.replace(/\{\{(\w+)\}\}/g, (_, k: string) => valores[k] ?? `[${k}]`);
}

// ---- el cierre (paso 5): oferta + llamado a la acción, siempre ----

/** El bloque del paso 5 dentro de un guion: desde su rótulo hasta la primera línea en blanco. */
export function bloquePasoCinco(guion: string): { inicio: number; fin: number; texto: string } | null {
  const lineas = guion.split("\n");
  const i = lineas.findIndex((l) => /^\s*PASO 5\b/i.test(l));
  if (i < 0) return null;
  let j = i + 1;
  while (j < lineas.length && lineas[j].trim() !== "") j++;
  return { inicio: i, fin: j, texto: lineas.slice(i, j).join("\n") };
}

function palabrasClave(texto: string): string[] {
  return [
    ...new Set(
      texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9ñ$%]+/)
        .filter((p) => p.length >= 4 || /\d/.test(p)),
    ),
  ];
}

function contiene(bloque: string, dato: string): boolean {
  const claves = palabrasClave(dato);
  if (!claves.length) return false;
  const plano = palabrasClave(bloque).join(" ");
  const halladas = claves.filter((c) => plano.includes(c)).length;
  // Se acepta que la IA lo diga con otras palabras, pero deben estar casi todas las del cliente.
  return halladas / claves.length >= 0.6;
}

/**
 * ¿El paso 5 del guion trae la oferta y el llamado a la acción que dio el
 * cliente? Devuelve lo que falta (vacío = cierre completo).
 */
export function faltaEnElCierre(guion: string, d: Pick<DatosVideo, "oferta" | "llamado">): string[] {
  const falta: string[] = [];
  if (!d.oferta.trim()) falta.push("la oferta (falta escribirla en los datos)");
  if (!d.llamado.trim()) falta.push("el llamado a la acción (falta escribirlo en los datos)");
  const b = bloquePasoCinco(guion);
  if (!b) return ["el paso 5 (no está rotulado en el guion)", ...falta];
  if (d.oferta.trim() && !contiene(b.texto, d.oferta)) falta.push("la oferta en el paso 5");
  if (d.llamado.trim() && !contiene(b.texto, d.llamado)) falta.push("el llamado a la acción en el paso 5");
  return falta;
}

/** Cierre escrito sin IA: exactamente lo que dio el cliente, sin agregar nada. */
export function cierreLiteral(rotulo: string, d: Pick<DatosVideo, "producto" | "oferta" | "llamado">): string {
  const oferta = d.oferta.trim() || "[oferta que confirme el cliente]";
  const llamado = d.llamado.trim() || "[llamado a la acción]";
  return [
    `${rotulo}: "${oferta.replace(/[.\s]+$/, "")}. ${llamado.replace(/[.\s]+$/, "")}."`,
    `   OFERTA EN VOZ Y EN PANTALLA: ${oferta}`,
    `   LLAMADO A LA ACCIÓN: ${llamado}`,
    `   CIERRE: ${d.producto || "[producto]"} real en pantalla con la oferta en texto grande, mínimo 5 s`,
  ].join("\n");
}

/** Cambia solo el bloque del paso 5 de un guion; el resto queda idéntico. */
export function reemplazarPasoCinco(guion: string, bloqueNuevo: string): string {
  const b = bloquePasoCinco(guion);
  if (!b) return `${guion.trimEnd()}\n\n${bloqueNuevo}\n`;
  const lineas = guion.split("\n");
  return [...lineas.slice(0, b.inicio), ...bloqueNuevo.split("\n"), ...lineas.slice(b.fin)].join("\n");
}

/** Primera línea de todo guion: deja escrito de dónde salió el mercado. */
export function lineaMercado(refs: Referencia[]): string {
  const n = referenciasUtiles(refs).length;
  return n
    ? `MERCADO: ${n} ${n === 1 ? "referencia pegada" : "referencias pegadas"} por el equipo (la IA no vio los anuncios)`
    : "MERCADO: sin referencias de mercado";
}
