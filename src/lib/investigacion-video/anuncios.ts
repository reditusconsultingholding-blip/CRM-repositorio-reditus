import "server-only";
import type { AnuncioVideo } from "./tipos";

// Fuente «anuncios activos de Meta». Dos vías, la misma que usa Skania:
//
//  · APIFY_TOKEN (recomendada): un actor de Apify lee la biblioteca pública.
//    Sí devuelve anuncios comerciales de Colombia y trae cuántos anuncios
//    comparten creativo. Actor por defecto `apify~facebook-ads-scraper`; se
//    cambia con APIFY_ACTOR_ANUNCIOS. Cuesta por uso y tarda (30–60 s).
//  · META_AD_LIBRARY_TOKEN: la API oficial (`ads_archive`). Es gratis y rápida,
//    pero fuera de la Unión Europea Meta solo entrega anuncios de política o
//    temas sociales: para Colombia suele traer poco o nada.
//
// Las claves las pone el dueño en Vercel; aquí solo se leen del entorno.

export type ViaAnuncios = "apify" | "meta" | null;

const clave = (nombre: string) => process.env[nombre]?.trim() || null;

export function viaAnuncios(): ViaAnuncios {
  if (clave("APIFY_TOKEN")) return "apify";
  if (clave("META_AD_LIBRARY_TOKEN")) return "meta";
  return null;
}

const ACTOR_POR_DEFECTO = "apify~facebook-ads-scraper";
const VERSION_GRAPH = "v21.0";
/** Tope de resultados por consulta: controla el costo. */
export const MAX_POR_CONSULTA = 20;

export type AnuncioCrudo = Omit<AnuncioVideo, "ref">;

const limpiar = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function primera(o: Record<string, unknown>, claves: string[]): string {
  for (const k of claves) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
    if (v && typeof v === "object" && typeof (v as Record<string, unknown>).text === "string") return (v as { text: string }).text;
  }
  return "";
}

function diasDesde(valor: unknown): number | null {
  let ms: number | null = null;
  if (typeof valor === "number" && valor > 0) ms = valor < 1e11 ? valor * 1000 : valor;
  else if (typeof valor === "string" && valor.trim()) {
    const t = Date.parse(valor);
    if (!Number.isNaN(t)) ms = t;
  }
  if (ms === null) return null;
  const dias = Math.floor((Date.now() - ms) / 86400000);
  return dias >= 0 && dias < 5000 ? dias : null;
}

const enlaceBiblioteca = (id: string) => (/^\d{5,25}$/.test(id) ? `https://www.facebook.com/ads/library/?id=${id}` : "");

/** Traduce un elemento del actor de Apify (los nombres de campo cambian entre versiones). */
export function traducirApify(bruto: unknown, pais: string): AnuncioCrudo | null {
  const d = obj(bruto);
  const s = obj(d.snapshot);
  const anunciante = limpiar(primera(d, ["pageName", "page_name", "advertiser"]) || primera(s, ["pageName", "page_name"]), 80);
  const texto = limpiar(primera(s, ["body", "linkDescription", "caption"]) || primera(d, ["adText", "ad_creative_body", "body", "text", "description"]), 600);
  const titular = limpiar(primera(s, ["title"]) || primera(d, ["title", "adTitle", "headline"]), 180);
  if (!anunciante && !texto) return null;
  const videos = Array.isArray(s.videos) ? s.videos.length : 0;
  const tarjetas = Array.isArray(s.cards) ? s.cards : [];
  const imagenes = Array.isArray(s.images) ? s.images.length : 0;
  const tarjetaConVideo = tarjetas.some((c) => !!primera(obj(c), ["videoHdUrl", "videoSdUrl", "video_hd_url", "video_sd_url"]));
  const duplicados = typeof d.collationCount === "number" ? d.collationCount : typeof d.collation_count === "number" ? d.collation_count : null;
  return {
    anunciante,
    titular,
    texto,
    enlace: enlaceBiblioteca(primera(d, ["adArchiveID", "adArchiveId", "ad_archive_id", "adid"])),
    pais,
    dias: diasDesde(d.startDate ?? d.start_date ?? d.startDateFormatted ?? d.ad_delivery_start_time),
    duplicados: duplicados !== null && duplicados >= 0 ? Math.round(duplicados) : null,
    formato: videos || tarjetaConVideo ? "video" : tarjetas.length > 1 ? "carrusel" : imagenes || tarjetas.length ? "imagen" : "desconocido",
  };
}

/** Traduce un elemento de la API oficial `ads_archive`. No informa formato ni duplicados. */
export function traducirMeta(bruto: unknown, pais: string): AnuncioCrudo | null {
  const d = obj(bruto);
  const cuerpos = Array.isArray(d.ad_creative_bodies) ? d.ad_creative_bodies : [];
  const titulos = Array.isArray(d.ad_creative_link_titles) ? d.ad_creative_link_titles : [];
  const anunciante = limpiar(d.page_name, 80);
  const texto = limpiar(cuerpos[0], 600);
  if (!anunciante && !texto) return null;
  return {
    anunciante,
    titular: limpiar(titulos[0], 180),
    texto,
    enlace: enlaceBiblioteca(limpiar(d.id, 30)),
    pais,
    dias: diasDesde(d.ad_delivery_start_time),
    duplicados: null,
    formato: "desconocido",
  };
}

async function json(url: string, opciones: RequestInit, ms: number): Promise<unknown> {
  const res = await fetch(url, { ...opciones, cache: "no-store", signal: AbortSignal.timeout(Math.max(1000, ms)) });
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) {
    const e = obj(obj(cuerpo).error);
    throw new Error(limpiar(e.message, 200) || `respondió ${res.status}`);
  }
  return cuerpo;
}

async function porApify(termino: string, pais: string, hasta: number): Promise<AnuncioCrudo[]> {
  const token = clave("APIFY_TOKEN")!;
  const actor = clave("APIFY_ACTOR_ANUNCIOS") ?? ACTOR_POR_DEFECTO;
  const busqueda = new URL("https://www.facebook.com/ads/library/");
  for (const [k, v] of Object.entries({ active_status: "active", ad_type: "all", country: pais, q: termino, search_type: "keyword_unordered", media_type: "all" })) {
    busqueda.searchParams.set(k, v);
  }
  const cabeceras = { "content-type": "application/json", authorization: `Bearer ${token}` };
  const arranque = obj(
    obj(
      await json(
        `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/runs`,
        { method: "POST", headers: cabeceras, body: JSON.stringify({ startUrls: [{ url: busqueda.toString() }], resultsLimit: MAX_POR_CONSULTA }) },
        15000,
      ),
    ).data,
  );
  const id = limpiar(arranque.id, 60);
  if (!id) throw new Error("Apify no devolvió identificador de ejecución");
  let estado = limpiar(arranque.status, 30);
  let dataset = limpiar(arranque.defaultDatasetId, 60);
  const finales = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"];
  while (!finales.includes(estado)) {
    if (Date.now() + 4000 > hasta) {
      // Se acabó el tiempo: se cancela la ejecución para no seguir gastando.
      void fetch(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(id)}/abort`, { method: "POST", headers: cabeceras }).catch(() => {});
      throw new Error("SIN_TIEMPO");
    }
    await new Promise((r) => setTimeout(r, 3000));
    const e = obj(obj(await json(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(id)}`, { headers: cabeceras }, 10000)).data);
    estado = limpiar(e.status, 30);
    dataset = limpiar(e.defaultDatasetId, 60) || dataset;
  }
  if (estado !== "SUCCEEDED") throw new Error(`Apify terminó en estado ${estado}`);
  if (!dataset) throw new Error("Apify no indicó dónde quedaron los resultados");
  const items = await json(
    `https://api.apify.com/v2/datasets/${encodeURIComponent(dataset)}/items?clean=true&limit=${MAX_POR_CONSULTA}`,
    { headers: cabeceras },
    Math.min(20000, hasta - Date.now()),
  );
  return (Array.isArray(items) ? items : []).map((x) => traducirApify(x, pais)).filter((a): a is AnuncioCrudo => !!a);
}

async function porMeta(termino: string, pais: string, hasta: number): Promise<AnuncioCrudo[]> {
  const url = new URL(`https://graph.facebook.com/${VERSION_GRAPH}/ads_archive`);
  const campos = ["id", "page_name", "ad_creative_bodies", "ad_creative_link_titles", "ad_delivery_start_time", "publisher_platforms"];
  for (const [k, v] of Object.entries({
    search_terms: termino,
    ad_reached_countries: JSON.stringify([pais]),
    ad_active_status: "ACTIVE",
    ad_type: "ALL",
    limit: String(MAX_POR_CONSULTA),
    fields: campos.join(","),
  })) {
    url.searchParams.set(k, v);
  }
  const datos = obj(await json(url.toString(), { headers: { authorization: `Bearer ${clave("META_AD_LIBRARY_TOKEN")}` } }, Math.min(15000, hasta - Date.now())));
  return (Array.isArray(datos.data) ? datos.data : []).map((x) => traducirMeta(x, pais)).filter((a): a is AnuncioCrudo => !!a);
}

/** Anuncios activos de un país para un término. Lanza `SIN_TIEMPO` si no alcanza el plazo. */
export async function buscarAnuncios(termino: string, pais: string, hasta: number): Promise<AnuncioCrudo[]> {
  const via = viaAnuncios();
  if (!via) return [];
  if (hasta - Date.now() < 8000) throw new Error("SIN_TIEMPO");
  return via === "apify" ? porApify(termino, pais, hasta) : porMeta(termino, pais, hasta);
}

// ------------------------------------------------- filtro y orden ----

const VACIAS = new Set(
  "para como este esta estos estas pero porque desde hasta entre sobre tiene tienen todo todos toda todas más muy sin con los las una unos unas del que por tus sus mis son ser hay ese esa eso original nuevo nueva mejor oferta envío envio gratis pack kit unidad unidades".split(" "),
);

/** Palabras con significado del producto: con ellas se descarta lo que no habla del tema. */
export function palabrasDelTema(...textos: string[]): string[] {
  const plano = textos
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return [...new Set(plano.split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 4 && !VACIAS.has(p)))].slice(0, 12);
}

/**
 * Quita lo que no sirve (plantillas sin rellenar, anuncios que no hablan del
 * tema, repetidos) y ordena: primero lo que lleva más días activo y lo que
 * tiene más anuncios con el mismo creativo; a igualdad, los de video.
 * La biblioteca devuelve «lo parecido», y para un término corto eso puede ser
 * cualquier cosa que esté gastando mucho: sin este filtro saldría ruido.
 */
export function filtrarYOrdenar(anuncios: AnuncioCrudo[], tema: string[]): AnuncioCrudo[] {
  const vistos = new Set<string>();
  const plano = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const utiles = anuncios.filter((a) => {
    const texto = plano(`${a.anunciante} ${a.titular} ${a.texto}`);
    if (/\{\{[^}]+\}\}/.test(texto)) return false;
    if (tema.length && !tema.some((p) => texto.includes(p))) return false;
    const huella = `${plano(a.anunciante)}|${plano(a.texto).slice(0, 90)}`;
    if (vistos.has(huella)) return false;
    vistos.add(huella);
    return true;
  });
  const peso = (a: AnuncioCrudo) => (a.dias ?? 0) + Math.min(a.duplicados ?? 0, 30) * 6 + (a.formato === "video" ? 5 : 0);
  return utiles.sort((a, b) => peso(b) - peso(a));
}
