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

/** El archivo que se guarda en Storage. */
export type GuionGuardado = DatosVideo & {
  id: string;
  version: 1;
  formatoNombre: string;
  formatosVersion: string;
  guion: string;
  origen: OrigenGuion;
  prospectoId: string | null;
  autorId: string;
  autorNombre: string;
  creadoAt: string;
  actualizadoAt: string;
};

const txt = (v: unknown, max: number) => (typeof v === "string" ? v : "").slice(0, max);

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
  const origen = txt(o.origen, 12);
  const prospecto = txt(o.prospectoId, 40);
  return {
    ...leerDatosVideo(o),
    id,
    version: 1,
    formatoNombre: txt(o.formatoNombre, 80),
    formatosVersion: txt(o.formatosVersion, 20),
    guion: txt(o.guion, MAX_GUION),
    origen: origen === "ia" || origen === "plantilla" ? origen : "manual",
    prospectoId: /^[0-9a-f-]{36}$/i.test(prospecto) ? prospecto : null,
    autorId: txt(o.autorId, 40),
    autorNombre: txt(o.autorNombre, 160),
    creadoAt: txt(o.creadoAt, 40),
    actualizadoAt: txt(o.actualizadoAt, 40),
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
