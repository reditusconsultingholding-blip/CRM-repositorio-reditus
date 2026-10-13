"use strict";
// Imagen base con Kie (kie.ai). Mismo flujo que el video: crear tarea → consultar → descargar.
//
// VERIFICADO contra la documentación pública de Kie (docs.kie.ai, leída el 12-oct-2026).
// No se hizo ninguna llamada real: aquí no hay clave.
//   · Crear:  POST https://api.kie.ai/api/v1/jobs/createTask   { model, input }   (la misma ruta del video)
//             responde { code: 200, msg, data: { taskId } }. El HTTP puede ser 200 aunque falle: manda `code`.
//   · «GPT Image 2.5 Sunburst»
//       sin fotos:  model "gpt-image-2-5-sunburst-text-to-image"   input { prompt, aspect_ratio, resolution, background }
//       con fotos:  model "gpt-image-2-5-sunburst-image-to-image"  lo mismo + input_urls (obligatorio, hasta 16 URL)
//       prompt hasta 20.000 letras · resolution 1K | 2K | 4K · background transparent | opaque | auto
//       aspect_ratio: auto, 1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 21:9 (y 27:16, 16:27, 9:8, 8:9 solo a 1K)
//   · «Nano Banana 2»   model "nano-banana-2"    input { prompt, image_input (hasta 14), aspect_ratio, resolution (1K por defecto), output_format (jpg por defecto) }
//   · «Nano Banana Pro» model "nano-banana-pro"  input { prompt, image_input (hasta 8),  aspect_ratio, resolution (1K por defecto), output_format (png | jpg) }
//       image_input: JPG, PNG o WebP, hasta 30 MB cada una.
//   · Consultar: GET /api/v1/jobs/recordInfo?taskId=…  → data.state (waiting | queuing | generating | success | fail),
//       data.resultJson (texto JSON) → { resultUrls: [...] }, data.failCode, data.failMsg, data.creditsConsumed.
//   · Los archivos generados se guardan 14 días: se descargan apenas terminan.
//
// POR VERIFICAR con la primera llamada real (`.\probar.ps1 -UnaImagen`); todo está aislado en
// `config.json` → "kieImagen":
//   · El PRECIO en créditos de cada modelo y resolución: la documentación no lo publica (sus ejemplos
//     muestran 3 y 8 créditos, pero son ejemplos). El consumo real sí llega en `creditsConsumed`.
//   · Que las fotos del producto sirvan como enlace público cualquiera. En Sunburst el campo es una lista
//     de URL sin más condición; en Nano Banana la documentación dice que deben ser «URL de archivo tras
//     subirlo» (su API de subida), así que con esos modelos puede hacer falta subir la foto primero.
//   · Qué resolución alcanza (1K es la más barata; el clip sale a 720p, así que debería sobrar).
//   · Si con relación 9:16 y fotos de referencia el modelo respeta la relación pedida.
const path = require("path");
const { descargar, esperar } = require("../lib/red");
const kieVideo = require("../proveedores/kie");

const { llamar, ErrorKie } = kieVideo;

function modeloPara(cfg, trabajo) {
  const k = cfg.config.kieImagen || {};
  const catalogo = k.modelos || {};
  const pedido = trabajo.opciones && trabajo.opciones.modeloImagen;
  const alias = (pedido && catalogo[pedido] && pedido) || ((k.porFormato || {})[trabajo.formato] && catalogo[(k.porFormato || {})[trabajo.formato]] && (k.porFormato || {})[trabajo.formato]) || k.porDefecto;
  const m = alias && catalogo[alias];
  if (!m || typeof m !== "object") throw new Error(`config.json no define el modelo de imagen de Kie «${alias}» (kieImagen.modelos).`);
  return { alias, ...m };
}

const numero = (r) => {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(r);
  return m ? Number(m[1]) / Number(m[2]) : null;
};

/** La relación pedida si el modelo la admite; si no, la más parecida de las que admite. */
function relacionPara(modelo, relacion) {
  const lista = (modelo.relaciones || []).filter((r) => numero(r));
  if (!lista.length || lista.includes(relacion)) return relacion;
  const pedida = numero(relacion) || 9 / 16;
  return lista.reduce((mejor, r) => (Math.abs(Math.log(numero(r) / pedida)) < Math.abs(Math.log(numero(mejor) / pedida)) ? r : mejor));
}

function armarPrompt(cfg, ctx, conFotos) {
  const k = cfg.config.kieImagen || {};
  const partes = [String(ctx.prompt || "").trim()];
  if (conFotos && k.instruccionReferencia) partes.push(k.instruccionReferencia);
  if (k.incluirAnalisis !== false && ctx.analisis) partes.push(`${k.prefijoAnalisis || "Sobre el producto:"} ${String(ctx.analisis).trim()}`);
  if (k.sufijoPrompt) partes.push(k.sufijoPrompt);
  return partes.filter(Boolean).join("\n").slice(0, k.maxLetrasPrompt || 8000);
}

/** Arma `{ model, input }` con los nombres de campo de la documentación. */
function armarTarea(cfg, ctx, modelo) {
  const k = cfg.config.kieImagen || {};
  const tope = Math.min(modelo.maxReferencias || 1, k.maxReferencias || 4);
  const fotos = (ctx.referencias || []).filter((u) => /^https:\/\//.test(u) || (cfg.kieBase && /^http:\/\/127\.0\.0\.1:/.test(u))).slice(0, tope);
  const conFotos = fotos.length > 0;
  const model = conFotos ? modelo.modeloConReferencias : modelo.modeloSinReferencias;
  if (!model) throw new Error(`El modelo de imagen «${modelo.alias}» no tiene identificador ${conFotos ? "con" : "sin"} fotos de referencia en config.json.`);
  const input = {
    prompt: armarPrompt(cfg, ctx, conFotos),
    aspect_ratio: relacionPara(modelo, ctx.relacion),
    ...(modelo.entrada || {}),
  };
  if (conFotos) input[modelo.campoReferencias || "input_urls"] = fotos;
  return { model, input, fotos: fotos.length };
}

module.exports = {
  nombre: "kie",
  modeloPara,
  relacionPara,
  armarTarea,

  comprobar(cfg) {
    if (!cfg.kieKey) return "Falta KIE_API_KEY en el .env (se crea en kie.ai → API Key): sin ella no se pueden generar imágenes base.";
    const k = cfg.config.kieImagen || {};
    if (!k.modelos || !k.porDefecto || !k.modelos[k.porDefecto]) return "config.json no tiene la sección «kieImagen» con sus modelos.";
    return null;
  },

  async generarImagen(ctx) {
    const { cfg, escena, trabajo, registro } = ctx;
    const k = cfg.config.kieImagen || {};
    const modelo = modeloPara(cfg, trabajo);

    // Si esta escena ya tiene tarea de un intento anterior, se retoma: no se paga dos veces.
    let peticion = ctx.memoria && ctx.memoria.taskId && ctx.memoria.alias === modelo.alias ? ctx.memoria : null;
    if (!peticion) {
      const tarea = armarTarea(cfg, ctx, modelo);
      let d;
      try {
        // Crear NO se repite a ciegas: si la red se corta justo aquí, la tarea pudo quedar creada y cobrada.
        d = await llamar(cfg, "POST", "/api/v1/jobs/createTask", { model: tarea.model, input: tarea.input }, { repetir: false });
      } catch (e) {
        if (e instanceof ErrorKie && (e.code === 401 || e.code === 402)) e.deLaCuenta = true; // clave o saldo: las demás escenas fallarían igual
        if (!(e instanceof ErrorKie)) e.message = `No se supo si Kie recibió la imagen de la escena ${escena.n} (${e.message}). Antes de repetirla, mira en kie.ai si la tarea quedó creada.`;
        throw e;
      }
      const taskId = d && d.taskId;
      if (typeof taskId !== "string" || !/^[\w.-]+$/.test(taskId)) throw new Error("Kie aceptó la tarea de imagen pero no devolvió taskId.");
      peticion = { taskId, alias: modelo.alias, model: tarea.model, enviadaAt: new Date().toISOString() };
      ctx.recordar(peticion);
      registro.info(`kie imagen: escena ${escena.n} enviada (${tarea.model}, ${tarea.input.aspect_ratio}, ${tarea.input.resolution || "resolución por defecto"}, ${tarea.fotos} foto(s) de referencia), tarea ${taskId}`);
    } else {
      registro.info(`kie imagen: escena ${escena.n} retoma la tarea ${peticion.taskId}`);
    }

    let cada = (k.consultarCadaSegundos || 4) * 1000;
    const limite = Date.now() + (k.limiteMinutosPorImagen || 10) * 60000;
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
        throw new Error(`Kie no pudo generar la imagen de la escena ${escena.n}: ${String(data.failMsg || "sin motivo").slice(0, 300)}${data.failCode ? ` (${data.failCode})` : ""}`);
      }
      if (!["waiting", "queuing", "generating"].includes(estado)) throw new Error(`Kie devolvió un estado que no se esperaba: ${String(estado).slice(0, 60)}`);
      if (Date.now() > limite) throw new Error(`Kie lleva más de ${k.limiteMinutosPorImagen || 10} minutos con la imagen de la escena ${escena.n}; al volver a pedirla se retoma la misma tarea (no se paga otra).`);
      if (ctx.fase) ctx.fase(estado === "generating" ? "generando" : "cola");
      await ctx.latir(`Escena ${escena.n}: imagen ${estado === "generating" ? "generándose en Kie" : "en la cola de Kie"}`);
      await esperar(cada);
      cada = Math.min(cada + 2000, 15000);
    }

    const url = kieVideo.urlDelVideo(data, !!cfg.kieBase); // misma forma que el video: resultJson.resultUrls[0]
    const ext = (/\.(png|jpe?g|webp)(?:$|\?)/i.exec(url) || [])[1];
    const archivo = `${ctx.base}.${ext ? ext.toLowerCase().replace("jpeg", "jpg") : "png"}`;
    await descargar(url, path.join(ctx.carpeta, archivo)); // sin la clave: la URL del archivo es pública
    ctx.recordar(null);
    const gastados = typeof data.creditsConsumed === "number" ? data.creditsConsumed : null;
    const usd = (cfg.config.kie || {}).usdPorCredito;
    const costoUsd = gastados !== null && typeof usd === "number" ? Math.round(gastados * usd * 1000) / 1000 : null;
    return { archivo, modelo: `kie:${peticion.model || modelo.alias}`, creditos: gastados, costoUsd };
  },
};
