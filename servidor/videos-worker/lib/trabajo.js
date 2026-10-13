"use strict";
// Un trabajo de punta a punta: generar cada escena → voz → montar → subir → reportar.
// (Este es el video completo «de los de antes»: un trabajo SIN `etapa`. Los trabajos
// con `etapa` — proyecto por escenas — los atiende lib/etapas.js; ver `procesar`.)
//
// Todo lo que se va haciendo queda en `datos/trabajos/<id>/` con un
// `estado.json`. Si el proceso se cae o el equipo se reinicia, al volver se
// retoma desde ahí: las escenas ya generadas no se vuelven a pedir (ni a pagar).
const fs = require("fs");
const path = require("path");
const { tamano } = require("./ffmpeg");
const { armarAss } = require("./subtitulos");
const voz = require("./voz");
const { TrabajoSoltado } = require("./crm");
const { procesarEtapa, anotarCosto: anotarFila } = require("./etapas");
const { limpiarProyectos } = require("./proyecto");

const dos = (n) => String(n).padStart(2, "0");
const redondo = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function leerEstado(carpeta) {
  try {
    return JSON.parse(fs.readFileSync(path.join(carpeta, "estado.json"), "utf8"));
  } catch {
    return null;
  }
}

function guardarEstado(carpeta, estado) {
  const archivo = path.join(carpeta, "estado.json");
  fs.writeFileSync(`${archivo}.tmp`, JSON.stringify(estado, null, 1));
  fs.renameSync(`${archivo}.tmp`, archivo);
}

/** Trabajos que quedaron a medias en disco (el proceso se cerró mientras los hacía). */
function pendientesEnDisco(cfg) {
  if (!fs.existsSync(cfg.carpetas.trabajos)) return [];
  return fs
    .readdirSync(cfg.carpetas.trabajos)
    .map((id) => leerEstado(path.join(cfg.carpetas.trabajos, id)))
    .filter((e) => e && e.enCurso && e.trabajo && e.trabajo.id && e.trabajo.toma)
    .map((e) => e.trabajo);
}

/** Borra restos viejos: carpetas de trabajos abandonados y videos entregados de más. */
function limpiarRestos(cfg) {
  const dias = cfg.config.diasParaBorrarRestos || 3;
  const limite = Date.now() - dias * 86400000;
  if (fs.existsSync(cfg.carpetas.trabajos)) {
    for (const id of fs.readdirSync(cfg.carpetas.trabajos)) {
      const carpeta = path.join(cfg.carpetas.trabajos, id);
      const e = leerEstado(carpeta);
      const marca = fs.statSync(carpeta).mtimeMs;
      if ((!e || !e.enCurso) && marca < limite) fs.rmSync(carpeta, { recursive: true, force: true });
    }
  }
  if (fs.existsSync(cfg.carpetas.entregados)) {
    const videos = fs
      .readdirSync(cfg.carpetas.entregados)
      .filter((f) => f.endsWith(".mp4"))
      .sort()
      .reverse();
    for (const f of videos.slice(cfg.config.conservarEntregados || 30)) fs.rmSync(path.join(cfg.carpetas.entregados, f), { force: true });
  }
  limpiarProyectos(cfg);
}

async function procesar(trabajo, deps) {
  // Proyecto por escenas: imágenes, clips o armado. Sin `etapa`, el video completo de siempre.
  if (trabajo && trabajo.etapa) return procesarEtapa(trabajo, deps);
  const { cfg, crm, ff, proveedor, registro } = deps;
  const carpeta = path.join(cfg.carpetas.trabajos, trabajo.id);
  fs.mkdirSync(carpeta, { recursive: true });

  // Si este trabajo ya se había empezado (reintento o reinicio), se conserva lo hecho.
  const previo = leerEstado(carpeta);
  const estado = {
    trabajo,
    enCurso: true,
    escenas: (previo && previo.escenas) || {},
    segundosGenerados: (previo && previo.segundosGenerados) || 0,
    costoUsd: previo && typeof previo.costoUsd === "number" ? previo.costoUsd : null,
    costoDesconocido: !!(previo && previo.costoDesconocido),
    modelos: (previo && previo.modelos) || [],
    creditos: (previo && previo.creditos) || 0,
  };
  guardarEstado(carpeta, estado);

  const gasto = () => ({
    segundosGenerados: redondo(estado.segundosGenerados),
    // Si alguna escena no tiene tarifa conocida, no se inventa un total.
    ...(estado.costoDesconocido || estado.costoUsd === null ? {} : { costoEstimadoUsd: redondo(estado.costoUsd, 3) }),
  });

  const total = trabajo.escenas.length + 2; // escenas + voz + montaje
  let fase = "generando";
  let hecho = 0;
  let ultimoLatido = 0;
  async function reportar(detalle, forzar = false) {
    if (!forzar && Date.now() - ultimoLatido < 20000) return;
    ultimoLatido = Date.now();
    await crm.progreso(trabajo, { estado: fase, progreso: { hecho, total, detalle: String(detalle).slice(0, 200) }, ...gasto() });
  }

  // De dónde sale el audio: "veo" (el que trae el clip), "elevenlabs" o "ninguno".
  // Se decide por formato en config.json → audio. Si el proveedor no da audio
  // propio (simulado, fal), "veo" cae a ElevenLabs.
  const ajusteAudio = cfg.config.audio || {};
  let audio = (ajusteAudio.porFormato || {})[trabajo.formato] || ajusteAudio.porDefecto || "elevenlabs";
  if (!["veo", "elevenlabs", "ninguno"].includes(audio)) audio = "elevenlabs";
  if (!trabajo.opciones.voz) audio = "ninguno";
  if (audio === "veo" && !proveedor.daAudio) audio = "elevenlabs";

  const avisos = [];
  try {
    registro.info(`Trabajo ${trabajo.id}: «${trabajo.producto}» v${trabajo.version}, ${trabajo.escenas.length} escenas, ${trabajo.relacionAspecto}, intento ${trabajo.intentos} de ${trabajo.maxIntentos}, proveedor ${proveedor.nombre}`);
    const { ancho, alto } = tamano(trabajo.relacionAspecto, cfg.config.salida.ladoCorto);
    await reportar("Empezando", true);

    // ---------------------------------------------------- 1. escenas ----
    for (const escena of trabajo.escenas) {
      const clip = `clip-${dos(escena.n)}.mp4`;
      const memo = estado.escenas[escena.n] || {};
      const yaEsta = memo.listo && fs.existsSync(path.join(carpeta, clip)) && (await ff.duracion(clip, carpeta)) > 0.5;
      if (!yaEsta) {
        await reportar(`Escena ${escena.n} de ${trabajo.escenas.length}: ${escena.nombre}`, true);
        const r = await proveedor.generarEscena({
          cfg,
          registro,
          ff,
          trabajo,
          escena,
          carpeta,
          salida: clip,
          ancho,
          alto,
          relacion: trabajo.relacionAspecto,
          audio,
          memoria: memo.memoria || null,
          recordar: (m) => {
            estado.escenas[escena.n] = { ...(estado.escenas[escena.n] || {}), memoria: m };
            guardarEstado(carpeta, estado);
          },
          latir: (detalle) => reportar(detalle),
        });
        if ((await ff.duracion(clip, carpeta)) <= 0.5) throw new Error(`El proveedor no dejó un clip válido para la escena ${escena.n}.`);
        estado.escenas[escena.n] = { listo: true, segundos: r.segundos, modelo: r.modelo };
        estado.segundosGenerados += r.segundos || 0;
        if (typeof r.costoUsd === "number") estado.costoUsd = (estado.costoUsd || 0) + r.costoUsd;
        else estado.costoDesconocido = true;
        if (typeof r.creditos === "number") estado.creditos += r.creditos;
        if (r.modelo && !estado.modelos.includes(r.modelo)) estado.modelos.push(r.modelo);
        guardarEstado(carpeta, estado);
      } else {
        registro.info(`Trabajo ${trabajo.id}: la escena ${escena.n} ya estaba generada, se reutiliza`);
      }
      hecho = escena.n;
      await reportar(`Escena ${escena.n} de ${trabajo.escenas.length} lista`, true);
    }

    // -------------------------------------------------------- 2. voz ----
    const voces = {}; // n de escena → { archivo, dura }
    let sinVoz = true;
    const hayTexto = trabajo.escenas.some((e) => e.voz && e.voz.trim());
    if (audio === "veo") {
      // La voz ya viene en los clips de Veo: no se pisa con otra.
      sinVoz = !hayTexto;
    } else if (audio === "ninguno") {
      if (hayTexto) avisos.push(trabajo.opciones.voz ? "Este formato está configurado sin audio." : "Se pidió sin voz.");
    } else if (!hayTexto) {
      avisos.push("El guion no trae frases habladas: el video sale sin voz.");
    } else if (!voz.disponible(cfg)) {
      avisos.push("El servidor no tiene clave de ElevenLabs: el video sale sin voz (con subtítulos si se pidieron).");
    } else {
      try {
        for (const escena of trabajo.escenas) {
          if (!escena.voz || !escena.voz.trim()) continue;
          const mp3 = `voz-${dos(escena.n)}.mp3`;
          if (!fs.existsSync(path.join(carpeta, mp3)) || (await ff.duracion(mp3, carpeta)) <= 0.2) {
            await reportar(`Voz de la escena ${escena.n}`, true);
            await voz.generar(cfg, escena.voz, path.join(carpeta, mp3));
          }
          voces[escena.n] = { archivo: mp3, dura: await ff.duracion(mp3, carpeta) };
        }
        sinVoz = Object.keys(voces).length === 0;
      } catch (e) {
        if (!e.sinRemedio) throw e;
        // Clave inválida o sin saldo: reintentar no lo arregla. Sale sin voz y se avisa.
        for (const k of Object.keys(voces)) delete voces[k];
        avisos.push(`ElevenLabs rechazó la clave o no tiene saldo: el video sale sin voz. (${registro.limpiar(e.message).slice(0, 160)})`);
      }
    }
    hecho = trabajo.escenas.length + 1;

    // ---------------------------------------------------- 3. montaje ----
    fase = "montando";
    await reportar("Uniendo las escenas", true);
    const fps = cfg.config.salida.fps || 30;
    const tramos = [];
    const inicios = [];
    let cursor = 0;
    const lista = [];
    for (const escena of trabajo.escenas) {
      const v = voces[escena.n];
      // La escena dura lo del guion, o lo que dure su frase si es más larga.
      const clip = `clip-${dos(escena.n)}.mp4`;
      // Con el audio de Veo la escena dura lo que dura su clip, para no cortar la frase.
      const conAudioDelClip = audio === "veo" && (await ff.tieneAudio(clip, carpeta));
      if (audio === "veo" && !conAudioDelClip) avisos.push(`El clip de la escena ${escena.n} llegó sin audio.`);
      const dura = redondo(conAudioDelClip ? Math.max(escena.duracion, await ff.duracion(clip, carpeta)) : Math.max(escena.duracion, v ? v.dura + 0.4 : 0), 2);
      const norm = `norm-${dos(escena.n)}.mp4`;
      // Todas las escenas salen con video y audio iguales (silencio si no hay), para poder unirlas sin recodificar.
      await ff.ffmpeg(
        [
          "-i", clip,
          "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
          "-filter_complex",
          `[0:v]scale=${ancho}:${alto}:force_original_aspect_ratio=increase,crop=${ancho}:${alto},setsar=1,fps=${fps},tpad=stop_mode=clone:stop_duration=60[v];` +
            (conAudioDelClip ? "[0:a]aresample=44100,aformat=channel_layouts=stereo,apad[a]" : "[1:a]anull[a]"),
          "-map", "[v]", "-map", "[a]",
          "-t", String(dura), "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-video_track_timescale", "15360",
          "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
          norm,
        ],
        carpeta,
      );
      lista.push(`file '${norm}'`);
      inicios.push(cursor);
      const texto = (escena.voz || "").trim();
      if (texto && trabajo.opciones.subtitulos) {
        const palabras = texto.split(/\s+/).length;
        // Con voz de ElevenLabs se conoce su duración; con la de Veo (o sin voz) se reparte sobre la escena.
        tramos.push({ texto, desde: cursor + (conAudioDelClip ? 0.3 : 0.12), dura: v ? v.dura : Math.min(dura - (conAudioDelClip ? 0.8 : 0.4), Math.max(1.2, palabras * 0.42)) });
      }
      cursor += dura;
    }
    const duracionTotal = redondo(cursor, 2);
    fs.writeFileSync(path.join(carpeta, "lista.txt"), lista.join("\n") + "\n");
    await ff.ffmpeg(["-f", "concat", "-safe", "0", "-i", "lista.txt", "-c", "copy", "cuerpo.mp4"], carpeta);

    let filtroVideo = "[0:v]null[v]";
    if (tramos.length) {
      const s = cfg.config.subtitulos || {};
      const { ass, eventos } = armarAss(tramos, { ancho, alto, fuente: s.fuente, resaltado: s.resaltado, maxPalabras: s.maxPalabras });
      if (eventos) {
        fs.writeFileSync(path.join(carpeta, "subtitulos.ass"), ass, "utf8");
        filtroVideo = "[0:v]ass=subtitulos.ass[v]";
      }
    } else if (trabajo.opciones.subtitulos) {
      avisos.push("El guion no trae frases habladas: el video sale sin subtítulos.");
    }

    // Audio: el de las escenas unidas (el de Veo, o silencio) y, encima, cada voz de ElevenLabs en el momento de su escena.
    await reportar("Mezclando voz y quemando subtítulos", true);
    const entradas = ["-i", "cuerpo.mp4"];
    const mezcla = ["[0:a]"];
    const filtros = [filtroVideo];
    trabajo.escenas.forEach((escena, i) => {
      const v = voces[escena.n];
      if (!v) return;
      const idx = mezcla.length;
      entradas.push("-i", v.archivo);
      const ms = Math.round((inicios[i] + 0.12) * 1000);
      filtros.push(`[${idx}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}:all=1[a${idx}]`);
      mezcla.push(`[a${idx}]`);
    });
    filtros.push(mezcla.length > 1 ? `${mezcla.join("")}amix=inputs=${mezcla.length}:duration=first:normalize=0:dropout_transition=0[a]` : "[0:a]anull[a]");
    await ff.ffmpeg(
      [
        ...entradas,
        "-filter_complex", filtros.join(";"),
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "medium", "-crf", String(cfg.config.salida.crf || 21), "-pix_fmt", "yuv420p", "-r", String(fps),
        "-c:a", "aac", "-b:a", "160k", "-t", String(duracionTotal), "-movflags", "+faststart",
        "final.mp4",
      ],
      carpeta,
    );
    const duracionFinal = await ff.duracion("final.mp4", carpeta);
    if (duracionFinal < 1) throw new Error("El montaje no produjo un video válido.");
    hecho = total;

    // ---------------------------------------------------- 4. entrega ----
    await reportar("Subiendo el video al CRM", true);
    const final = path.join(carpeta, "final.mp4");
    const r = await crm.entregar(trabajo, final, {
      duracion: redondo(duracionFinal, 2),
      proveedor: proveedor.nombre,
      modelos: estado.modelos,
      sinVoz,
      avisos: [...avisos, ...(estado.creditos ? [`Créditos gastados en el proveedor: ${redondo(estado.creditos, 2)}.`] : []), `Audio: ${audio === "veo" ? "el generado por Veo" : audio === "elevenlabs" ? (sinVoz ? "sin voz" : "voz de ElevenLabs") : "ninguno"}.`],
      ...gasto(),
    });

    fs.mkdirSync(cfg.carpetas.entregados, { recursive: true });
    fs.copyFileSync(final, path.join(cfg.carpetas.entregados, `${trabajo.id}.mp4`));
    anotarCosto(cfg, trabajo, proveedor.nombre, estado, duracionFinal, "listo");
    fs.rmSync(carpeta, { recursive: true, force: true });
    registro.info(`Trabajo ${trabajo.id}: entregado (${redondo(duracionFinal)} s de video, ${redondo(estado.segundosGenerados)} s generados${sinVoz ? ", sin voz" : ""}). Queda por aprobar en el CRM.`);
    return { ok: true, respuesta: r };
  } catch (e) {
    if (e instanceof TrabajoSoltado) {
      // El CRM ya se lo dio a otro o lo cerró: se deja sin reportar. Los clips quedan por si vuelve.
      registro.aviso(`Trabajo ${trabajo.id}: el CRM lo retiró (${e.message}). Se deja.`);
      guardarEstado(carpeta, { ...estado, enCurso: false });
      return { ok: false, soltado: true };
    }
    const motivo = registro.limpiar(e && e.message ? e.message : String(e)).slice(0, 600);
    registro.error(`Trabajo ${trabajo.id}: falló el intento ${trabajo.intentos}: ${motivo}`);
    guardarEstado(carpeta, { ...estado, enCurso: false });
    try {
      const r = await crm.fallo(trabajo, { motivo, ...gasto() });
      if (r.estado === "fallo") {
        registro.error(`Trabajo ${trabajo.id}: quedó en FALLO definitivo tras ${r.intentos} intentos. No bloquea la cola.`);
        anotarCosto(cfg, trabajo, proveedor.nombre, estado, 0, "fallo");
        fs.rmSync(carpeta, { recursive: true, force: true });
      } else {
        registro.aviso(`Trabajo ${trabajo.id}: vuelve a la cola; el CRM lo entrega de nuevo desde ${r.reintentaDesde || "ya"}.`);
      }
    } catch (e2) {
      // Ni siquiera se pudo avisar: el CRM lo recupera solo cuando venza la toma.
      registro.error(`Trabajo ${trabajo.id}: no se pudo reportar el fallo al CRM (${registro.limpiar(e2.message)}). El CRM lo recuperará al vencer la toma.`);
    }
    return { ok: false };
  }
}

/** Una línea por trabajo en `registro/costos.csv` (las columnas las define lib/etapas.js). */
function anotarCosto(cfg, t, proveedor, estado, duracion, resultado) {
  anotarFila(cfg, {
    trabajo: t,
    etapa: resultado === "un-clip" ? "un-clip" : "completo",
    proveedor,
    modelos: estado.modelos,
    resultado: resultado === "un-clip" ? "listo" : resultado,
    segundosVideo: duracion,
    segundosGenerados: estado.segundosGenerados,
    costoUsd: estado.costoDesconocido || estado.costoUsd === null ? null : estado.costoUsd,
    creditos: estado.creditos,
  });
}

/**
 * Prueba de UN solo clip con el proveedor real configurado: la escena más corta
 * posible, solo texto, sin CRM ni montaje. Para gastar lo mínimo en la primera llamada.
 */
async function unClip(deps, prompt) {
  const { cfg, ff, proveedor, registro } = deps;
  const carpeta = path.join(cfg.carpetas.datos, "un-clip");
  fs.mkdirSync(carpeta, { recursive: true });
  const memoArchivo = path.join(carpeta, "tarea.json");
  let memoria = null;
  try {
    memoria = JSON.parse(fs.readFileSync(memoArchivo, "utf8"));
  } catch {
    /* primera vez */
  }
  const salida = `un-clip-${proveedor.nombre}.mp4`;
  const escena = { n: 1, nombre: "Prueba de un clip", prompt, duracion: 4, usaImagenProducto: false, voz: "" };
  const trabajo = { id: "un-clip", formato: "prueba", relacionAspecto: "9:16", imagenesProducto: [], opciones: { subtitulos: false, voz: false, modelo: null } };
  const { ancho, alto } = tamano("9:16", cfg.config.salida.ladoCorto);
  registro.aviso(`PRUEBA DE UN CLIP con «${proveedor.nombre}»: se pide UNA escena de la duración mínima. Esto SÍ gasta si el proveedor es real.`);
  const r = await proveedor.generarEscena({
    cfg, registro, ff, trabajo, escena, carpeta, salida, ancho, alto, relacion: "9:16", audio: "ninguno", memoria,
    recordar: (m) => (m ? fs.writeFileSync(memoArchivo, JSON.stringify(m)) : fs.rmSync(memoArchivo, { force: true })),
    latir: async (d) => registro.info(d),
  });
  const dura = await ff.duracion(salida, carpeta);
  const conAudio = await ff.tieneAudio(salida, carpeta);
  registro.info(`Clip listo: ${path.join(carpeta, salida)} · ${redondo(dura)} s · ${conAudio ? "con" : "sin"} audio · modelo ${r.modelo} · ${r.segundos} s cobrados${typeof r.creditos === "number" ? ` · ${r.creditos} créditos` : ""}${typeof r.costoUsd === "number" ? ` · ≈ US$ ${r.costoUsd}` : ""}`);
  anotarCosto(cfg, { id: "un-clip", guionId: "", version: "", formato: "prueba" }, proveedor.nombre, { modelos: [r.modelo], segundosGenerados: r.segundos || 0, costoUsd: typeof r.costoUsd === "number" ? r.costoUsd : null, costoDesconocido: typeof r.costoUsd !== "number", creditos: r.creditos || 0 }, dura, "un-clip");
  return { archivo: path.join(carpeta, salida), dura, conAudio, ...r };
}

module.exports = { procesar, pendientesEnDisco, limpiarRestos, unClip };
