"use strict";
// Búsqueda de tiendas que anuncian en Meta. Tres fuentes, según el .env:
//
//   MODO_BUSQUEDA=simulacion  → no llama a nadie: lee los anuncios y las tiendas de
//                               la carpeta `simulacion/` (datos inventados, dominios example.com).
//   MODO_BUSQUEDA=real + APIFY_TOKEN            → un actor de Apify lee la biblioteca pública
//                               de anuncios (cuesta por anuncio leído).
//   MODO_BUSQUEDA=real + META_AD_LIBRARY_TOKEN  → la API oficial de Meta: gratis, pero solo
//                               entrega anuncios comerciales de la Unión Europea (sirve para España, no para México).
//
// El CRM decide cuándo se busca, en qué país, con qué frases y con cuánto
// presupuesto (`corrida`). Aquí se respeta ese tope: nunca se piden más
// anuncios que `corrida.anunciosMax`.
const fs = require("fs");
const path = require("path");
const { crearLector } = require("./tienda");

const NO_SON_TIENDAS = /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|messenger\.com|whatsapp\.com|wa\.me|wa\.link|linktr\.ee|bit\.ly|t\.me|tiktok\.com|youtube\.com|youtu\.be|google\.com|apple\.com|amazon\.[a-z.]+|aliexpress\.com|mercadolibre\.[a-z.]+|myshopify\.com|shopify\.com|beacons\.ai|typeform\.com|calendly\.com|hotmart\.com)$/i;

function dominioDe(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    // Los anuncios suelen pasar por l.facebook.com/l.php?u=<destino>.
    const real = /(^|\.)facebook\.com$/.test(u.hostname) && u.searchParams.get("u") ? new URL(u.searchParams.get("u")) : u;
    const d = real.hostname.toLowerCase().replace(/^www\./, "");
    return /^[a-z0-9.-]+\.[a-z]{2,24}$/.test(d) && !NO_SON_TIENDAS.test(d) ? { dominio: d, handle: (/\/products\/([a-z0-9][a-z0-9-]*)/i.exec(real.pathname) || [])[1] || "" } : null;
  } catch {
    return null;
  }
}

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
function diasDesde(v) {
  const ms = typeof v === "number" && v > 0 ? (v < 1e11 ? v * 1000 : v) : typeof v === "string" && v.trim() ? Date.parse(v) : NaN;
  const d = Math.floor((Date.now() - ms) / 86_400_000);
  return Number.isFinite(d) && d >= 0 && d < 5000 ? d : null;
}

/** Un elemento del actor de Apify → lo mínimo que se necesita. Los nombres de campo cambian entre versiones del actor. */
function traducirApify(bruto) {
  const d = obj(bruto);
  const s = obj(d.snapshot);
  const tarjetas = Array.isArray(s.cards) ? s.cards.map(obj) : [];
  const enlace = [s.link_url, s.linkUrl, d.link_url, ...tarjetas.map((c) => c.link_url || c.linkUrl), s.caption].find((x) => typeof x === "string" && x.trim()) || "";
  const destino = dominioDe(enlace);
  if (!destino) return null;
  const video = (Array.isArray(s.videos) && s.videos.length > 0) || tarjetas.some((c) => c.video_hd_url || c.video_sd_url || c.videoHdUrl || c.videoSdUrl);
  const copias = [d.collationCount, d.collation_count].find((x) => typeof x === "number");
  return {
    ...destino,
    pagina: String(d.pageName || d.page_name || s.page_name || "").slice(0, 80),
    paginaId: String(d.pageID || d.pageId || d.page_id || s.page_id || "").replace(/\D/g, "").slice(0, 25),
    video,
    dias: diasDesde(d.startDate ?? d.start_date ?? d.startDateFormatted ?? d.ad_delivery_start_time),
    copias: typeof copias === "number" && copias >= 0 ? Math.round(copias) : null,
  };
}

/** Junta los anuncios por tienda: cuántos tiene activos, cuántos son video, hace cuánto anuncia y qué producto empuja. */
function agrupar(anuncios, pais) {
  const tiendas = new Map();
  for (const a of anuncios) {
    const t = tiendas.get(a.dominio) || { dominio: a.dominio, pagina: a.pagina, paginaId: a.paginaId, anuncios: 0, anunciosVideo: 0, dias: [], copias: [], handles: new Map() };
    t.anuncios++;
    if (a.video) t.anunciosVideo++;
    if (a.dias !== null) t.dias.push(a.dias);
    if (a.copias !== null) t.copias.push(a.copias);
    if (a.handle) t.handles.set(a.handle, (t.handles.get(a.handle) || 0) + 1 + (a.copias || 0));
    if (!t.pagina) t.pagina = a.pagina;
    if (!t.paginaId) t.paginaId = a.paginaId;
    tiendas.set(a.dominio, t);
  }
  return [...tiendas.values()].map((t) => ({
    dominio: t.dominio,
    pagina: t.pagina,
    anuncios: t.anuncios,
    anunciosVideo: t.anunciosVideo,
    diasAnuncioMasAntiguo: t.dias.length ? Math.max(...t.dias) : null,
    diasAnuncioMasNuevo: t.dias.length ? Math.min(...t.dias) : null,
    duplicadosMax: t.copias.length ? Math.max(...t.copias) : null,
    handle: [...t.handles.entries()].sort((x, y) => y[1] - x[1]).map((x) => x[0])[0] || "",
    adsLibrary: t.paginaId ? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${pais}&view_all_page_id=${t.paginaId}` : "",
  }));
}

// ------------------------------------------------------------------ Apify ----

async function json(url, opciones, ms) {
  const res = await fetch(url, { ...opciones, signal: AbortSignal.timeout(ms) });
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) throw new Error(String(obj(obj(cuerpo).error).message || `respondió ${res.status}`).slice(0, 200));
  return cuerpo;
}

async function porApify(cfg, palabra, pais, limite) {
  const cabeceras = { "content-type": "application/json", authorization: `Bearer ${cfg.apify.token}` };
  const busqueda = new URL("https://www.facebook.com/ads/library/");
  for (const [k, v] of Object.entries({ active_status: "active", ad_type: "all", country: pais, q: palabra, search_type: "keyword_unordered", media_type: "all" })) busqueda.searchParams.set(k, v);
  const arranque = obj(obj(await json(`https://api.apify.com/v2/acts/${encodeURIComponent(cfg.apify.actor)}/runs`, { method: "POST", headers: cabeceras, body: JSON.stringify({ startUrls: [{ url: busqueda.toString() }], resultsLimit: limite }) }, 20_000)).data);
  const id = String(arranque.id || "");
  if (!id) throw new Error("Apify no devolvió identificador de ejecución");
  let corrida = arranque;
  const hasta = Date.now() + cfg.config.busqueda.esperaApifySegundos * 1000;
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(String(corrida.status))) {
    if (Date.now() > hasta) {
      // Se acabó el tiempo: se cancela la ejecución para que no siga gastando.
      await fetch(`https://api.apify.com/v2/actor-runs/${id}/abort`, { method: "POST", headers: cabeceras }).catch(() => {});
      throw new Error("Apify tardó demasiado: se canceló la ejecución");
    }
    await new Promise((r) => setTimeout(r, 4000));
    corrida = obj(obj(await json(`https://api.apify.com/v2/actor-runs/${id}`, { headers: cabeceras }, 15_000)).data);
  }
  const usd = typeof corrida.usageTotalUsd === "number" ? corrida.usageTotalUsd : null;
  if (corrida.status !== "SUCCEEDED") throw Object.assign(new Error(`Apify terminó en estado ${corrida.status}`), { usd });
  const items = await json(`https://api.apify.com/v2/datasets/${corrida.defaultDatasetId}/items?clean=true&limit=${limite}`, { headers: cabeceras }, 30_000);
  const lista = Array.isArray(items) ? items.slice(0, limite) : [];
  return { leidos: lista.length, anuncios: lista.map(traducirApify).filter(Boolean), usd };
}

// ------------------------------------------------------------- Meta oficial ----

async function porMeta(cfg, palabra, pais, limite) {
  const anuncios = [];
  let leidos = 0;
  // La API no dice si un anuncio es video: se pregunta dos veces (solo video / solo imagen).
  for (const [tipo, video] of [["VIDEO", true], ["IMAGE", false]]) {
    const u = new URL("https://graph.facebook.com/v21.0/ads_archive");
    for (const [k, v] of Object.entries({ access_token: cfg.meta.token, search_terms: palabra, ad_reached_countries: JSON.stringify([pais]), ad_active_status: "ACTIVE", ad_type: "ALL", media_type: tipo, fields: "id,page_id,page_name,ad_creative_link_captions,ad_delivery_start_time", limit: String(Math.max(5, Math.floor(limite / 2))) })) u.searchParams.set(k, v);
    const r = obj(await json(u.toString(), {}, 30_000));
    for (const d of Array.isArray(r.data) ? r.data : []) {
      leidos++;
      const destino = dominioDe(String((d.ad_creative_link_captions || [])[0] || ""));
      if (destino) anuncios.push({ ...destino, pagina: String(d.page_name || "").slice(0, 80), paginaId: String(d.page_id || "").replace(/\D/g, ""), video, dias: diasDesde(d.ad_delivery_start_time), copias: null });
    }
  }
  return { leidos, anuncios, usd: 0 };
}

// ---------------------------------------------------------------- simulada ----

function simulada(cfg) {
  const carpeta = path.join(cfg.raiz, "simulacion");
  const leer = (n) => JSON.parse(fs.readFileSync(path.join(carpeta, n), "utf8"));
  const tiendas = leer("tiendas.json");
  return {
    anuncios(palabra, pais, limite) {
      const todos = leer("anuncios.json").filter((a) => a.pais === pais && a.palabra === palabra).slice(0, limite);
      return { leidos: todos.length, anuncios: todos.map((a) => ({ dominio: a.dominio, handle: a.handle || "", pagina: a.pagina, paginaId: a.paginaId || "", video: !!a.video, dias: a.dias ?? null, copias: a.copias ?? null })), usd: null };
    },
    /** `fetch` de mentira: responde con lo que diga `tiendas.json` para ese dominio. */
    async fetch(url) {
      const u = new URL(url);
      const t = tiendas[u.hostname];
      const cuerpo = !t ? null : u.pathname === "/products.json" ? t.productos && JSON.stringify({ products: t.productos }) : u.pathname === "/" ? t.portada : (t.paginas || {})[u.pathname] || null;
      return { ok: !!cuerpo, status: cuerpo ? 200 : 404, headers: { get: () => null }, text: async () => cuerpo || "" };
    },
  };
}

// --------------------------------------------------------------- la corrida ----

/** Qué fuente toca, o por qué no se puede buscar. */
function fuenteDe(cfg, pais) {
  if (cfg.busqueda !== "real") return { nombre: "simulacion" };
  if (cfg.meta.token && pais === "ES") return { nombre: "meta" };
  if (cfg.apify.token) return { nombre: "apify" };
  return { nombre: "", motivo: cfg.meta.token ? "la API oficial de Meta solo sirve para España; para México falta APIFY_TOKEN" : "falta APIFY_TOKEN (o META_AD_LIBRARY_TOKEN) en el .env" };
}

/**
 * Hace UNA corrida. Devuelve lo que se le reporta al CRM:
 * `{ fuente, anuncios, usd, hallazgos[], vistos[], nota }`.
 */
async function buscar(corrida, cfg, crm, log) {
  const fuente = fuenteDe(cfg, corrida.pais);
  if (!fuente.nombre) return { fuente: "", anuncios: 0, usd: 0, hallazgos: [], vistos: [], nota: `No se buscó: ${fuente.motivo}.` };
  const sim = fuente.nombre === "simulacion" ? simulada(cfg) : null;
  const notas = [];
  let leidos = 0;
  let usd = fuente.nombre === "simulacion" ? null : 0;
  let costoReal = fuente.nombre !== "simulacion";
  const anuncios = [];

  for (const palabra of corrida.palabras) {
    // El tope de la corrida manda: si ya se leyó lo permitido, no se pide más.
    const limite = Math.min(corrida.porPalabra, corrida.anunciosMax - leidos);
    // Por debajo de 5 no vale la pena arrancar una consulta de pago; en cero se acabó el cupo para cualquiera.
    if (limite <= 0 || (limite < 5 && fuente.nombre !== "simulacion")) break;
    try {
      const r = sim ? sim.anuncios(palabra, corrida.pais, limite) :fuente.nombre === "meta" ? await porMeta(cfg, palabra, corrida.pais, limite) : await porApify(cfg, palabra, corrida.pais, limite);
      leidos += r.leidos;
      if (r.usd === null) costoReal = false;
      else if (usd !== null) usd += r.usd;
      anuncios.push(...r.anuncios);
      log.info(`[búsqueda] «${palabra}» (${corrida.pais}, ${fuente.nombre}): ${r.leidos} anuncios leídos, ${r.anuncios.length} con enlace a una tienda`);
    } catch (e) {
      if (typeof e.usd === "number" && usd !== null) usd += e.usd;
      notas.push(`«${palabra}»: ${e.message}`);
      log.aviso(`[búsqueda] «${palabra}» falló: ${e.message}`);
    }
  }

  const tiendas = agrupar(anuncios, corrida.pais).slice(0, 300);
  let nuevos = [];
  try {
    nuevos = new Set(await crm.dominiosNuevos(tiendas.map((t) => t.dominio)));
  } catch (e) {
    return { fuente: fuente.nombre, anuncios: leidos, usd: costoReal ? usd : undefined, hallazgos: [], vistos: [], nota: `Se leyeron los anuncios pero el CRM no respondió qué tiendas ya conoce (${e.message}). No se analizó ninguna.` };
  }
  const porAnalizar = tiendas.filter((t) => nuevos.has(t.dominio)).slice(0, cfg.config.busqueda.maxTiendasPorCorrida);
  log.info(`[búsqueda] ${tiendas.length} tiendas en los anuncios · ${porAnalizar.length} nuevas por analizar`);

  const lector = crearLector({ fetch: sim ? sim.fetch : undefined, pausaMs: sim ? 0 : cfg.config.busqueda.pausaEntrePaginasMs, permitirEjemplo: !!sim });
  const hallazgos = [];
  const vistos = [];
  for (const t of porAnalizar) {
    let r;
    try {
      r = await lector.analizarTienda(t.dominio, corrida.pais, { handle: t.handle, nombre: t.pagina }, { soloShopify: corrida.soloShopify });
    } catch (e) {
      r = { ok: false, motivo: `no se pudo leer (${e.message})`.slice(0, 120) };
    }
    if (!r.ok) vistos.push({ dominio: t.dominio, motivo: r.motivo });
    else if (!r.datos.correo) vistos.push({ dominio: t.dominio, motivo: "sin correo de contacto en la página" });
    else {
      hallazgos.push({
        ...r.datos,
        pais: corrida.pais,
        anuncios: t.anuncios,
        anunciosVideo: t.anunciosVideo,
        diasAnuncioMasAntiguo: t.diasAnuncioMasAntiguo,
        diasAnuncioMasNuevo: t.diasAnuncioMasNuevo,
        duplicadosMax: t.duplicadosMax,
        adsLibrary: t.adsLibrary,
        palabra: corrida.palabras[0],
      });
    }
  }
  return { fuente: fuente.nombre, anuncios: leidos, usd: costoReal && usd !== null ? Math.round(usd * 10000) / 10000 : undefined, hallazgos, vistos, nota: notas.join(" · ").slice(0, 280) };
}

module.exports = { buscar, agrupar, traducirApify, dominioDe, fuenteDe };
