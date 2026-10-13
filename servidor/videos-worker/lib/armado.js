"use strict";
// Etapa «armado» del proyecto por escenas. No cuesta: todo lo hace ffmpeg aquí.
//
//   1. Trae lo que falte (clips aprobados, fotos reales, música). Lo que ya está en
//      la caché (`datos/cache/`, COMPARTIDA por todos los proyectos) no se vuelve a bajar.
//      Cada archivo se identifica por su dirección sin la firma: las variaciones de un
//      proyecto, que comparten clips con el original, no bajan ni codifican lo mismo otra vez.
//   2. Cada escena se codifica UNA vez a su «segmento» final (tamaño, fps y audio
//      iguales, con sus subtítulos y, en el cierre, el rótulo ya dibujados). El
//      nombre del segmento es la huella de todo lo que lo define: si nada de esa
//      escena cambió, el segmento se reutiliza tal cual.
//   3. Los segmentos se unen sin recodificar. Con música, solo se recodifica el audio.
//
// Por eso cambiar un texto (un subtítulo, la oferta) solo rehace la escena tocada, y
// armar dos veces el mismo proyecto da exactamente el mismo archivo.
const fs = require("fs");
const path = require("path");
const { tamano } = require("./ffmpeg");
const { armarAss } = require("./subtitulos");
const { disenarCierre } = require("./rotulo");
const { huella, traer } = require("./proyecto");
const { ajustesParalelo, crearCerrojos } = require("./limites");
const voz = require("./voz");
const { decidirAudio, seHabla } = require("./habla");
const { elegirPista } = require("./musica");

// Si cambia la forma de codificar un segmento, se sube este número: invalida la caché.
const VERSION = 2;
const MOVIMIENTOS = ["acercar", "alejar", "paneo-izq", "paneo-der", "quieto"];
const redondo = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const BITEXACTO = ["-map_metadata", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact"];

/** De dónde sale el audio según el formato: "veo" (el del clip), "elevenlabs" o "ninguno". */
function modoAudio(cfg, trabajo) {
  return decidirAudio(cfg, trabajo, voz.disponible(cfg)).modo; // la regla completa está en lib/habla.js
}

/** Expresiones de zoompan para cada movimiento. `n` = fotogramas de la escena, `a` = amplitud. */
function movimiento(tipo, n, a) {
  const p = `on/${Math.max(1, n - 1)}`;
  const cx = "iw/2-(iw/zoom/2)";
  const cy = "ih/2-(ih/zoom/2)";
  switch (tipo) {
    case "alejar":
      return { z: `${1 + a}-${a}*${p}`, x: cx, y: cy };
    case "paneo-der":
      return { z: `${1 + a}`, x: `(iw-iw/zoom)*${p}`, y: cy };
    case "paneo-izq":
      return { z: `${1 + a}`, x: `(iw-iw/zoom)*(1-${p})`, y: cy };
    case "quieto":
      return { z: "1", x: "0", y: "0" };
    default:
      return { z: `1+${a}*${p}`, x: cx, y: cy };
  }
}

/**
 * Filtro que arma el cuadro de una foto: la foto ENTERA (sin deformarla) dentro de
 * `caja`, sobre un fondo difuminado de ella misma que llena el cuadro. `ampliar` > 1
 * deja crecer la foto hasta ese factor para llenar la caja (recortando un poco los bordes).
 * Todo al doble de tamaño, para que el movimiento no tiemble.
 */
function filtroLienzo({ W, H, caja, ampliar, oscurecer }) {
  const par = (n) => Math.max(2, Math.round(n / 2) * 2);
  const W2 = W * 2;
  const H2 = H * 2;
  const bx = Math.round(caja.x * 2);
  const by = Math.round(caja.y * 2);
  const bw = par(caja.w * 2);
  const bh = par(caja.h * 2);
  const e = `min(max(${bw}/iw,${bh}/ih),min(${bw}/iw,${bh}/ih)*${ampliar})`;
  return (
    `[0:v]select='eq(n,0)',format=yuv444p,split[lf][lp];` +
    `[lf]scale=${par(W2 / 8)}:${par(H2 / 8)}:force_original_aspect_ratio=increase,crop=${par(W2 / 8)}:${par(H2 / 8)},boxblur=10:3,scale=${W2}:${H2},eq=brightness=${oscurecer}:saturation=0.9[lfondo];` +
    `[lp]scale=w='trunc(iw*${e}/2)*2':h='trunc(ih*${e}/2)*2',crop=w='min(iw,${bw})':h='min(ih,${bh})'[lfoto];` +
    `[lfondo][lfoto]overlay=x='${bx}+(${bw}-w)/2':y='${by}+(${bh}-h)/2'[lienzo]`
  );
}

/**
 * Arma el video final del proyecto.
 *   { cfg, ff, registro, trabajo, carpeta, latir }
 * Devuelve { archivo, duracion, sinVoz, avisos, stats, segundos, cierres }.
 */
async function armar({ cfg, ff, registro, trabajo, carpeta, latir = async () => {}, conCerrojo = crearCerrojos() }) {
  const t0 = Date.now();
  const hilos = ajustesParalelo(cfg).hilosFfmpeg; // el resultado de x264 depende del número de hilos: va en la huella
  const A = cfg.config.armado || {};
  const F = A.fotoReal || {};
  const salida = cfg.config.salida || {};
  const fps = salida.fps || 30;
  const crf = salida.crf || 21;
  const preset = A.preset || "veryfast";
  const { ancho, alto } = tamano(trabajo.relacionAspecto, salida.ladoCorto);
  const escenas = Array.isArray(trabajo.todas) && trabajo.todas.length ? trabajo.todas : trabajo.escenas || [];
  if (!escenas.length) throw new Error("El trabajo de armado no trae escenas.");
  const contexto = trabajo.contexto || {};
  const cierre = contexto.cierre || {};
  const opciones = trabajo.opciones || {};
  const conSubtitulos = opciones.subtitulos !== false;
  // De dónde sale el audio: por defecto, el de los propios clips. ElevenLabs solo si el trabajo lo pide y hay clave.
  const decision = decidirAudio(cfg, trabajo, voz.disponible(cfg));
  const modo = decision.modo;
  const H = A.habla || {};
  const pedidaMusicaAntes = !!(typeof opciones.musica === "string" ? opciones.musica : opciones.musica && opciones.musica.url);
  const local = !!cfg.permitirHttpLocal; // solo las pruebas
  const stats = { descargas: 0, reutilizados: 0, segmentosHechos: 0, segmentosReutilizados: 0, vocesHechas: 0, finalReutilizado: false };
  const avisos = [];
  if (decision.aviso) avisos.push(decision.aviso);
  let ttsActivo = modo === "elevenlabs";
  const sinNarrar = [];
  const sinLocucion = []; // escenas de foto con frase, cuando el audio es el de los clips
  const sinAudio = []; // clips con frase que llegaron sin audio o en silencio
  const usados = new Set();
  const enCarpeta = (f) => path.join(carpeta, f);

  /** Voz de ElevenLabs de un texto, guardada por su huella (un mismo texto no se paga dos veces). */
  async function narrar(n, texto) {
    if (!ttsActivo) return null;
    const v = cfg.config.voz || {};
    const mp3 = `v-${huella(texto, cfg.elevenVoz, v.modelo, v.estabilidad, v.similitud)}.mp3`;
    try {
      await conCerrojo(mp3, async () => {
        if (fs.existsSync(enCarpeta(mp3)) && (await ff.duracion(mp3, carpeta)) > 0.2) return;
        await latir(`Voz de la escena ${n}`);
        await voz.generar(cfg, texto, enCarpeta(`tmp-${mp3}`));
        fs.renameSync(enCarpeta(`tmp-${mp3}`), enCarpeta(mp3));
        stats.vocesHechas++;
      });
      usados.add(mp3);
      return { archivo: mp3, dura: await ff.duracion(mp3, carpeta) };
    } catch (e) {
      if (!e.sinRemedio) throw e;
      // Clave inválida o sin saldo: reintentar no lo arregla. Sigue sin voz y se avisa.
      ttsActivo = false;
      avisos.push(`ElevenLabs rechazó la clave o no tiene saldo: lo que falte por narrar sale sin voz. (${registro.limpiar(e.message).slice(0, 160)})`);
      return null;
    }
  }

  // ------------------------------------------------ 1. cada escena ----
  const segmentos = [];
  const cierres = [];
  let cursor = 0;
  let algunaVoz = false;
  let hayCierre = false;
  for (const escena of escenas) {
    const esPrimera = segmentos.length === 0;
    const tipo = ["foto-real", "cierre"].includes(escena.tipo) ? escena.tipo : "generada";
    const texto = String(escena.voz || "").trim(); // lo que va en los subtítulos
    const dicho = seHabla(escena) ? texto : ""; // lo que alguien dice (locucion «texto» o «sin-voz»: nadie habla)
    const pedida = Number(escena.duracion) > 0 ? Number(escena.duracion) : 0;
    let fuente = null;
    let audioDe = "silencio";
    let narracion = null;
    let dura;
    let inicio = 0; // desde qué segundo del clip se toma (si se recorta un silencio inicial)
    let habla = null; // { desde, hasta } de la frase dentro del segmento, si se pudo medir
    let medida = null; // volumen medido del audio de esta escena

    if (tipo === "generada") {
      const clip = escena.clip || {};
      if (!clip.url) throw new Error(`No se puede armar: la escena ${escena.n} no tiene clip.`);
      if (clip.estado && clip.estado !== "aprobada") throw new Error(`No se puede armar: el clip de la escena ${escena.n} no está aprobado (${clip.estado}).`);
      await latir(`Escena ${escena.n}: clip`);
      fuente = await traer(carpeta, clip.url, { prefijo: "f", ext: "mp4", stats, local, conCerrojo });
      const duraClip = await ff.duracion(fuente, carpeta);
      if (duraClip <= 0.3) {
        fs.rmSync(enCarpeta(fuente), { force: true });
        throw new Error(`El clip de la escena ${escena.n} no se pudo leer (se descargará de nuevo en el próximo intento).`);
      }
      const conAudio = await ff.tieneAudio(fuente, carpeta);
      // El clip dura lo que admitió el modelo (4, 6, 8 s…): aquí se recorta a lo que pide la escena.
      dura = Math.min(pedida || duraClip, duraClip);
      const med = conAudio && modo === "veo" ? await ff.medirAudio(fuente, carpeta, { ruidoDb: H.ruidoDb, silencioMinimo: H.silencioMinimo }) : null;
      if (modo === "veo" && med && !(dicho && med.mudo)) {
        audioDe = "clip";
        medida = med;
        if (dicho) {
          // Habla el propio clip: se quitan los silencios largos del inicio y del final SIN cortar palabras.
          let fin = duraClip;
          if (med.inicioDetectado && med.desde > (H.recortarInicioDesde ?? 0.6)) inicio = Math.max(0, med.desde - (H.margenInicio ?? 0.25));
          // El PRIMER clip entra en seco: nada de silencio antes del gancho, por corto que sea.
          if (esPrimera && med.inicioDetectado && med.desde > (H.margenGancho ?? 0.06) + 0.05) inicio = Math.max(0, med.desde - (H.margenGancho ?? 0.06));
          if (med.finDetectado) {
            const finHabla = Math.min(duraClip, med.hasta + (H.margenFin ?? 0.35));
            if (duraClip - med.hasta > (H.recortarFinDesde ?? 0.8)) fin = finHabla;
            if (pedida && inicio + pedida < fin) {
              // Lo que pide la escena manda, salvo que cortaría la frase: ahí manda la frase.
              if (inicio + pedida >= finHabla) fin = inicio + pedida;
              else {
                fin = finHabla;
                if (fin - inicio - pedida > 0.4) avisos.push(`La escena ${escena.n} quedó en ${redondo(fin - inicio, 1)} s (se pedían ${redondo(pedida, 1)}) para no cortar la frase.`);
              }
            }
            habla = { desde: Math.max(0.05, med.desde - inicio), hasta: med.hasta - inicio };
          } else {
            // No se distingue dónde termina la frase (hay sonido hasta el final): se respeta la duración pedida.
            fin = Math.min(duraClip, inicio + (pedida || duraClip));
            if (duraClip - fin > 1) avisos.push(`La escena ${escena.n} se recortó de ${redondo(duraClip, 1)} a ${redondo(fin - inicio, 1)} s y no se pudo comprobar dónde termina la frase. Si se corta, sube la duración de esa escena y vuelve a armar.`);
          }
          dura = fin - inicio;
        }
      } else if (dicho && modo === "veo") {
        // Nunca un video mudo sin avisar.
        sinAudio.push(escena.n);
        avisos.push(`El clip de la escena ${escena.n} llegó ${conAudio ? "en silencio" : "sin audio"}: esa escena sale sin voz (con subtítulos si se pidieron). Vuelve a generar ese clip.`);
      } else if (dicho && modo === "elevenlabs") {
        narracion = await narrar(escena.n, dicho);
        if (narracion) {
          audioDe = "voz";
          dura = Math.max(dura, narracion.dura + 0.4); // si la frase es más larga, se congela el último fotograma
        } else sinNarrar.push(escena.n);
      }
    } else {
      const url = escena.fotoUrl || (Array.isArray(contexto.fotos) ? contexto.fotos[0] : null);
      if (url) {
        await latir(`Escena ${escena.n}: foto real`);
        fuente = await traer(carpeta, url, { prefijo: "f", ext: "jpg", stats, local, conCerrojo });
      } else if (tipo === "foto-real") {
        throw new Error(`No se puede armar: la escena ${escena.n} es de foto real y no trae foto (fotoUrl).`);
      } else {
        avisos.push("La escena de cierre no trae foto del producto: el rótulo va sobre un fondo liso.");
      }
      dura = Math.max(pedida || 4, tipo === "cierre" ? A.cierreMinSegundos || 5 : 0);
      if (dicho && modo === "elevenlabs") {
        narracion = await narrar(escena.n, dicho);
        if (narracion) {
          audioDe = "voz";
          dura = Math.max(dura, narracion.dura + 0.4);
        } else sinNarrar.push(escena.n);
      } else if (dicho && modo === "veo") {
        sinLocucion.push(escena.n); // una foto no habla: solo lleva subtítulos (y música, si hay)
      }
    }
    dura = Math.max(1, Math.round(dura * fps) / fps);
    inicio = redondo(inicio, 3);
    if (audioDe !== "silencio") algunaVoz = true;
    if (narracion) medida = await ff.medirAudio(narracion.archivo, carpeta, { ruidoDb: H.ruidoDb, silencioMinimo: H.silencioMinimo });
    // Nivelación: una ganancia fija por clip hacia el mismo volumen objetivo (sin compresión que «bombee»).
    let ganancia = 0;
    if (medida && Number.isFinite(medida.lufs) && medida.lufs > -60) {
      const tope = H.gananciaMaxDb ?? 12;
      ganancia = redondo(Math.max(-tope, Math.min(tope, (H.objetivoLufs ?? -16) - medida.lufs)), 1);
      if (!dicho) ganancia = Math.min(0, ganancia); // un clip donde nadie habla (solo ambiente) nunca se sube de volumen
    }

    // Subtítulos de esta escena (tiempos desde el inicio de SU segmento), sincronizados con lo que se oye.
    let tramo = null;
    if (texto && conSubtitulos) {
      const palabras = texto.split(/\s+/).length;
      let desde = audioDe === "clip" ? 0.3 : 0.12;
      let largo = narracion ? narracion.dura : Math.min(dura - (audioDe === "clip" ? 0.8 : 0.4), Math.max(1.2, palabras * 0.42));
      if (dicho && habla && habla.hasta - habla.desde > 0.4) {
        desde = habla.desde;
        largo = Math.min(dura - desde - 0.05, habla.hasta - habla.desde);
      }
      if (largo > 0.3) tramo = { texto, desde: redondo(desde, 2), dura: redondo(largo, 2) };
    }

    // Rótulo del cierre + reparto del cuadro.
    let diseno = null;
    if (tipo === "cierre") {
      hayCierre = true;
      diseno = disenarCierre({ ancho, alto, oferta: cierre.oferta, llamado: cierre.llamadoALaAccion, conSubtitulos: !!tramo, dura, estilo: cfg.config.rotulo || {} });
      for (const a of diseno.avisos) if (!avisos.includes(a)) avisos.push(a);
      cierres.push({ n: escena.n, inicio: cursor, dura, zonas: diseno.zonas, caja: diseno.caja });
    }
    const s = cfg.config.subtitulos || {};
    const { ass, eventos } = armarAss(tramo ? [tramo] : [], { ancho, alto, fuente: s.fuente, resaltado: s.resaltado, maxPalabras: s.maxPalabras }, diseno ? { estilos: diseno.estilos, eventos: diseno.eventos } : null);

    const mov = MOVIMIENTOS.includes(escena.movimiento) ? escena.movimiento : tipo === "cierre" ? "acercar" : F.movimientoPorDefecto || "acercar";
    const amplitud = tipo === "cierre" ? F.amplitudCierre ?? 0.03 : F.amplitud ?? 0.1;
    const recorte = Math.min(0.5, Math.max(0, F.recorteMaximo ?? 0.12));
    const caja = diseno ? diseno.caja : { x: 0, y: 0, w: ancho, h: alto };
    const fundidoE = esPrimera ? Math.min(0.01, H.fundidoEntrada ?? 0.04) : H.fundidoEntrada ?? 0.04; // el primero, sin fundido que se note
    const fundidoS = H.fundidoSalida ?? 0.1;
    const id = huella(VERSION, hilos, tipo, fuente, ancho, alto, fps, crf, preset, dura, audioDe, narracion && narracion.archivo, eventos ? ass : "", tipo === "generada" ? "" : [mov, amplitud, recorte, caja], audioDe === "silencio" ? "" : [inicio, ganancia, fundidoE, fundidoS]);
    const seg = `s-${id}.mp4`;

    const yaEsta = async () => fs.existsSync(enCarpeta(seg)) && Math.abs((await ff.duracion(seg, carpeta)) - dura) < 0.2;
    // Con cerrojo por segmento: si otro armado (una variación) ya lo está haciendo, se espera y se reutiliza.
    await conCerrojo(seg, async () => {
      if (await yaEsta()) {
        stats.segmentosReutilizados++;
        return;
      }
      await latir(`Escena ${escena.n}: preparando`);
      const entradas = [];
      const filtros = [];
      let video;
      if (tipo === "generada") {
        if (inicio > 0) entradas.push("-ss", String(inicio)); // se salta el silencio inicial (video y audio a la vez)
        entradas.push("-i", fuente);
        video = `[0:v]scale=${ancho}:${alto}:force_original_aspect_ratio=increase,crop=${ancho}:${alto},setsar=1,fps=${fps},tpad=stop_mode=clone:stop_duration=120`;
      } else {
        if (fuente) entradas.push("-i", fuente);
        else entradas.push("-f", "lavfi", "-i", `color=c=0x15171C:s=${ancho}x${alto}:r=1:d=1`);
        const n = Math.round(dura * fps) + 2;
        const m = movimiento(mov, n, amplitud);
        filtros.push(filtroLienzo({ W: ancho, H: alto, caja, ampliar: tipo === "cierre" ? 1 : redondo(1 / (1 - recorte), 4), oscurecer: tipo === "cierre" ? -0.2 : -0.06 }));
        video = `[lienzo]zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=${n}:s=${ancho}x${alto}:fps=${fps},setsar=1`;
      }
      if (eventos) {
        fs.writeFileSync(enCarpeta(`s-${id}.ass`), ass, "utf8");
        video += `,ass=s-${id}.ass`;
      }
      filtros.push(`${video},format=yuv420p[v]`);
      // Audio hablado: mismo volumen en todos los clips (ganancia fija + limitador) y fundidos cortos en los cortes.
      const nivel = `volume=${ganancia}dB,alimiter=limit=0.9:level=disabled`;
      const fundidos = `afade=t=in:st=0:d=${fundidoE},afade=t=out:st=${redondo(Math.max(0, dura - fundidoS), 3)}:d=${fundidoS}`;
      if (audioDe === "clip") {
        filtros.push(`[0:a]aresample=44100,aformat=channel_layouts=stereo,${nivel},${fundidos},apad[a]`);
      } else if (audioDe === "voz") {
        entradas.push("-i", narracion.archivo);
        filtros.push(`[1:a]aresample=44100,aformat=channel_layouts=stereo,${nivel},adelay=120:all=1,apad[a]`);
      } else {
        entradas.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
        filtros.push("[1:a]anull[a]");
      }
      const tmp = `tmp-${seg}`;
      await ff.ffmpeg(
        [
          ...entradas,
          "-filter_complex", filtros.join(";"),
          "-map", "[v]", "-map", "[a]", "-t", String(dura),
          "-c:v", "libx264", "-preset", preset, "-crf", String(crf), "-pix_fmt", "yuv420p", "-r", String(fps), "-g", String(fps * 2), "-video_track_timescale", "15360",
          "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2",
          ...BITEXACTO,
          tmp,
        ],
        carpeta,
      );
      fs.renameSync(enCarpeta(tmp), enCarpeta(seg));
      stats.segmentosHechos++;
    });
    usados.add(seg);
    if (eventos) usados.add(`s-${id}.ass`);
    if (fuente) usados.add(fuente);
    segmentos.push({ n: escena.n, archivo: seg, inicio: cursor, dura, audio: audioDe, recorteInicio: inicio, ganancia, subtitulo: tramo ? { desde: tramo.desde, dura: tramo.dura } : null });
    cursor += dura;
  }
  const total = redondo(cursor, 3);

  const lasEscenas = (l) => `${l.length === 1 ? "la escena" : "las escenas"} ${l.join(", ")}`;
  if (sinNarrar.length) avisos.push(`ElevenLabs no entregó la voz de ${lasEscenas(sinNarrar)}: ${sinNarrar.length === 1 ? "sale" : "salen"} sin voz.`);
  if (sinLocucion.length) avisos.push(`Sin voz en ${lasEscenas(sinLocucion)}: ${sinLocucion.length === 1 ? "es de" : "son de"} foto real y el audio de este video es el de los clips. ${sinLocucion.length === 1 ? "Lleva" : "Llevan"} subtítulos${pedidaMusicaAntes ? " y música" : ""}. Para narrarlas hace falta pedir la voz de ElevenLabs (y que el servidor tenga la clave).`);
  if (!algunaVoz && modo !== "ninguno" && escenas.some((e) => String(e.voz || "").trim())) avisos.unshift("OJO: este video salió SIN VOZ en todas sus escenas.");
  if (modo === "ninguno" && escenas.some((e) => String(e.voz || "").trim())) avisos.push(opciones.voz === false ? "Se pidió sin voz." : "Este formato está configurado sin audio.");
  if (!hayCierre && (cierre.oferta || cierre.llamadoALaAccion)) avisos.push("El proyecto no tiene escena de cierre: el rótulo con la oferta no se dibujó.");
  if (conSubtitulos && !escenas.some((e) => String(e.voz || "").trim())) avisos.push("Las escenas no traen frases habladas: el video sale sin subtítulos.");

  // ---------------------------------------------------- 2. música ----
  // Un enlace del trabajo, o la biblioteca local por tono (lib/musica.js). Sin pista: sin música y se avisa.
  let pista = null;
  let tonoMusica = "";
  const M = cfg.config.musica || {};
  const pedidaMusica = typeof opciones.musica === "string" ? opciones.musica : opciones.musica && opciones.musica.url;
  try {
    if (pedidaMusica) {
      await latir("Música");
      pista = await traer(carpeta, pedidaMusica, { prefijo: "m", ext: "mp3", stats, local, conCerrojo });
    } else if (opciones.musica !== false) {
      const e = await elegirPista({ cfg, registro, trabajo, duracion: total, latir, conCerrojo });
      if (e.aviso) avisos.push(e.aviso);
      if (e.archivo) {
        // Se copia a la caché con un nombre que cambia si cambia el archivo: ffmpeg trabaja ahí.
        const st = fs.statSync(e.archivo);
        const nombre = `m-${huella(e.archivo, st.size, Math.round(st.mtimeMs))}${path.extname(e.archivo).toLowerCase()}`;
        await conCerrojo(nombre, async () => {
          if (!fs.existsSync(enCarpeta(nombre))) fs.copyFileSync(e.archivo, enCarpeta(nombre));
        });
        pista = nombre;
        tonoMusica = e.tono || "";
      }
    }
    if (pista && (await ff.duracion(pista, carpeta)) <= 0.5) {
      fs.rmSync(enCarpeta(pista), { force: true });
      throw new Error("la pista no se pudo leer");
    }
  } catch (e) {
    // La música nunca tumba un video: sale sin ella y se dice.
    pista = null;
    avisos.push(`El video salió SIN música: ${registro.limpiar(e.message || String(e)).slice(0, 200)}.`);
  }
  // Nivel: la música se lleva a un volumen fijo por DEBAJO de la voz (y además baja sola mientras se habla).
  let gananciaMusica = 0;
  if (pista) {
    usados.add(pista);
    const mm = await ff.medirAudio(pista, carpeta);
    const objetivo = algunaVoz ? M.nivelBajoVozLufs ?? -30 : M.nivelSinVozLufs ?? -20;
    gananciaMusica = Number.isFinite(mm.lufs) && mm.lufs > -70 ? redondo(Math.max(-40, Math.min(20, objetivo - mm.lufs)), 1) : 0;
    if (opciones.musica && typeof opciones.musica.volumen === "number") gananciaMusica = redondo(gananciaMusica + 20 * Math.log10(Math.max(0.01, opciones.musica.volumen) / 0.22), 1);
  }
  const volumen = `${gananciaMusica}dB`;

  // ------------------------------------------------------ 3. unir ----
  const idFinal = huella(VERSION, hilos, segmentos.map((s) => s.archivo), pista, volumen, M.entradaSegundos, M.salidaSegundos, total);
  const final = `final-${idFinal}.mp4`;
  await conCerrojo(final, async () => {
    if (fs.existsSync(enCarpeta(final)) && Math.abs((await ff.duracion(final, carpeta)) - total) < 0.5) {
      stats.finalReutilizado = true;
      return;
    }
    await latir("Uniendo las escenas");
    const lista = `lista-${idFinal}.txt`;
    fs.writeFileSync(enCarpeta(lista), segmentos.map((s) => `file '${s.archivo}'`).join("\n") + "\n");
    const tmp = `tmp-${final}`;
    if (!pista) {
      await ff.ffmpeg(["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", "-movflags", "+faststart", ...BITEXACTO, tmp], carpeta);
    } else {
      const entra = M.entradaSegundos ?? 0.05; // entra en seco: el gancho va en el primer segundo
      const sale = Math.min(M.salidaSegundos ?? 1.2, total / 2);
      // La música baja sola mientras suena la voz (compresor con la voz como llave) y se apaga al final.
      const filtro =
        `[1:a]aresample=44100,aformat=channel_layouts=stereo,volume=${volumen},afade=t=in:st=0:d=${entra}[m0];` +
        `[0:a]asplit[voz][llave];` +
        `[m0][llave]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=450,afade=t=out:st=${redondo(total - sale, 3)}:d=${sale}[m];` +
        `[voz][m]amix=inputs=2:duration=first:normalize=0:dropout_transition=0[a]`;
      await ff.ffmpeg(
        ["-f", "concat", "-safe", "0", "-i", lista, "-stream_loop", "-1", "-i", pista, "-filter_complex", filtro, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2", "-t", String(total), "-movflags", "+faststart", ...BITEXACTO, tmp],
        carpeta,
      );
    }
    fs.renameSync(enCarpeta(tmp), enCarpeta(final));
    fs.rmSync(enCarpeta(lista), { force: true });
  });
  usados.add(final);
  const duracion = await ff.duracion(final, carpeta);
  if (duracion < 1) throw new Error("El armado no produjo un video válido.");

  // ------------------------------------------------- 4. marcar lo usado ----
  // La caché es de todos los proyectos: aquí solo se marca lo que se usó. Lo que lleve
  // semanas sin usarse lo borra la limpieza general (lib/proyecto.js → limpiarCache).
  const ahora = new Date();
  for (const f of usados) {
    try {
      fs.utimesSync(enCarpeta(f), ahora, ahora);
    } catch {
      /* no pasa nada */
    }
  }

  const segundos = redondo((Date.now() - t0) / 1000, 1);
  registro.info(
    `Armado de ${trabajo.guionId || trabajo.id}: ${segmentos.length} escenas, ${redondo(duracion, 1)} s de video en ${segundos} s · descargas ${stats.descargas} (ya en disco ${stats.reutilizados}) · escenas codificadas ${stats.segmentosHechos} (reutilizadas ${stats.segmentosReutilizados})${stats.finalReutilizado ? " · final sin cambios" : ""}${pista ? " · con música" : ""}`,
  );
  return { archivo: enCarpeta(final), duracion, sinVoz: !algunaVoz, avisos, stats, segundos, cierres, segmentos, modo, conMusica: !!pista, tonoMusica, sinAudio, sinLocucion };
}

module.exports = { armar, modoAudio, movimiento, filtroLienzo };
