"use strict";
// Proveedor Veo 3 (Google) por la API de Gemini: operación de larga duración
// (enviar → consultar la operación → descargar el archivo).
//
// VERIFICADO contra la documentación oficial (ai.google.dev/gemini-api/docs/veo,
// leída el 12-oct-2026). No se hizo ninguna llamada real: no hay clave aquí.
//   · Enviar:    POST https://generativelanguage.googleapis.com/v1beta/models/<modelo>:predictLongRunning
//                cabeceras  x-goog-api-key: <GEMINI_API_KEY>  ·  Content-Type: application/json
//                cuerpo     { instances: [{ prompt, image? }], parameters: { aspectRatio, durationSeconds, resolution } }
//                responde   { name: "<nombre de la operación>" }
//   · Consultar: GET https://generativelanguage.googleapis.com/v1beta/<nombre de la operación>   → { done: true|false, … }
//   · Resultado: response.generateVideoResponse.generatedSamples[0].video.uri
//   · Descargar: GET <uri> con la cabecera x-goog-api-key, siguiendo redirecciones.
//   · Los videos quedan 2 DÍAS en el servidor de Google: se descargan en cuanto terminan.
//   · Modelos: veo-3.1-generate-preview, veo-3.1-fast-generate-preview, veo-3.1-lite-generate-preview
//     (los veo-3.0-* figuran como obsoletos).
//   · aspectRatio: "16:9" o "9:16".  durationSeconds: 4, 6 u 8 (8 obligatorio con 1080p/4k).
//     resolution: 720p (por defecto), 1080p, 4k.
//   · El audio SIEMPRE viene generado (no hay interruptor). Si un filtro de seguridad
//     bloquea el video, no se cobra.
//   · Tarda desde ~11 segundos hasta unos 6 minutos en horas pico.
//
// POR VERIFICAR con la primera llamada real (todo está AISLADO en `config.json` → "veo"
// y en las funciones marcadas abajo):
//   · Cómo va la foto del producto en imagen-a-video. La página solo muestra el ejemplo de
//     primer/último fotograma: instances[0].image = { inlineData: { mimeType, data } }.
//     Se usa esa forma (`formatoImagen: "inlineData"`); la alternativa conocida de la API
//     es { bytesBase64Encoded, mimeType } (`formatoImagen: "bytesBase64Encoded"`).
//   · Si durationSeconds va como número o como texto (`duracionComoTexto`).
//   · El formato exacto de un bloqueo por filtros (ver motivoDeBloqueo()).
//   · La tarifa por segundo de cada variante (`usdPorSegundo`): está en la página de
//     precios de Google, no en la del modelo. En null el costo se reporta solo en segundos.
const path = require("path");
const { pedirJson, descargar, esperar, ErrorHttp } = require("../lib/red");

const BASE = "https://generativelanguage.googleapis.com/v1beta";

const deGoogle = (url) => {
  try {
    const h = new URL(url).hostname;
    return h.endsWith(".googleapis.com") || h.endsWith(".google.com");
  } catch {
    return false;
  }
};

/** Qué variante usar: la del trabajo, la del formato o la de por defecto. */
function elegirModelo(cfg, trabajo) {
  const veo = cfg.config.veo || {};
  const catalogo = veo.modelos || {};
  const porAlias = (a) => (a && catalogo[a] ? { alias: a, ...catalogo[a] } : null);
  const pedido = trabajo.opciones && trabajo.opciones.modelo;
  const delPedido = pedido ? porAlias(pedido) || porAlias(Object.keys(catalogo).find((a) => catalogo[a].id === pedido)) : null;
  const m = delPedido || porAlias((veo.porFormato || {})[trabajo.formato]) || porAlias(veo.porDefecto);
  if (!m) throw new Error("config.json no define el modelo de Veo por defecto (veo.porDefecto).");
  return m;
}

/** Veo solo acepta 4, 6 u 8 segundos: se pide el primero que cubra la escena. */
function segundosPara(cfg, escena, resolucion) {
  const veo = cfg.config.veo || {};
  const permitidas = [...(veo.duracionesPermitidas || [4, 6, 8])].sort((a, b) => a - b);
  if (resolucion !== "720p") return permitidas[permitidas.length - 1];
  return permitidas.find((d) => d >= Math.ceil(escena.duracion)) ?? permitidas[permitidas.length - 1];
}

/** POR VERIFICAR: la foto del producto, descargada y en base64, con la forma que diga config.json. */
async function imagenDelProducto(cfg, url) {
  const veo = cfg.config.veo || {};
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`No se pudo descargar la foto del producto (HTTP ${res.status}).`);
  const tipo = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!/^image\/(png|jpeg|webp)$/.test(tipo)) throw new Error(`La foto del producto debe ser PNG, JPG o WebP (llegó «${tipo || "sin tipo"}»).`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const maxMb = veo.maxMbImagen || 15;
  if (bytes.length > maxMb * 1048576) throw new Error(`La foto del producto pesa más de ${maxMb} MB.`);
  const data = bytes.toString("base64");
  return veo.formatoImagen === "bytesBase64Encoded" ? { bytesBase64Encoded: data, mimeType: tipo } : { inlineData: { mimeType: tipo, data } };
}

function armarPrompt(cfg, ctx) {
  const veo = cfg.config.veo || {};
  const { escena } = ctx;
  const partes = [escena.prompt];
  const habla = (escena.voz || "").trim();
  // Si el audio del video es el de Veo, la frase del guion va en el prompt para que la diga.
  if (ctx.audio === "veo" && habla) partes.push(`${veo.instruccionVoz || "La persona dice, en español latino, exactamente:"} "${habla}"`);
  else partes.push(veo.instruccionSinVoz || "Sin diálogo ni voz en off.");
  if (veo.sufijoPrompt) partes.push(veo.sufijoPrompt);
  return partes.join("\n").slice(0, veo.maxLetrasPrompt || 4000);
}

/** POR VERIFICAR: por qué una operación terminó sin video (filtros de seguridad). */
function motivoDeBloqueo(operacion) {
  const r = ((operacion || {}).response || {}).generateVideoResponse || {};
  const motivos = r.raiMediaFilteredReasons || r.filteredReasons || [];
  return Array.isArray(motivos) && motivos.length ? motivos.join(" · ").slice(0, 300) : "";
}

function uriDelVideo(operacion) {
  const r = ((operacion || {}).response || {}).generateVideoResponse || {};
  const muestra = (r.generatedSamples || [])[0];
  const uri = muestra && muestra.video && muestra.video.uri;
  if (typeof uri === "string" && uri) return uri;
  const motivo = motivoDeBloqueo(operacion);
  const e = new Error(motivo ? `Veo bloqueó la escena por sus filtros: ${motivo}` : "Veo terminó sin entregar video (posible bloqueo por filtros de seguridad o de audio).");
  e.sinVideo = true;
  throw e;
}

module.exports = {
  nombre: "veo",
  /** Los clips traen audio propio: el montaje puede usarlo en vez de ElevenLabs. */
  daAudio: true,
  elegirModelo,
  segundosPara,
  armarPrompt,
  uriDelVideo,

  comprobar(cfg) {
    if (!cfg.geminiKey) return "Falta GEMINI_API_KEY en el .env (se crea en Google AI Studio → Get API key).";
    const veo = cfg.config.veo || {};
    if (!veo.modelos || !veo.porDefecto) return "config.json no tiene la sección «veo» con sus modelos.";
    return null;
  },

  async generarEscena(ctx) {
    const { cfg, escena, trabajo, registro } = ctx;
    const veo = cfg.config.veo || {};
    const cabeceras = { "x-goog-api-key": cfg.geminiKey, "content-type": "application/json" };
    const modelo = elegirModelo(cfg, trabajo);
    const relaciones = veo.relacionesPermitidas || ["16:9", "9:16"];
    if (!relaciones.includes(ctx.relacion)) throw new Error(`Veo no genera en ${ctx.relacion}; solo en ${relaciones.join(" o ")}.`);
    const resolucion = modelo.resolucion || veo.resolucion || "720p";
    const segundos = segundosPara(cfg, escena, resolucion);
    const costoUsd = typeof modelo.usdPorSegundo === "number" ? Math.round(segundos * modelo.usdPorSegundo * 1000) / 1000 : null;

    // Si esta escena ya se envió en un intento anterior, se retoma esa operación: no se paga dos veces.
    let peticion = ctx.memoria && ctx.memoria.operacion && ctx.memoria.modeloId === modelo.id ? ctx.memoria : null;
    if (!peticion) {
      const instancia = { prompt: armarPrompt(cfg, ctx) };
      if (escena.usaImagenProducto && trabajo.imagenesProducto.length) instancia.image = await imagenDelProducto(cfg, trabajo.imagenesProducto[0]);
      const parametros = { aspectRatio: ctx.relacion, durationSeconds: veo.duracionComoTexto ? String(segundos) : segundos, resolution: resolucion, ...(veo.parametrosExtra || {}) };
      const r = await pedirJson(`${BASE}/models/${modelo.id}:predictLongRunning`, { method: "POST", headers: cabeceras, body: JSON.stringify({ instances: [instancia], parameters: parametros }) }, [5000, 20000]);
      if (!r || typeof r.name !== "string" || !/^[\w./-]+$/.test(r.name)) throw new Error(`Veo aceptó el envío pero no devolvió el nombre de la operación (modelo ${modelo.id}).`);
      peticion = { operacion: r.name, modeloId: modelo.id, segundos, enviadaAt: new Date().toISOString() };
      ctx.recordar(peticion);
      registro.info(`veo: escena ${escena.n} enviada a ${modelo.id} (${segundos} s, ${resolucion}${instancia.image ? ", con foto del producto" : ""}), operación ${r.name}`);
    } else {
      registro.info(`veo: escena ${escena.n} retoma la operación ${peticion.operacion}`);
    }

    const cada = (veo.consultarCadaSegundos || 10) * 1000;
    const limite = Date.now() + (veo.limiteMinutosPorEscena || 20) * 60000;
    let operacion;
    for (;;) {
      try {
        operacion = await pedirJson(`${BASE}/${peticion.operacion}`, { headers: cabeceras });
      } catch (e) {
        if (e instanceof ErrorHttp && e.estado === 404) ctx.recordar(null); // la operación venció: se enviará de nuevo
        throw e;
      }
      if (operacion.done) break;
      if (Date.now() > limite) throw new Error(`Veo lleva más de ${veo.limiteMinutosPorEscena || 20} minutos con la escena ${escena.n}; se retomará la misma operación en el próximo intento.`);
      await ctx.latir(`Escena ${escena.n}: generándose en Veo`);
      await esperar(cada);
    }
    if (operacion.error) {
      ctx.recordar(null);
      throw new Error(`Veo no pudo generar la escena ${escena.n}: ${String(operacion.error.message || JSON.stringify(operacion.error)).slice(0, 300)}`);
    }
    let uri;
    try {
      uri = uriDelVideo(operacion);
    } catch (e) {
      ctx.recordar(null);
      throw e;
    }
    if (!deGoogle(uri)) throw new Error("Veo devolvió una dirección de descarga que no es de Google; no se le envía la clave.");
    await descargar(uri, path.join(ctx.carpeta, ctx.salida), { "x-goog-api-key": cfg.geminiKey });
    ctx.recordar(null);
    return { segundos: peticion.segundos || segundos, modelo: modelo.id, costoUsd };
  },
};
