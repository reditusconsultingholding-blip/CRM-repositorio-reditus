"use strict";
// De dónde sale la música de fondo de un video. Por orden:
//
//   1. `opciones.musica` del trabajo = un enlace https → esa pista (lo resuelve el armado).
//   2. La BIBLIOTECA LOCAL: la carpeta `musica\`, con una subcarpeta por tono
//      (suspenso, energia, emotivo, neutro… las que el dueño quiera). El trabajo dice el tono
//      con `opciones.tonoMusica`; si no lo dice, se usa `musica.tonoPorDefecto` de config.json.
//      Las pistas las pone el dueño (con licencia para usarlas en anuncios): en el repositorio
//      NO va ninguna pista.
//   3. OPCIONAL y APAGADO por defecto (`musica.generarConKie`): si no hay pista de ese tono, se
//      genera una instrumental con la misma cuenta de Kie y se guarda en la biblioteca, para
//      que los siguientes videos la reutilicen sin volver a pagar.
//
// Si no hay pista disponible, el video sale SIN música y se avisa: nunca falla por esto.
// `opciones.musica: false` = sin música, sin aviso.
//
// La pista de un proyecto se elige de forma fija (por su guion): armar dos veces el mismo
// proyecto usa la misma pista.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { descargar, esperar } = require("./red");

const AUDIO = /\.(mp3|m4a|aac|wav|ogg|flac)$/i;

/** «Energía», « SUSPENSO » → «energia», «suspenso». Solo letras, números y guiones. */
function normalizarTono(t) {
  return String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function carpetaMusica(cfg) {
  return (cfg.carpetas && cfg.carpetas.musica) || path.join(cfg.raiz, "musica");
}

/** Los tonos que hay en la biblioteca: { tono: [archivos…] } (solo los que tienen pistas). */
function biblioteca(cfg) {
  const raiz = carpetaMusica(cfg);
  const tonos = {};
  if (!fs.existsSync(raiz)) return tonos;
  for (const d of fs.readdirSync(raiz, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const tono = normalizarTono(d.name);
    const pistas = fs
      .readdirSync(path.join(raiz, d.name))
      .filter((f) => AUDIO.test(f))
      .sort()
      .map((f) => path.join(raiz, d.name, f));
    if (tono && pistas.length) tonos[tono] = [...(tonos[tono] || []), ...pistas];
  }
  return tonos;
}

/** La pista de un tono para un proyecto: siempre la misma para el mismo guion. */
function pistaDe(pistas, semilla) {
  if (!pistas || !pistas.length) return null;
  const n = parseInt(crypto.createHash("sha1").update(String(semilla)).digest("hex").slice(0, 8), 16);
  return pistas[n % pistas.length];
}

// ------------------------------------------------- música generada (Kie) ----
// PREPARADO, apagado por defecto y SIN PROBAR con clave real. Verificado contra docs.kie.ai
// («Generate Music», leído el 13-oct-2026):
//   · POST /api/v1/jobs/createTask  { model: "ai-music-api/generate", input: { custom_mode, instrumental,
//     model: "V6" | "V6_MINI" | "V6_WILD" | …, style, title, negative_tags, duration (10–360 s, solo custom_mode) } }
//     → { code: 200, data: { taskId } }. En custom_mode hace falta `title` y al menos `style`.
//   · Consulta: GET /api/v1/jobs/recordInfo?taskId=… ; las pistas vienen en data.response.data[] con
//     `audio_url` y `duration`. Cada pedido devuelve varias versiones (el ejemplo trae dos).
//   · Los archivos se guardan 14 días.
// POR VERIFICAR con la primera llamada real: los valores de `state` de una tarea de música al
// consultarla (se asumen los mismos del resto: waiting | queuing | generating | success | fail), que
// las pistas lleguen en `data.response.data[]` también por consulta (la documentación lo dice de la
// consulta pero solo muestra el ejemplo del aviso), el PRECIO en créditos (no está publicado) y la
// licencia de uso comercial de lo generado según el plan de la cuenta.
function urlsDeMusica(data) {
  let r = (data && data.response) || null;
  if (!r && data && typeof data.resultJson === "string" && data.resultJson) {
    try {
      r = JSON.parse(data.resultJson);
    } catch {
      r = null;
    }
  }
  const lista = (r && (Array.isArray(r.data) ? r.data : Array.isArray(r.sunoData) ? r.sunoData : [])) || [];
  return lista.map((p) => p && (p.audio_url || p.audioUrl)).filter((u) => typeof u === "string" && u);
}

async function generarConKie({ cfg, registro, tono, duracion, latir = async () => {} }) {
  const kie = require("../proveedores/kie");
  const K = (cfg.config.musica || {}).kie || {};
  if (!cfg.kieKey) throw new Error("falta KIE_API_KEY");
  const estilo = (K.estilos || {})[tono] || (K.estilos || {}).neutro;
  if (!estilo) throw new Error(`config.json no tiene el estilo de música para el tono «${tono}» (musica.kie.estilos)`);
  const destino = path.join(carpetaMusica(cfg), tono);
  fs.mkdirSync(destino, { recursive: true });
  // La tarea creada se anota: si el proceso se corta, se retoma en vez de pagar otra.
  const memoArchivo = path.join(destino, "tarea-pendiente.json");
  let taskId = null;
  try {
    taskId = JSON.parse(fs.readFileSync(memoArchivo, "utf8")).taskId || null;
  } catch {
    /* no había */
  }
  if (!taskId) {
    const input = { custom_mode: true, instrumental: true, model: K.modelo || "V6_MINI", style: String(estilo).slice(0, 1000), title: `Fondo ${tono}`.slice(0, 80), duration: Math.max(10, Math.min(360, Math.ceil((duracion || 30) + (K.segundosDeMas ?? 5)))), ...(K.entradaExtra || {}) };
    const d = await kie.llamar(cfg, "POST", "/api/v1/jobs/createTask", { model: K.modeloApi || "ai-music-api/generate", input }, { repetir: false });
    taskId = d && d.taskId;
    if (typeof taskId !== "string" || !/^[\w.*-]+$/.test(taskId)) throw new Error("Kie aceptó la música pero no devolvió taskId");
    fs.writeFileSync(memoArchivo, JSON.stringify({ taskId, creadaAt: new Date().toISOString() }));
    registro.info(`kie música: pista de tono «${tono}» pedida (${input.model}, ${input.duration} s), tarea ${taskId}`);
  }
  const limite = Date.now() + (K.limiteMinutos || 10) * 60000;
  let cada = (K.consultarCadaSegundos || 8) * 1000;
  for (;;) {
    const data = await kie.llamar(cfg, "GET", `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);
    const estado = data && data.state;
    if (estado === "success") {
      const urls = urlsDeMusica(data).filter((u) => /^https:\/\//.test(u) || (cfg.kieBase && /^http:\/\/127\.0\.0\.1:/.test(u)));
      if (!urls.length) throw new Error("Kie marcó la música como lista pero no se encontró el archivo (revisar urlsDeMusica en lib/musica.js)");
      const archivo = path.join(destino, `kie-${taskId.replace(/[^\w-]/g, "")}.mp3`);
      await descargar(urls[0], `${archivo}.tmp`);
      fs.renameSync(`${archivo}.tmp`, archivo);
      fs.rmSync(memoArchivo, { force: true });
      return { archivo, creditos: typeof data.creditsConsumed === "number" ? data.creditsConsumed : null };
    }
    if (estado === "fail") {
      fs.rmSync(memoArchivo, { force: true });
      throw new Error(`Kie no pudo generar la música: ${String(data.failMsg || "sin motivo").slice(0, 200)}`);
    }
    if (Date.now() > limite) throw new Error("Kie se demoró con la música; se retomará la misma tarea en el próximo armado");
    await latir("Música: generándose en Kie");
    await esperar(cada);
    cada = Math.min(cada + 4000, 20000);
  }
}

/**
 * La pista de la biblioteca para este trabajo.
 *   { archivo, tono, origen: "biblioteca" | "generada", aviso? }   o   { archivo: null, aviso }
 */
async function elegirPista({ cfg, registro, trabajo, duracion, latir, conCerrojo = (c, f) => f() }) {
  const M = cfg.config.musica || {};
  const opciones = trabajo.opciones || {};
  const pedido = normalizarTono(opciones.tonoMusica);
  if (!pedido && M.automatica === false) return { archivo: null, aviso: "" };
  const tono = pedido || normalizarTono(M.tonoPorDefecto) || "neutro";
  const semilla = trabajo.guionId || trabajo.id || "";
  let tonos = biblioteca(cfg);
  if (tonos[tono]) return { archivo: pistaDe(tonos[tono], semilla), tono, origen: "biblioteca" };

  let motivoGenerar = "";
  if (M.generarConKie === true) {
    try {
      // Un solo pedido por tono aunque varios armados lo necesiten a la vez.
      const r = await conCerrojo(`musica-${tono}`, async () => {
        tonos = biblioteca(cfg);
        if (tonos[tono]) return { archivo: pistaDe(tonos[tono], semilla), creditos: 0, yaEstaba: true };
        return generarConKie({ cfg, registro, tono, duracion, latir });
      });
      return { archivo: r.archivo, tono, origen: r.yaEstaba ? "biblioteca" : "generada", creditos: r.creditos || 0, aviso: r.yaEstaba ? "" : `Música de tono «${tono}» generada con Kie${r.creditos ? ` (${r.creditos} créditos)` : ""}; quedó guardada en la biblioteca para los próximos videos.` };
    } catch (e) {
      motivoGenerar = ` No se pudo generar con Kie: ${registro.limpiar(e.message || String(e)).slice(0, 160)}.`;
    }
  }
  const respaldo = normalizarTono(M.tonoDeRespaldo || "neutro");
  if (respaldo !== tono && tonos[respaldo]) {
    return { archivo: pistaDe(tonos[respaldo], semilla), tono: respaldo, origen: "biblioteca", aviso: `No hay pistas de tono «${tono}» en la carpeta de música: se usó una de «${respaldo}».${motivoGenerar}` };
  }
  const hay = Object.keys(tonos);
  return { archivo: null, tono, aviso: `El video salió SIN música: no hay pistas de tono «${tono}» en la carpeta de música del servidor${hay.length ? ` (hay de: ${hay.join(", ")})` : " (está vacía)"}.${motivoGenerar}` };
}

module.exports = { elegirPista, biblioteca, pistaDe, normalizarTono, carpetaMusica, generarConKie, urlsDeMusica };
