"use strict";
// Subtítulos hechos por la API de Captions (marca «Mirage»), OPCIONAL. El dueño usa esa app y quiere
// sus plantillas. Con CAPTIONS_API_KEY en el .env y `opciones.subtitulos.proveedor: "captions"` (o
// `captions.porDefecto: true` en config.json), el armado manda el video SIN subtítulos a esa API con la
// plantilla elegida, espera, descarga el resultado y sigue. La tarjeta de cierre se pega DESPUÉS, para
// que no le pongan subtítulos encima.
//
// Si falta la clave, la API falla, tarda más de lo permitido, el video no es 9:16 o pesa más de 50 MB
// (se intenta comprimir antes), el armado vuelve SOLO a las plantillas propias y lo avisa: nunca falla
// por esto.
//
// VERIFICADO contra la documentación oficial (captions.ai/help → «Video Captions», «Add captions to a
// video», «List caption templates», leída el 17-oct-2026). SIN ninguna llamada real (aquí no hay clave):
//   · Base https://api.mirage.app · cabecera  x-api-key: <clave>
//   · Subtitular:  POST /v1/videos/captions   multipart/form-data
//                  caption_template_id (obligatorio, «ctpl_» + 20 letras)  +  video (archivo .mp4/.mov)  o  video_id
//                  → objeto Video { id, object: "video", status, progress, error: { code, message } | null, … }
//   · Estados: QUEUED | PROCESSING | COMPLETE | FAILED | CANCELLED
//   · Consultar:  GET /v1/videos/{id}            · Descargar:  GET /v1/videos/{id}/content  (redirige al archivo)
//   · Plantillas: GET /v1/videos/captions/templates?limit=1..100&after=<id>
//                  → { object: "list", data: [{ id, name, preview_url, created_at }], has_more }
//   · Requisitos del video: 9:16, máximo 50 MB, máximo 5 minutos, MP4 o MOV.
// POR VERIFICAR con la primera llamada real (aislado en config.json → "captions"):
//   · PRECIO: la documentación no dice cuánto cobra ni trae un campo de costo en la respuesta. Si la
//     respuesta trajera uno (credits, cost, usage…), queda anotado en el aviso del video.
//   · Idioma: no hay campo de idioma; se supone que lo detecta del audio (español).
//   · Resolución y códec de lo que devuelve: el trabajador lo vuelve a codificar a su formato, así que
//     no depende de eso, pero cuesta una codificación más.
//   · Que la descarga acepte la clave en la redirección y cuánto tarda de verdad un video de 45 s.
//   · No hay forma documentada de excluir un tramo por tiempo: por eso el cierre se pega después.
const fs = require("fs");
const path = require("path");
const { esperar, descargar } = require("./red");

const BASE = "https://api.mirage.app";
const sinSignos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function disponible(cfg) {
  return !!cfg.captionsKey;
}

/** ¿Este trabajo pide los subtítulos de Captions? (por el trabajo o por defecto en config.json) */
function pedido(cfg, trabajo) {
  const o = (trabajo && trabajo.opciones) || {};
  const C = cfg.config.captions || {};
  const s = o.subtitulos && typeof o.subtitulos === "object" ? o.subtitulos : {};
  if (o.subtitulos === false) return null;
  const proveedor = String(s.proveedor || o.proveedorSubtitulos || (C.porDefecto === true ? "captions" : "")).toLowerCase();
  if (proveedor !== "captions") return null;
  return { plantilla: String(s.plantilla || o.plantillaCaptions || C.plantilla || "").trim() };
}

async function api(cfg, metodo, ruta, cuerpo) {
  // `captionsBase` solo lo ponen las pruebas locales (nunca el .env ni config.json).
  const res = await fetch((cfg.captionsBase || BASE) + ruta, { method: metodo, headers: { "x-api-key": cfg.captionsKey }, body: cuerpo, signal: AbortSignal.timeout(cuerpo ? 10 * 60000 : 60000) });
  const texto = await res.text();
  let j = null;
  try {
    j = texto ? JSON.parse(texto) : {};
  } catch {
    /* no era JSON */
  }
  if (!res.ok || !j) {
    const detalle = j && j.error ? `${j.error.code || ""} ${j.error.message || ""}`.trim() : texto.slice(0, 160);
    throw Object.assign(new Error(`Captions respondió ${res.status}: ${detalle || "sin detalle"}`), { estado: res.status });
  }
  return j;
}

let lista = null; // { cuando, datos }
/** Todas las plantillas de la cuenta: [{ id, nombre, vistaPrevia }]. Se guarda una hora en memoria. */
async function plantillas(cfg) {
  if (lista && Date.now() - lista.cuando < 3600000 && lista.clave === cfg.captionsKey + (cfg.captionsBase || "")) return lista.datos;
  const datos = [];
  let despues = "";
  for (let pagina = 0; pagina < 20; pagina++) {
    const j = await api(cfg, "GET", `/v1/videos/captions/templates?limit=100${despues ? `&after=${encodeURIComponent(despues)}` : ""}`);
    const d = Array.isArray(j.data) ? j.data : [];
    for (const t of d) if (t && t.id) datos.push({ id: String(t.id), nombre: String(t.name || ""), vistaPrevia: t.preview_url || null });
    if (!j.has_more || !d.length) break;
    despues = d[d.length - 1].id;
  }
  lista = { cuando: Date.now(), clave: cfg.captionsKey + (cfg.captionsBase || ""), datos };
  return datos;
}

/** El id de la plantilla: tal cual si ya es «ctpl_…»; si es un nombre («Cove»), se busca en la cuenta. */
async function resolverPlantilla(cfg, pedida) {
  const p = String(pedida || "").trim();
  if (!p) throw new Error("no se dijo qué plantilla de Captions usar (opciones.subtitulos.plantilla o captions.plantilla en config.json)");
  if (/^ctpl_[A-Za-z0-9]{6,40}$/.test(p)) return { id: p, nombre: p };
  const todas = await plantillas(cfg);
  const t = todas.find((x) => sinSignos(x.nombre) === sinSignos(p)) || todas.find((x) => sinSignos(x.nombre).startsWith(sinSignos(p)));
  if (!t) throw new Error(`la cuenta de Captions no tiene ninguna plantilla llamada «${p}» (corre  .\\probar.ps1 -PlantillasCaptions  para ver las que hay)`);
  return { id: t.id, nombre: t.nombre };
}

/**
 * Manda `archivo` (MP4 9:16, ≤ 50 MB) a subtitular y deja el resultado en `destino`.
 * `memoria` / `recordar`: el id del trabajo ya creado, para retomarlo sin mandarlo (ni pagarlo) otra vez.
 * Devuelve { id, costo, segundos } (costo: lo que informe la API, o null; segundos: de punta a punta).
 */
async function subtitular({ cfg, registro, archivo, plantillaId, destino, memoria = null, recordar = () => {}, latir = async () => {} }) {
  const C = cfg.config.captions || {};
  const t0 = Date.now();
  let id = memoria && memoria.id && memoria.plantillaId === plantillaId ? memoria.id : null;
  let trabajo = null;
  if (!id) {
    const forma = new FormData();
    forma.append("caption_template_id", plantillaId);
    forma.append("video", new Blob([fs.readFileSync(archivo)], { type: "video/mp4" }), path.basename(archivo));
    // Crear NO se repite a ciegas: si la red se corta aquí, el trabajo pudo quedar creado (y cobrado).
    trabajo = await api(cfg, "POST", "/v1/videos/captions", forma);
    id = trabajo.id || trabajo.video_id;
    if (typeof id !== "string" || !/^[\w-]{4,80}$/.test(id)) throw new Error("Captions aceptó el video pero no devolvió su id");
    recordar({ id, plantillaId, creadoAt: new Date().toISOString() });
    registro.info(`captions: video enviado a subtitular (plantilla ${plantillaId}), trabajo ${id}`);
  } else {
    registro.info(`captions: se retoma el trabajo ${id}`);
  }
  const limite = Date.now() + (C.limiteMinutos || 8) * 60000;
  let cada = (C.consultarCadaSegundos || 5) * 1000;
  for (;;) {
    if (!trabajo || !["COMPLETE", "FAILED", "CANCELLED"].includes(trabajo.status)) {
      trabajo = await api(cfg, "GET", `/v1/videos/${encodeURIComponent(id)}`);
    }
    if (trabajo.status === "COMPLETE") break;
    if (trabajo.status === "FAILED" || trabajo.status === "CANCELLED") {
      recordar(null);
      throw new Error(`Captions no pudo subtitular el video (${trabajo.status}${trabajo.error ? `: ${trabajo.error.code || ""} ${trabajo.error.message || ""}` : ""})`);
    }
    if (!["QUEUED", "PROCESSING"].includes(trabajo.status)) throw new Error(`Captions devolvió un estado que no se esperaba: ${String(trabajo.status).slice(0, 40)}`);
    if (Date.now() > limite) throw new Error(`Captions lleva más de ${C.limiteMinutos || 8} minutos; se sigue con las plantillas propias (el trabajo ${id} queda anotado por si termina)`);
    await latir(`Subtítulos en Captions${typeof trabajo.progress === "number" ? ` (${trabajo.progress} %)` : ""}`);
    await esperar(cada);
    cada = Math.min(cada + 2000, 15000);
    trabajo = null;
  }
  await descargar(`${cfg.captionsBase || BASE}/v1/videos/${encodeURIComponent(id)}/content`, destino, { "x-api-key": cfg.captionsKey });
  recordar(null);
  // El costo, si algún día la respuesta lo trae (hoy la documentación no lo menciona).
  const costo = trabajo.credits ?? trabajo.cost ?? (trabajo.usage && (trabajo.usage.credits ?? trabajo.usage.cost)) ?? null;
  const segundos = Math.round((Date.now() - t0) / 100) / 10;
  // Qué campos trae la respuesta final: si algún día aparece uno de consumo, queda a la vista en el registro.
  registro.info(`captions: trabajo ${id} listo en ${segundos} s (${memoria && memoria.id ? "retomado" : "enviado, esperado y descargado"}); campos de la respuesta: ${Object.keys(trabajo || {}).join(", ")}`);
  return { id, costo: typeof costo === "number" ? costo : null, segundos };
}

module.exports = { disponible, pedido, plantillas, resolverPlantilla, subtitular, BASE };
