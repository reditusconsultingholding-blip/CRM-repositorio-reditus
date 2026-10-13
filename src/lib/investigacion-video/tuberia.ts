import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarAnuncios, filtrarYOrdenar, palabrasDelTema, viaAnuncios, type AnuncioCrudo } from "./anuncios";
import { MAX_ANUNCIOS_GUARDADOS, VARIABLES_ANUNCIOS, leerAnuncios, type AnuncioVideo, type FuenteConsultada } from "./tipos";

// Orquesta la fuente de anuncios cuidando el gasto. La cuenta de Apify es de
// plan pequeño y se comparte con Skania, así que:
//  · una sola pasada por país, sin reintentos (un reintento vuelve a cobrar);
//  · pocos resultados por consulta (`MAX_POR_CONSULTA` en anuncios.ts);
//  · solo se baja al siguiente país si el anterior trajo menos de `MINIMO_UTILES`;
//  · caché de 7 días por producto + país;
//  · tope diario de investigaciones que consultan anuncios.

/** Investigaciones CON consulta de anuncios por día (las que salen de caché no cuentan). */
export const TOPE_DIARIO_INVESTIGACIONES = 10;
/** Con menos anuncios útiles que esto en un país, se intenta el siguiente. */
export const MINIMO_UTILES = 5;
/** Con menos anuncios del producto que esto, se amplía a su categoría en el mismo país. */
export const MINIMO_CATEGORIA = 3;
export const DIAS_CACHE = 7;
/** Plazo total para la fuente de anuncios, en ms. La acción entera debe caber en la función de Vercel. */
export const PLAZO_ANUNCIOS_MS = 75_000;

const BUCKET = "chat-files";
const CARPETA = "videos/_investigacion";
/** Orden que pidió el dueño: el país del video, luego Colombia, Ecuador y otros de habla hispana. */
const RESPALDO = ["CO", "EC", "MX", "PE", "CL"];

export type ResultadoAnuncios = {
  anuncios: AnuncioVideo[];
  fuente: FuenteConsultada;
  /** Término con el que se buscó. */
  palabra: string;
  /** Fecha ISO del resultado guardado, si salió de la caché. */
  deCache: string | null;
};

type Guardado = { fecha: string; palabra: string; paises: string[]; anuncios: AnuncioVideo[] };

async function leerJson(ruta: string): Promise<unknown> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !clave) return null;
  try {
    const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${ruta}`, {
      headers: { Authorization: `Bearer ${clave}`, apikey: clave },
      cache: "no-store",
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function escribirJson(ruta: string, dato: unknown): Promise<void> {
  try {
    await createAdminClient()
      .storage.from(BUCKET)
      .upload(ruta, JSON.stringify(dato), { contentType: "application/json; charset=utf-8", cacheControl: "0", upsert: true });
  } catch {
    // La caché y el contador son una ayuda: si no se pueden escribir, la investigación sigue.
  }
}

/** Término de búsqueda: la palabra clave que escribió la persona o, si no, el producto recortado. */
export function terminoDeBusqueda(producto: string, palabraClave: string): string {
  const base = (palabraClave.trim() || producto.trim()).replace(/\s+/g, " ");
  // La biblioteca busca mejor con pocas palabras: se dejan las 4 primeras con significado.
  const palabras = base.split(" ").filter((p) => p.length > 2);
  return (palabras.length > 4 ? palabras.slice(0, 4) : base.split(" ")).join(" ").slice(0, 80);
}

const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

function fuente(estado: FuenteConsultada["estado"], detalle: string, faltan: string[] = []): FuenteConsultada {
  return { id: "meta-anuncios", nombre: "Anuncios activos de Meta", estado, detalle, faltan };
}

/** Mensaje claro cuando el proveedor dice que no hay saldo o se llegó al límite. */
function motivoDeFallo(mensaje: string): string {
  if (/limit|quota|exceed|insufficient|credit|payment|usage|402|403/i.test(mensaje)) {
    return `Apify respondió que se acabó el saldo o se llegó al límite de la cuenta («${mensaje.slice(0, 140)}»). La investigación siguió sin anuncios.`;
  }
  return `La fuente de anuncios falló («${mensaje.slice(0, 160)}»). No se reintentó para no volver a cobrar. La investigación siguió sin anuncios.`;
}

/**
 * Anuncios activos de Meta para un producto y un país, con caché y topes.
 * Nunca lanza: si algo no se pudo consultar, lo dice en `fuente.detalle`.
 */
export async function consultarAnuncios(entrada: { producto: string; palabraClave: string; pais: string; forzar?: boolean; categoria?: string }): Promise<ResultadoAnuncios> {
  const palabra = terminoDeBusqueda(entrada.producto, entrada.palabraClave);
  const via = viaAnuncios();
  if (!via) {
    return {
      anuncios: [],
      palabra,
      deCache: null,
      fuente: fuente(
        "sin_clave",
        "Sin anuncios consultados: falta conectar la fuente de anuncios. Hace falta APIFY_TOKEN (recomendada: sí trae anuncios comerciales de Latinoamérica) o META_AD_LIBRARY_TOKEN en las variables de entorno.",
        [...VARIABLES_ANUNCIOS],
      ),
    };
  }

  // Si los anuncios del producto son pocos, la segunda consulta va a su CATEGORÍA en el mismo país (no a otro país).
  const categoria = terminoDeBusqueda(entrada.categoria ?? "", "");
  const conCategoria = !!categoria && categoria.toLowerCase() !== palabra.toLowerCase();
  const huella = createHash("sha1").update(`${via}|${entrada.pais}|${palabra.toLowerCase()}${conCategoria ? `|cat:${categoria.toLowerCase()}` : ""}`).digest("hex").slice(0, 24);
  const rutaCache = `${CARPETA}/cache-${huella}.json`;
  if (!entrada.forzar) {
    const g = (await leerJson(rutaCache)) as Guardado | null;
    const edad = g?.fecha ? Date.now() - Date.parse(g.fecha) : Infinity;
    if (g && edad >= 0 && edad < DIAS_CACHE * 86400000) {
      const anuncios = leerAnuncios(g.anuncios);
      return {
        anuncios,
        palabra,
        deCache: g.fecha,
        fuente: fuente(
          anuncios.length ? "ok" : "vacia",
          `${anuncios.length} anuncios, tomados de una consulta guardada (no se volvió a cobrar). País consultado: ${(g.paises ?? []).join(", ") || entrada.pais}.`,
        ),
      };
    }
  }

  // Tope diario: protege el saldo que se comparte con Skania.
  const rutaDia = `${CARPETA}/dia-${hoyBogota()}.json`;
  const dia = (await leerJson(rutaDia)) as { usadas?: number } | null;
  const usadas = typeof dia?.usadas === "number" ? dia.usadas : 0;
  if (usadas >= TOPE_DIARIO_INVESTIGACIONES) {
    return {
      anuncios: [],
      palabra,
      deCache: null,
      fuente: fuente("no_consultada", `Hoy ya se hicieron ${usadas} investigaciones con anuncios, que es el tope diario (${TOPE_DIARIO_INVESTIGACIONES}). La investigación siguió sin anuncios; mañana vuelve a estar disponible.`),
    };
  }
  await escribirJson(rutaDia, { usadas: usadas + 1 });

  const hasta = Date.now() + PLAZO_ANUNCIOS_MS;
  const tema = palabrasDelTema(entrada.producto, entrada.palabraClave);
  const paises = conCategoria ? [entrada.pais] : [...new Set([entrada.pais, ...RESPALDO])];
  const consultados: string[] = [];
  const notas: string[] = [];
  let utiles: AnuncioCrudo[] = [];
  let fallo: string | null = null;

  for (const pais of paises) {
    if (utiles.length >= MINIMO_UTILES) break;
    // Como mucho dos países por investigación: el del video y un respaldo.
    if (consultados.length >= 2) break;
    try {
      const crudos = await buscarAnuncios(palabra, pais, hasta);
      consultados.push(pais);
      const buenos = filtrarYOrdenar(crudos, tema);
      notas.push(`${pais}: ${crudos.length} recibidos, ${buenos.length} hablan del producto`);
      utiles = filtrarYOrdenar([...utiles, ...buenos], tema);
    } catch (err) {
      const m = err instanceof Error ? err.message : "error desconocido";
      if (m === "SIN_TIEMPO") notas.push(`${pais}: no alcanzó el tiempo`);
      else {
        fallo = m;
        break; // Sin reintentos y sin probar otro país: si la cuenta falla, fallará igual.
      }
    }
  }

  // Pocos anuncios del producto: panorama de la categoría en ese mismo país (segunda y última consulta).
  if (conCategoria && !fallo && consultados.length && utiles.length < MINIMO_CATEGORIA) {
    try {
      const temaCategoria = palabrasDelTema(entrada.categoria ?? "", "");
      const crudos = await buscarAnuncios(categoria, entrada.pais, hasta);
      const buenos = filtrarYOrdenar(crudos, temaCategoria);
      notas.push(`categoría «${categoria}» en ${entrada.pais}: ${crudos.length} recibidos, ${buenos.length} de la categoría`);
      // Primero los del producto; después los de la categoría que no estén ya.
      const vistos = new Set(utiles.map((a) => a.enlace));
      utiles = [...utiles, ...buenos.filter((a) => !vistos.has(a.enlace))];
    } catch (err) {
      const m = err instanceof Error ? err.message : "error desconocido";
      notas.push(m === "SIN_TIEMPO" ? "categoría: no alcanzó el tiempo" : `categoría: falló (${m.slice(0, 80)})`);
    }
  }

  const anuncios: AnuncioVideo[] = utiles.slice(0, MAX_ANUNCIOS_GUARDADOS).map((a, i) => ({ ...a, ref: `A${i + 1}` }));
  if (fallo && !anuncios.length) return { anuncios: [], palabra, deCache: null, fuente: fuente("fallo", motivoDeFallo(fallo)) };
  if (!consultados.length) {
    return { anuncios: [], palabra, deCache: null, fuente: fuente("sin_tiempo", `La fuente de anuncios no respondió a tiempo (${notas.join("; ")}). La investigación siguió sin anuncios; se puede volver a intentar.`) };
  }

  const fecha = new Date().toISOString();
  await escribirJson(rutaCache, { fecha, palabra, paises: consultados, anuncios } satisfies Guardado);
  const viaTexto = via === "apify" ? "biblioteca pública leída con Apify" : "API oficial de Meta, que fuera de Europa entrega pocos anuncios comerciales";
  return {
    anuncios,
    palabra,
    deCache: null,
    fuente: fuente(
      anuncios.length ? "ok" : "vacia",
      `${anuncios.length ? `${anuncios.length} anuncios activos que hablan del producto` : "Ningún anuncio activo que hable del producto"} con «${palabra}» (${notas.join("; ")}). Vía: ${viaTexto}.${fallo ? ` Aviso: ${motivoDeFallo(fallo)}` : ""}`,
    ),
  };
}
