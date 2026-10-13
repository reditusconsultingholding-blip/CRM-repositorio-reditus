"use strict";
// Proveedor Kie (kie.ai): un agregador que da Veo 3.1 (y otros modelos) con una sola clave.
// Flujo: crear tarea → consultar la tarea → descargar el archivo.
//
// VERIFICADO contra la documentación pública de Kie (docs.kie.ai, leída el 12-oct-2026:
// «Veo 3.1 Generate Video», «Get Task Details» y «Get Account Credits»). No se hizo
// ninguna llamada real: aquí no hay clave.
//   · Base: https://api.kie.ai      · Cabecera: Authorization: Bearer <KIE_API_KEY>
//   · Crear:     POST /api/v1/jobs/createTask
//                { model: "veo-3-1", input: { prompt, model, image_urls?, generation_type?,
//                  aspect_ratio, resolution, duration } }
//                input.model: "veo3_fast" (por defecto), "veo3_lite" o "veo3" (calidad).
//                generation_type: TEXT_2_VIDEO | FIRST_AND_LAST_FRAMES_2_VIDEO (1 imagen = primer
//                fotograma) | REFERENCE_2_VIDEO (1 a 3 imágenes; solo 8 s; solo fast y lite).
//                aspect_ratio: "16:9" | "9:16" | "Auto".  resolution: 720p | 1080p | 4k.
//                duration: 4, 6 u 8 (número entero).
//                Las imágenes van como URL (`image_urls`), no como archivo.
//                responde { code: 200, msg, data: { taskId } }
//   · OJO: el HTTP puede ser 200 aunque falle; manda el campo `code` del cuerpo
//     (401 clave, 402 sin créditos, 422 validación, 429 límite, 455 mantenimiento, 501 falló).
//   · Consultar: GET /api/v1/jobs/recordInfo?taskId=…
//                data.state: waiting | queuing | generating | success | fail
//                éxito: data.resultJson (texto JSON) → { resultUrls: [...] } ; fallo: failCode, failMsg
//                data.creditsConsumed = créditos realmente descontados.
//   · Los archivos generados se guardan 14 días. Algunas tareas pasan de 10 minutos.
//   · Créditos restantes: GET /api/v1/chat/credit → { code, msg, data: <número> }
//   · Audio: todos los videos traen audio (rara vez se suprime en escenas sensibles).
//   · También admite `callBackUrl`; aquí se consulta por sondeo (el servidor no expone puertos).
//
// POR VERIFICAR con la primera llamada real (aislado en `config.json` → "kie" y en las
// funciones marcadas):
//   · Que con 9:16 la URL buena sea `resultUrls[0]` (la documentación del callback habla
//     además de `originUrls` cuando la relación no es 16:9).
//   · Con 1080p/4k la documentación dice que la URL viene en `resultJson.data.result_urls`:
//     urlDelVideo() busca en los dos sitios.
//   · Qué modo conviene para la foto del producto (`modoImagen`): primer fotograma (cualquier
//     duración y variante) o referencia (solo 8 s, solo fast/lite).
//   · Precio en créditos por variante y cuánto vale un crédito (`usdPorCredito`): están en
//     kie.ai/pricing, no en la documentación. El consumo real sí lo reporta cada tarea.
const path = require("path");
const { descargar, esperar } = require("../lib/red");

const BASE = "https://api.kie.ai";

/** Error de Kie con su `code`. `sinRemedio`: repetir la misma llamada no lo arregla. */
class ErrorKie extends Error {
  constructor(code, msg) {
    super(`Kie respondió ${code}: ${String(msg || "sin detalle").slice(0, 300)}`);
    this.code = code;
    this.reintentable = code === 429 || code === 455 || code === 408 || code >= 500;
  }
}

/** Una llamada a Kie. Mira el `code` del cuerpo (el HTTP puede ser 200 aunque falle). */
async function llamar(cfg, metodo, ruta, cuerpo, { repetir = true } = {}) {
  const base = cfg.kieBase || BASE; // `kieBase` solo lo ponen las pruebas locales (nunca el .env ni config.json)
  let ultimo;
  const esperas = repetir ? [0, 3000, 10000, 30000] : [0];
  for (const espera of esperas) {
    if (espera) await esperar(espera);
    try {
      const res = await fetch(base + ruta, {
        method: metodo,
        headers: { authorization: `Bearer ${cfg.kieKey}`, "content-type": "application/json" },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: AbortSignal.timeout(60000),
      });
      const texto = await res.text();
      let j;
      try {
        j = JSON.parse(texto);
      } catch {
        throw Object.assign(new Error(`Kie devolvió algo que no es JSON (HTTP ${res.status}).`), { reintentable: res.status >= 500 });
      }
      const code = typeof j.code === "number" ? j.code : res.status;
      if (code === 200) return j.data;
      throw new ErrorKie(code, j.msg);
    } catch (e) {
      ultimo = e;
      // Un fallo de red al CREAR no se repite a ciegas: la tarea pudo quedar creada y cobrada.
      if (e instanceof ErrorKie ? !e.reintentable : e.reintentable === false) break;
    }
  }
  throw ultimo;
}

function elegirModelo(cfg, trabajo) {
  const kie = cfg.config.kie || {};
  const catalogo = kie.modelos || {};
  const porAlias = (a) => (a && catalogo[a] ? { alias: a, ...catalogo[a] } : null);
  const pedido = trabajo.opciones && trabajo.opciones.modelo;
  const delPedido = pedido ? porAlias(pedido) || porAlias(Object.keys(catalogo).find((a) => catalogo[a].variante === pedido)) : null;
  return delPedido;
}

/** La variante según la escena: el trabajo manda; si no, la del formato; si no, la de por defecto del tipo. */
function modeloPara(cfg, trabajo, conImagen) {
  const kie = cfg.config.kie || {};
  const catalogo = kie.modelos || {};
  const tipo = conImagen ? "imagenAVideo" : "textoAVideo";
  const porAlias = (a) => (a && catalogo[a] ? { alias: a, ...catalogo[a] } : null);
  const m = elegirModelo(cfg, trabajo) || porAlias(((kie.porFormato || {})[trabajo.formato] || {})[tipo]) || porAlias((kie.porDefecto || {})[tipo]);
  if (!m) throw new Error(`config.json no define el modelo de Kie para «${tipo}» (kie.porDefecto.${tipo}).`);
  return m;
}

function segundosPara(cfg, escena, { resolucion, referencia }) {
  const kie = cfg.config.kie || {};
  const permitidas = [...(kie.duracionesPermitidas || [4, 6, 8])].sort((a, b) => a - b);
  const mayor = permitidas[permitidas.length - 1];
  if (referencia || resolucion !== "720p") return mayor; // modo referencia y 1080p/4k: solo 8 s
  return permitidas.find((d) => d >= Math.ceil(escena.duracion)) ?? mayor;
}

function armarPrompt(cfg, ctx) {
  const kie = cfg.config.kie || {};
  const habla = (ctx.escena.voz || "").trim();
  const partes = [ctx.escena.prompt];
  if (ctx.audio === "veo" && habla) partes.push(`${kie.instruccionVoz || "La persona dice, en español latino, exactamente:"} "${habla}"`);
  else partes.push(kie.instruccionSinVoz || "Sin diálogo ni voz en off.");
  if (kie.sufijoPrompt) partes.push(kie.sufijoPrompt);
  return partes.join("\n").slice(0, kie.maxLetrasPrompt || 4000);
}

/** Arma el `input` de la tarea con los nombres de campo de la documentación. */
function armarEntrada(cfg, ctx, modelo) {
  const kie = cfg.config.kie || {};
  const { escena, trabajo } = ctx;
  const conImagen = escena.usaImagenProducto && trabajo.imagenesProducto.length > 0;
  const referencia = conImagen && kie.modoImagen === "referencia";
  const relaciones = kie.relacionesPermitidas || ["16:9", "9:16"];
  if (!relaciones.includes(ctx.relacion)) throw new Error(`Veo (por Kie) no genera en ${ctx.relacion}; solo en ${relaciones.join(" o ")}.`);
  const resolucion = modelo.resolucion || kie.resolucion || "720p";
  const segundos = segundosPara(cfg, escena, { resolucion, referencia });
  const input = {
    prompt: armarPrompt(cfg, ctx),
    model: modelo.variante,
    aspect_ratio: ctx.relacion,
    resolution: resolucion,
    duration: segundos,
    ...(kie.entradaExtra || {}),
  };
  if (conImagen) {
    // La foto va por URL pública, tal como llegó del CRM.
    input.image_urls = referencia ? trabajo.imagenesProducto.slice(0, 3) : [trabajo.imagenesProducto[0]];
    input.generation_type = referencia ? "REFERENCE_2_VIDEO" : "FIRST_AND_LAST_FRAMES_2_VIDEO";
  } else {
    input.generation_type = "TEXT_2_VIDEO";
  }
  return { input, segundos };
}

/** POR VERIFICAR: dónde viene la URL del video. Se busca en los dos sitios que nombra la documentación. */
function urlDelVideo(data, permitirHttpLocal = false) {
  let r = (data && data.response) || null;
  if (!r && data && typeof data.resultJson === "string" && data.resultJson) {
    try {
      r = JSON.parse(data.resultJson);
    } catch {
      r = null;
    }
  }
  r = r || {};
  const candidatos = [...(r.resultUrls || []), ...(((r.data || {}).result_urls) || []), ...(r.result_urls || [])];
  const url = candidatos.find((u) => typeof u === "string" && (/^https:\/\//.test(u) || (permitirHttpLocal && /^http:\/\/127\.0\.0\.1:/.test(u))));
  if (!url) throw new Error("Kie marcó la tarea como lista pero no se encontró la URL del video. Revisa urlDelVideo() en proveedores/kie.js.");
  return url;
}

/** Créditos que quedan en la cuenta de Kie. */
async function creditos(cfg) {
  const d = await llamar(cfg, "GET", "/api/v1/chat/credit");
  return typeof d === "number" ? d : null;
}

module.exports = {
  nombre: "kie",
  /** Los clips de Veo traen audio propio: el montaje puede usarlo en vez de ElevenLabs. */
  daAudio: true,
  modeloPara,
  armarEntrada,
  segundosPara,
  urlDelVideo,
  creditos,

  comprobar(cfg) {
    if (!cfg.kieKey) return "Falta KIE_API_KEY en el .env (se crea en kie.ai → API Key).";
    const kie = cfg.config.kie || {};
    if (!kie.modelos || !kie.porDefecto) return "config.json no tiene la sección «kie» con sus modelos.";
    return null;
  },

  async generarEscena(ctx) {
    const { cfg, escena, trabajo, registro } = ctx;
    const kie = cfg.config.kie || {};
    const conImagen = escena.usaImagenProducto && trabajo.imagenesProducto.length > 0;
    const modelo = modeloPara(cfg, trabajo, conImagen);

    // Si esta escena ya tiene tarea de un intento anterior, se retoma: no se paga dos veces.
    let peticion = ctx.memoria && ctx.memoria.taskId && ctx.memoria.variante === modelo.variante ? ctx.memoria : null;
    if (!peticion) {
      const { input, segundos } = armarEntrada(cfg, ctx, modelo);
      const d = await llamar(cfg, "POST", "/api/v1/jobs/createTask", { model: kie.modeloApi || "veo-3-1", input }, { repetir: false });
      const taskId = d && d.taskId;
      if (typeof taskId !== "string" || !/^[\w.-]+$/.test(taskId)) throw new Error("Kie aceptó la tarea pero no devolvió taskId.");
      peticion = { taskId, variante: modelo.variante, segundos, enviadaAt: new Date().toISOString() };
      ctx.recordar(peticion);
      registro.info(`kie: escena ${escena.n} enviada (${modelo.variante}, ${segundos} s, ${input.resolution}, ${input.generation_type}), tarea ${taskId}`);
    } else {
      registro.info(`kie: escena ${escena.n} retoma la tarea ${peticion.taskId}`);
    }

    let cada = (kie.consultarCadaSegundos || 10) * 1000;
    const limite = Date.now() + (kie.limiteMinutosPorEscena || 25) * 60000;
    let data;
    for (;;) {
      try {
        data = await llamar(cfg, "GET", `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(peticion.taskId)}`);
      } catch (e) {
        if (e instanceof ErrorKie && e.code === 422) ctx.recordar(null); // la tarea ya no existe: se creará otra
        throw e;
      }
      const estado = data && data.state;
      if (estado === "success") break;
      if (estado === "fail") {
        ctx.recordar(null);
        throw new Error(`Kie no pudo generar la escena ${escena.n}: ${String(data.failMsg || "sin motivo").slice(0, 300)}${data.failCode ? ` (${data.failCode})` : ""}`);
      }
      if (!["waiting", "queuing", "generating"].includes(estado)) throw new Error(`Kie devolvió un estado que no se esperaba: ${String(estado).slice(0, 60)}`);
      if (Date.now() > limite) throw new Error(`Kie lleva más de ${kie.limiteMinutosPorEscena || 25} minutos con la escena ${escena.n}; se retomará la misma tarea en el próximo intento.`);
      await ctx.latir(`Escena ${escena.n}: ${estado === "generating" ? "generándose en Kie" : "en la cola de Kie"}`);
      await esperar(cada);
      cada = Math.min(cada + 5000, 30000);
    }

    await descargar(urlDelVideo(data, !!cfg.kieBase), path.join(ctx.carpeta, ctx.salida)); // sin la clave: la URL del archivo es pública
    ctx.recordar(null);
    const gastados = typeof data.creditsConsumed === "number" ? data.creditsConsumed : null;
    const costoUsd = gastados !== null && typeof kie.usdPorCredito === "number" ? Math.round(gastados * kie.usdPorCredito * 1000) / 1000 : null;
    return { segundos: peticion.segundos, modelo: `kie:${modelo.variante}`, costoUsd, creditos: gastados };
  },
};
