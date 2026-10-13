"use strict";
// Proveedor fal.ai, por su cola asíncrona HTTP: enviar → consultar → descargar.
//
// VERIFICADO contra la documentación pública de fal (fal.ai/docs/model-endpoints/queue,
// leída el 11-oct-2026):
//   · Enviar:     POST https://queue.fal.run/<id-del-modelo>
//                 cabecera  Authorization: Key <FAL_KEY>   ·  cuerpo JSON = entradas del modelo
//                 responde  { request_id, status_url, response_url, cancel_url, queue_position }
//   · Estado:     GET <status_url>      → status: IN_QUEUE | IN_PROGRESS | COMPLETED
//                 (un fallo también llega como COMPLETED, con `error` y `error_type`)
//   · Resultado:  GET <response_url>    → cuerpo propio de cada modelo
//   · La documentación pide usar las URL que devuelve el envío y NO armarlas a mano
//     (con modelos que tienen sub-rutas el patrón cambia). Eso hace este archivo.
//   · Modelos de video revisados (páginas de API de Seedance 2.0 Fast y Kling 2.1):
//     el resultado trae  { video: { url, content_type, file_name, file_size } }.
//
// POR VERIFICAR antes de usar con dinero (está AISLADO en `config.json` → "fal"
// y en las dos funciones marcadas abajo; no hay nada de esto repartido por el código):
//   · Los identificadores de modelo y sus campos de entrada: cambian seguido.
//     Cada modelo del catálogo declara cómo se llaman SUS campos.
//   · Si `duration` va como texto ("5") o como número (5): la página lo lista
//     como enumeración sin aclararlo → `duracionComoTexto` por modelo.
//   · La tarifa por segundo (`usdPorSegundo`): fal no la publica en la página
//     del modelo; viene en null y el costo se reporta como «desconocido».
const { pedirJson, descargar, esperar, ErrorHttp } = require("../lib/red");

const BASE_COLA = "https://queue.fal.run";

/** Qué modelo usar para esta escena: el del trabajo, el del formato o el de por defecto. */
function elegirModelo(cfg, trabajo, escena) {
  const fal = cfg.config.fal || {};
  const catalogo = fal.modelos || {};
  const conImagen = escena.usaImagenProducto && trabajo.imagenesProducto.length > 0;
  const tipo = conImagen ? "imagenAVideo" : "textoAVideo";
  const porAlias = (alias) => (alias && catalogo[alias] ? { alias, ...catalogo[alias] } : null);
  const porId = (id) => {
    const alias = Object.keys(catalogo).find((a) => catalogo[a].id === id);
    return alias ? { alias, ...catalogo[alias] } : null;
  };

  // 1) El modelo pedido en el trabajo (alias del catálogo o identificador de fal), si sirve para este tipo de escena.
  const pedido = trabajo.opciones && trabajo.opciones.modelo;
  if (pedido) {
    const m = porAlias(pedido) || porId(pedido);
    if (m && m.tipo === tipo) return m;
    if (!m && fal.permitirModelosFueraDelCatalogo) {
      // Identificador desconocido: se usa con los nombres de campo más comunes. POR VERIFICAR siempre.
      return { alias: pedido, id: pedido, tipo, campoImagen: "image_url", campoRelacion: "aspect_ratio", campoDuracion: "duration", duracionComoTexto: true, duracionMin: 5, duracionMax: 10, extra: {}, usdPorSegundo: null };
    }
  }
  // 2) El del formato del video. 3) El de por defecto.
  const delFormato = (fal.porFormato || {})[trabajo.formato] || {};
  const m = porAlias(delFormato[tipo]) || porAlias((fal.porDefecto || {})[tipo]);
  if (!m) throw new Error(`config.json no define un modelo de fal para «${tipo}» (fal.porDefecto.${tipo}).`);
  return m;
}

/** POR VERIFICAR por modelo: arma las entradas con los nombres de campo que declara el catálogo. */
function armarEntrada(modelo, ctx, segundos) {
  const { escena, trabajo, cfg } = ctx;
  const maxPrompt = (cfg.config.fal || {}).maxLetrasPrompt || 2000;
  const entrada = { ...(modelo.extra || {}), prompt: escena.prompt.slice(0, maxPrompt) };
  if (modelo.tipo === "imagenAVideo") entrada[modelo.campoImagen || "image_url"] = trabajo.imagenesProducto[0];
  if (modelo.campoDuracion !== null) entrada[modelo.campoDuracion || "duration"] = modelo.duracionComoTexto === false ? segundos : String(segundos);
  if (modelo.campoRelacion) entrada[modelo.campoRelacion] = ctx.relacion;
  return entrada;
}

/** Segundos a pedir: lo que dura la escena, dentro de lo que el modelo permite. */
function segundosPara(modelo, escena) {
  const quiere = Math.ceil(escena.duracion);
  if (Array.isArray(modelo.duracionesPermitidas) && modelo.duracionesPermitidas.length) {
    const orden = [...modelo.duracionesPermitidas].sort((a, b) => a - b);
    return orden.find((d) => d >= quiere) ?? orden[orden.length - 1];
  }
  return Math.min(modelo.duracionMax ?? 10, Math.max(modelo.duracionMin ?? 5, quiere));
}

/** POR VERIFICAR por modelo: dónde viene la URL del video en el resultado. */
function urlDelVideo(resultado) {
  const r = resultado || {};
  const candidatos = [r.video && r.video.url, r.video_url, Array.isArray(r.videos) && r.videos[0] && r.videos[0].url, r.output && r.output.video && r.output.video.url, r.data && r.data.video && r.data.video.url];
  const url = candidatos.find((u) => typeof u === "string" && /^https:\/\//.test(u));
  if (!url) throw new Error(`fal terminó pero no se encontró la URL del video en la respuesta (campos: ${Object.keys(r).join(", ") || "ninguno"}). Revisa urlDelVideo() en proveedores/fal.js.`);
  return url;
}

const soloFal = (url) => {
  try {
    const h = new URL(url).hostname;
    return h === "queue.fal.run" || h.endsWith(".fal.run") || h.endsWith(".fal.ai");
  } catch {
    return false;
  }
};

module.exports = {
  nombre: "fal",
  elegirModelo,
  armarEntrada,
  segundosPara,
  urlDelVideo,

  comprobar(cfg) {
    if (!cfg.falKey) return "Falta FAL_KEY en el .env (la clave se crea en fal.ai → Dashboard → Keys).";
    const fal = cfg.config.fal || {};
    if (!fal.modelos || !fal.porDefecto) return "config.json no tiene la sección «fal» con sus modelos.";
    return null;
  },

  async generarEscena(ctx) {
    const { cfg, escena, trabajo, registro } = ctx;
    const fal = cfg.config.fal || {};
    const cabeceras = { authorization: `Key ${cfg.falKey}`, "content-type": "application/json" };
    const modelo = elegirModelo(cfg, trabajo, escena);
    const segundos = segundosPara(modelo, escena);
    const costoUsd = typeof modelo.usdPorSegundo === "number" ? Math.round(segundos * modelo.usdPorSegundo * 1000) / 1000 : null;

    // Si en un intento anterior ya se envió esta escena, se retoma esa petición: no se paga dos veces.
    let peticion = ctx.memoria && ctx.memoria.status_url && ctx.memoria.modeloId === modelo.id ? ctx.memoria : null;
    if (!peticion) {
      const r = await pedirJson(`${BASE_COLA}/${modelo.id}`, { method: "POST", headers: cabeceras, body: JSON.stringify(armarEntrada(modelo, ctx, segundos)) }, [3000, 10000]);
      if (!r || !r.request_id || !soloFal(r.status_url) || !soloFal(r.response_url)) {
        throw new Error(`fal aceptó el envío pero no devolvió request_id/status_url/response_url válidos (modelo ${modelo.id}).`);
      }
      peticion = { request_id: r.request_id, status_url: r.status_url, response_url: r.response_url, modeloId: modelo.id, segundos, enviadaAt: new Date().toISOString() };
      ctx.recordar(peticion);
      registro.info(`fal: escena ${escena.n} enviada a ${modelo.id} (${segundos} s), petición ${r.request_id}`);
    } else {
      registro.info(`fal: escena ${escena.n} retoma la petición ${peticion.request_id}`);
    }

    const cada = (fal.consultarCadaSegundos || 5) * 1000;
    const limite = Date.now() + (fal.limiteMinutosPorEscena || 20) * 60000;
    for (;;) {
      let estado;
      try {
        estado = await pedirJson(peticion.status_url, { headers: cabeceras });
      } catch (e) {
        // La petición ya no existe en fal (venció): la próxima vez se envía de nuevo.
        if (e instanceof ErrorHttp && e.estado === 404) ctx.recordar(null);
        throw e;
      }
      if (estado.status === "COMPLETED") {
        if (estado.error) {
          ctx.recordar(null);
          throw new Error(`fal no pudo generar la escena ${escena.n}: ${String(estado.error).slice(0, 300)}${estado.error_type ? ` (${estado.error_type})` : ""}`);
        }
        break;
      }
      if (estado.status !== "IN_QUEUE" && estado.status !== "IN_PROGRESS") {
        throw new Error(`fal devolvió un estado que no se esperaba: ${String(estado.status).slice(0, 60)}`);
      }
      if (Date.now() > limite) throw new Error(`fal lleva más de ${fal.limiteMinutosPorEscena || 20} minutos con la escena ${escena.n}; se retomará la misma petición en el próximo intento.`);
      await ctx.latir(`Escena ${escena.n}: ${estado.status === "IN_QUEUE" ? `en la cola de fal${typeof estado.queue_position === "number" ? ` (puesto ${estado.queue_position})` : ""}` : "generándose en fal"}`);
      await esperar(cada);
    }

    let resultado;
    try {
      resultado = await pedirJson(peticion.response_url, { headers: cabeceras });
    } catch (e) {
      // Un resultado con error del modelo (p. ej. 422 por una entrada inválida) no mejora reintentando la misma petición.
      if (e instanceof ErrorHttp && e.estado >= 400 && e.estado < 500) ctx.recordar(null);
      throw e;
    }
    await descargar(urlDelVideo(resultado), require("path").join(ctx.carpeta, ctx.salida));
    ctx.recordar(null);
    return { segundos: peticion.segundos || segundos, modelo: modelo.id, costoUsd };
  },
};
