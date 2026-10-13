// Investigación de mercado para «Crear video» — tipos y funciones puras
// (seguro para componentes de cliente).
//
// Secuencia (versión reducida de la investigación de Skania, enfocada en lo
// que sirve para un anuncio de video):
//   1. palabras clave del producto            → tuberia.ts
//   2. fuentes en paralelo, con tope de tiempo → anuncios.ts + página del producto
//   3–5. panorama, comprador y entrega         → lib/videos-investigacion.ts (IA)
// Regla de honestidad: cada dato del mercado lleva su fuente, y lo que no se
// pudo consultar se dice, con la variable que falta.

/** Un anuncio activo de la biblioteca de Meta, ya normalizado. */
export type AnuncioVideo = {
  /** Etiqueta para citarlo: A1, A2… */
  ref: string;
  anunciante: string;
  titular: string;
  texto: string;
  /** Enlace a la biblioteca de anuncios (para abrirlo y verlo). */
  enlace: string;
  /** Código del país donde se consultó. */
  pais: string;
  /** Días que lleva activo; null si la fuente no dio la fecha. */
  dias: number | null;
  /** Anuncios que usan el mismo creativo; null si la fuente no lo informa. */
  duplicados: number | null;
  formato: "video" | "imagen" | "carrusel" | "desconocido";
};

export type EstadoFuente = "ok" | "vacia" | "sin_clave" | "fallo" | "sin_tiempo" | "no_consultada";

export type FuenteConsultada = {
  id: "meta-anuncios" | "pagina-producto" | "referencias-pegadas";
  nombre: string;
  estado: EstadoFuente;
  /** Qué se obtuvo o por qué no, dicho en claro. */
  detalle: string;
  /** Variables de entorno que faltan, si es el caso. */
  faltan: string[];
};

export const MAX_ANUNCIOS_GUARDADOS = 12;

/** Variables que encienden la fuente de anuncios. Basta UNA de las dos primeras. */
export const VARIABLES_ANUNCIOS = ["APIFY_TOKEN", "META_AD_LIBRARY_TOKEN"] as const;

const t = (v: unknown, max: number) => (typeof v === "string" ? v : "").slice(0, max);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** Normaliza anuncios que vuelven del navegador o de un archivo guardado. Nunca lanza. */
export function leerAnuncios(raw: unknown): AnuncioVideo[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_ANUNCIOS_GUARDADOS)
    .map((r, i) => {
      const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
      const enlace = t(o.enlace, 300);
      const formato = t(o.formato, 12);
      return {
        ref: `A${i + 1}`,
        anunciante: t(o.anunciante, 80),
        titular: t(o.titular, 180),
        texto: t(o.texto, 600),
        // Solo enlaces a la biblioteca de anuncios: lo demás se descarta.
        enlace: /^https:\/\/www\.facebook\.com\/ads\/library\/\?id=\d{5,25}$/.test(enlace) ? enlace : "",
        pais: /^[A-Z]{2}$/.test(t(o.pais, 2)) ? t(o.pais, 2) : "",
        dias: n(o.dias),
        duplicados: n(o.duplicados),
        formato: (formato === "video" || formato === "imagen" || formato === "carrusel" ? formato : "desconocido") as AnuncioVideo["formato"],
      };
    })
    .filter((a) => a.anunciante || a.texto);
}

const ESTADOS: EstadoFuente[] = ["ok", "vacia", "sin_clave", "fallo", "sin_tiempo", "no_consultada"];
const IDS = ["meta-anuncios", "pagina-producto", "referencias-pegadas"];

export function leerFuentes(raw: unknown): FuenteConsultada[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 6)
    .map((r) => {
      const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
      const estado = t(o.estado, 20) as EstadoFuente;
      return {
        id: t(o.id, 30) as FuenteConsultada["id"],
        nombre: t(o.nombre, 80),
        estado: ESTADOS.includes(estado) ? estado : ("no_consultada" as const),
        detalle: t(o.detalle, 400),
        faltan: (Array.isArray(o.faltan) ? o.faltan : []).filter((x): x is string => typeof x === "string" && /^[A-Z_]{3,40}$/.test(x)).slice(0, 4),
      };
    })
    .filter((f) => IDS.includes(f.id));
}

/** Una línea por anuncio, con su enlace: así se le pasa a la IA y así se cita. */
export function lineaAnuncio(a: AnuncioVideo): string {
  const datos = [
    a.dias !== null ? `${a.dias} días activo` : "días activo: sin dato",
    a.duplicados !== null ? `${a.duplicados} con el mismo creativo` : "",
    a.formato !== "desconocido" ? a.formato : "",
    a.pais,
  ].filter(Boolean);
  return `[${a.ref}] ${a.anunciante || "Anunciante sin nombre"} · ${datos.join(" · ")} · ${a.enlace || "sin enlace"}\n     ${[a.titular, a.texto].filter(Boolean).join(" — ").slice(0, 420)}`;
}
