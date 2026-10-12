// «Crear video» — tipos y funciones puras (seguro para componentes de cliente).
//
// No hay tabla propia: cada guion es un archivo JSON en Supabase Storage
// (bucket `chat-files`, carpeta `videos/`), escrito y leído solo por acciones
// del servidor. Ver `src/app/(protected)/videos/actions.ts`.
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
  oferta: string;
  valores: string;
  paisBusqueda: string;
  palabraClave: string;
  referencias: Referencia[];
  resumenMercado: string;
};

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
  /** Video generado con ESTA versión (lo llena `generarVideo()` cuando exista). */
  videoUrl: string | null;
};

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
export function rellenar(texto: string, d: Pick<DatosVideo, "producto" | "pais" | "cliente" | "oferta">): string {
  const valores: Record<string, string> = {
    producto: d.producto || "[producto]",
    pais: nombrePais(d.pais),
    cliente: d.cliente || "[cliente]",
    oferta: d.oferta || "[oferta del país: envío, forma de pago y precio que confirme el cliente]",
    beneficio: "[beneficio principal, con las palabras del cliente]",
    dolor: "[dolor principal del comprador]",
  };
  return texto.replace(/\{\{(\w+)\}\}/g, (_, k: string) => valores[k] ?? `[${k}]`);
}

/** Primera línea de todo guion: deja escrito de dónde salió el mercado. */
export function lineaMercado(refs: Referencia[]): string {
  const n = referenciasUtiles(refs).length;
  return n
    ? `MERCADO: ${n} ${n === 1 ? "referencia pegada" : "referencias pegadas"} por el equipo (la IA no vio los anuncios)`
    : "MERCADO: sin referencias de mercado";
}
