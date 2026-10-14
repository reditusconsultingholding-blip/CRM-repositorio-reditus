"use strict";
// Etapa «armado» del proyecto por escenas. No cuesta: todo lo hace ffmpeg aquí.
//
//   1. Trae lo que falte (clips aprobados, fotos reales, música). Lo que ya está en
//      la caché (`datos/cache/`, COMPARTIDA por todos los proyectos) no se vuelve a bajar.
//   2. Cada escena se codifica UNA vez a su «segmento» final: mismo tamaño, fps y audio, con
//      sus subtítulos (en la plantilla del proyecto), su transición de entrada, su micro-zoom y,
//      en el cierre, la tarjeta con la oferta. El nombre del segmento es la huella de todo lo
//      que lo define: si nada de esa escena cambió, se reutiliza tal cual.
//   3. Los segmentos se unen sin recodificar. Con música, solo se recodifica el audio.
//
// Quién habla (lib/habla.js):
//   · «veo»         el propio clip. Se nivela, se le quitan los silencios largos y nunca se corta la frase.
//   · «elevenlabs»  narración (lib/voz.js): una sola voz para todo el video, con el tiempo real de
//                   cada palabra. La escena dura lo que dura su frase; el clip se acelera, se frena o se
//                   recorta para acompañarla, y su audio queda de ambiente, muy bajo.
//
// Cambiar un texto solo rehace la escena tocada, y armar dos veces el mismo proyecto da el mismo archivo.
const fs = require("fs");
const path = require("path");
const { tamano } = require("./ffmpeg");
const { subtitulosDeEscena, documentoAss, elegirEstilo, palabrasConTiempo, hexValido } = require("./subtitulos");
const { prepararCierre } = require("./rotulo");
const { huella, traer } = require("./proyecto");
const { ajustesParalelo, crearCerrojos } = require("./limites");
const voz = require("./voz");
const { decidirAudio, seHabla, vozDelTrabajo } = require("./habla");
const { elegirPista } = require("./musica");
const efectos = require("./efectos");
const captions = require("./captions");
const voces = require("./voces");
const { tituloDeEscena, elegirEstiloTitulos } = require("./titulos");
const lectura = require("./lectura");

// Si cambia la forma de codificar un segmento, se sube este número: invalida la caché.
const VERSION = 6;
const MOVIMIENTOS = ["acercar", "alejar", "paneo-izq", "paneo-der", "quieto"];
const redondo = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const BITEXACTO = ["-map_metadata", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact"];
const sinSignos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();

/** De dónde sale el audio según el trabajo: "veo" (el del clip), "elevenlabs" o "ninguno". */
function modoAudio(cfg, trabajo) {
  return decidirAudio(cfg, trabajo, voz.disponible(cfg)).modo; // la regla completa está en lib/habla.js
}

/** Expresiones de zoompan para cada movimiento de una foto. `n` = fotogramas, `a` = amplitud. */
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

/** Deja las tipografías del paquete dentro de la caché (ffmpeg trabaja ahí y las busca en `fuentes`). */
function asegurarFuentes(cfg, carpeta) {
  const origen = path.join(cfg.raiz, "fuentes");
  const destino = path.join(carpeta, "fuentes");
  if (!fs.existsSync(origen)) return;
  fs.mkdirSync(destino, { recursive: true });
  for (const f of fs.readdirSync(origen)) {
    if (!/\.(ttf|otf)$/i.test(f)) continue;
    const a = path.join(origen, f);
    const b = path.join(destino, f);
    try {
      if (!fs.existsSync(b) || fs.statSync(b).size !== fs.statSync(a).size) fs.copyFileSync(a, b);
    } catch {
      /* otro armado la está copiando a la vez: ya quedará */
    }
  }
}

/**
 * Arma el video final del proyecto.
 *   { cfg, ff, registro, trabajo, carpeta, latir }
 * Devuelve { archivo, duracion, sinVoz, avisos, stats, segundos, cierres, segmentos, … }.
 */
async function armar({ cfg, ff, registro, trabajo, carpeta, latir = async () => {}, conCerrojo = crearCerrojos(), _interno = {} }) {
  const t0 = Date.now();
  const hilos = ajustesParalelo(cfg).hilosFfmpeg; // el resultado de x264 depende del número de hilos: va en la huella
  const A = cfg.config.armado || {};
  const F = A.fotoReal || {};
  const H = A.habla || {};
  const D = A.dinamismo || {};
  const N = (cfg.config.voz || {}).narracion || {};
  const salida = cfg.config.salida || {};
  const fps = salida.fps || 30;
  const crf = salida.crf || 21;
  const preset = A.preset || "veryfast";
  const { ancho, alto } = tamano(trabajo.relacionAspecto, salida.ladoCorto);
  const base = Array.isArray(trabajo.todas) && trabajo.todas.length ? trabajo.todas : trabajo.escenas || [];
  if (!base.length) throw new Error("El trabajo de armado no trae escenas.");
  const contexto = trabajo.contexto || {};
  const cierre = { ...(trabajo.cierre && typeof trabajo.cierre === "object" ? trabajo.cierre : {}), ...(contexto.cierre || {}) };
  const opciones = trabajo.opciones || {};
  // Con narración, el audio del clip queda de ambiente muy bajo (−38 LUFS). Pero si el clip trae VOZ
  // (proyectos viejos con diálogo), a ese volumen se oye un murmullo debajo del narrador: se silencia.
  //   opciones.audioClip: "silencio" (siempre callado) | "ambiente" (siempre de fondo) | "auto" (lo normal)
  const audioClip = /^sil/i.test(String(opciones.audioClip || "")) ? "silencio" : /^amb/i.test(String(opciones.audioClip || "")) ? "ambiente" : N.silenciarClipConVoz === false ? "ambiente" : "auto";
  const clipsCallados = new Set();
  const ambienteSinVoz = async (n, fuente) => {
    if (audioClip === "ambiente") return true;
    if (audioClip === "silencio" || (await ff.detectarVoz(fuente, carpeta)).voz) {
      clipsCallados.add(n);
      return false;
    }
    return true;
  };
  const conSubtitulos = opciones.subtitulos !== false;
  // La plantilla y las transiciones salen del PRODUCTO (no del guion): así las variaciones de un proyecto
  // comparten estilo con el original y sus escenas iguales no se recodifican.
  const semilla = String(contexto.producto || (Array.isArray(contexto.fotos) && contexto.fotos[0]) || trabajo.guionId || trabajo.id || "");
  const estiloSub = elegirEstilo(opciones.estiloSubtitulos, semilla);
  const ritmo = efectos.normalizarRitmo(opciones.ritmo); // muy-rapido | rapido | medio | calmado | "" (automático)
  const marca = hexValido(cierre.color) ? cierre.color : "";
  // De dónde sale el audio: por defecto, el de los propios clips. ElevenLabs solo si el trabajo lo pide y hay clave.
  // Con narración pedida por el CRM (contexto.voz.motor: "narracion") los clips vienen SIN diálogo: sin clave
  // de ElevenLabs el video saldría mudo, así que el armado falla diciendo qué falta (acordado el 17-oct).
  const narracionPedida = vozDelTrabajo(trabajo).motor === "narracion" && opciones.voz !== false && opciones.voz !== "veo" && opciones.voz !== "clip";
  if (narracionPedida && !voz.disponible(cfg)) throw new Error("No se puede armar con narración: el servidor no tiene ELEVENLABS_API_KEY en su .env. Los clips de este proyecto se generaron sin diálogo, así que sin narración el video saldría mudo. Pon la clave en el servidor (o cambia el proyecto a «voz del clip» y regenera los clips) y vuelve a armar.");
  const decision = decidirAudio(cfg, trabajo, voz.disponible(cfg));
  const modo = decision.modo;
  const pedidaMusicaAntes = !!(typeof opciones.musica === "string" ? opciones.musica : opciones.musica && opciones.musica.url);
  const local = !!cfg.permitirHttpLocal; // solo las pruebas
  const stats = { descargas: 0, reutilizados: 0, segmentosHechos: 0, segmentosReutilizados: 0, vocesHechas: 0, caracteresVoz: 0, finalReutilizado: false };
  const avisos = [];
  if (decision.aviso) avisos.push(decision.aviso);
  // Subtítulos de Captions (opcional): el cuerpo del video se arma SIN subtítulos quemados y se manda a su API.
  const cap = conSubtitulos && !_interno.sinCaptions ? captions.pedido(cfg, trabajo) : null;
  let usarCaptions = false;
  if (cap) {
    if (!captions.disponible(cfg)) avisos.push("Se pidieron los subtítulos de Captions pero el servidor no tiene CAPTIONS_API_KEY: se usaron las plantillas propias.");
    else if (!(alto > ancho && Math.abs(ancho / alto - 9 / 16) < 0.01)) avisos.push("Captions solo subtitula videos verticales 9:16: se usaron las plantillas propias.");
    else usarCaptions = true;
  }
  if (_interno.avisoCaptions) avisos.push(_interno.avisoCaptions);
  const quemar = conSubtitulos && !usarCaptions;
  let ttsActivo = modo === "elevenlabs";
  // La voz: la que pida el proyecto, la fijada para el país, la del .env o, si no hay ninguna, la que se
  // elige sola según el país y el sexo (lib/voces.js). Con la clave basta.
  let vozElegida = null;
  if (ttsActivo) {
    try {
      vozElegida = await voces.vozDelProyecto(cfg, trabajo, registro);
    } catch (e) {
      const motivo = registro.limpiar(e.message || String(e)).slice(0, 220);
      if (narracionPedida) throw new Error(`No se puede armar con narración: no se pudo conseguir una voz de ElevenLabs. ${motivo}`);
      ttsActivo = false;
      avisos.push(`No se pudo conseguir una voz de ElevenLabs (${motivo}): el video sale sin narración.`);
    }
  }
  const estiloTit = elegirEstiloTitulos(opciones.estiloTitulos, estiloSub);
  const titulosDelCuerpo = []; // con Captions, los títulos de apoyo se pintan después, sobre el video ya subtitulado
  const sinNarrar = [];
  const sinLocucion = []; // escenas de foto con frase, cuando el audio es el de los clips
  const sinAudio = []; // clips con frase que llegaron sin audio o en silencio
  let sinTiempos = false; // la voz no devolvió el tiempo de cada palabra
  const usados = new Set();
  const enCarpeta = (f) => path.join(carpeta, f);
  const existe = (f) => fs.existsSync(enCarpeta(f)) && fs.statSync(enCarpeta(f)).size > 200;
  asegurarFuentes(cfg, carpeta);

  // ---- apertura: cortes muy rápidos (0,3–1,2 s) al inicio, sacados de clips que ya existen ----
  const escenas = [];
  let enApertura = 0;
  for (const [i, c] of (Array.isArray(trabajo.apertura) ? trabajo.apertura : []).entries()) {
    const de = base.find((e) => e && e.n === c.n && e.clip && e.clip.url && !["foto-real", "cierre"].includes(e.tipo));
    const desde = Math.max(0, Number(c.desde) || 0);
    const largo = Math.max(0.3, Math.min(1.2, (Number(c.hasta) || 0) - desde));
    if (!de || enApertura + largo > (D.aperturaMaxSegundos ?? 3) + 0.01) continue;
    enApertura += largo;
    escenas.push({ n: `apertura-${i + 1}`, tipo: "generada", clip: de.clip, voz: "", _corte: { desde, largo } });
  }
  if (Array.isArray(trabajo.apertura) && trabajo.apertura.length && !escenas.length) avisos.push("La apertura rápida no se armó: sus cortes no apuntan a clips del proyecto.");
  escenas.push(...base);

  /** Narración de ElevenLabs de una escena, guardada por su huella (un mismo texto no se paga dos veces). */
  async function narrar(n, texto, previo, siguiente) {
    if (!ttsActivo || !vozElegida) return null;
    const v = cfg.config.voz || {};
    const id = huella("voz-v2", texto, vozElegida.id, v.modelo, v.estabilidad, v.similitud, v.estilo, v.velocidad, vozElegida.pais); // sin las frases vecinas: cambiar una frase no obliga a pagar otra vez las de al lado
    const mp3 = `v-${id}.mp3`;
    const datos = `v-${id}.json`;
    try {
      await conCerrojo(mp3, async () => {
        if (existe(mp3) && fs.existsSync(enCarpeta(datos)) && (await ff.duracion(mp3, carpeta)) > 0.2) return;
        await latir(`Voz de la escena ${n}`);
        const r = await voz.narrar(cfg, { texto, previo, siguiente, vozId: vozElegida.id, pais: vozElegida.pais }, enCarpeta(`tmp-${mp3}`));
        fs.writeFileSync(enCarpeta(datos), JSON.stringify({ palabras: r.palabras, caracteres: r.caracteres }));
        fs.renameSync(enCarpeta(`tmp-${mp3}`), enCarpeta(mp3));
        stats.vocesHechas++;
        stats.caracteresVoz += r.caracteres || 0;
      });
      usados.add(mp3);
      usados.add(datos);
      const d = JSON.parse(fs.readFileSync(enCarpeta(datos), "utf8"));
      if (!d.palabras) sinTiempos = true;
      return { archivo: mp3, dura: await ff.duracion(mp3, carpeta), palabras: d.palabras || null };
    } catch (e) {
      if (!e.sinRemedio) throw e;
      // Clave inválida o sin saldo: reintentar no lo arregla. Con narración pedida por el CRM no se entrega
      // un video mudo: el armado falla con el motivo. En otro caso sigue sin voz y se avisa.
      if (narracionPedida) throw new Error(`No se puede armar con narración: ElevenLabs rechazó la petición (clave, saldo o voz). ${registro.limpiar(e.message).slice(0, 200)}`);
      ttsActivo = false;
      avisos.push(`ElevenLabs rechazó la petición (clave, saldo o voz): lo que falte por narrar sale sin voz. (${registro.limpiar(e.message).slice(0, 160)})`);
      return null;
    }
  }
  const dichos = escenas.map((e) => (seHabla(e) && !e._corte ? String(e.voz || "").trim() : ""));
  const vecino = (i, paso) => {
    for (let j = i + paso; j >= 0 && j < dichos.length; j += paso) if (dichos[j]) return dichos[j];
    return "";
  };

  // En «calmado» (marcas sobrias) no hay golpes de sonido.
  const fx = D.sonidos !== false && D.transiciones !== false && ritmo !== "calmado" ? await efectos.sonidos(ff, carpeta, conCerrojo, existe) : null;
  if (fx) for (const f of Object.values(fx)) usados.add(f);
  const antes = N.antes ?? 0.1; // respiro antes de la frase narrada
  const despues = N.despues ?? 0.22; // y después

  // ---------------------------------------------- 0. la música (antes) ----
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
      const e = await elegirPista({ cfg, registro, trabajo, duracion: base.reduce((a, e) => a + (Number(e.duracion) > 0 ? Number(e.duracion) : 5), 0), latir, conCerrojo });
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
  // Los golpes de la pista: los cortes entre escenas se llevan al golpe más cercano (±0,15 s) cuando se puede.
  let ritmoMusica = null;
  if (pista && D.cortesAlRitmo !== false && ritmo !== "calmado") {
    try {
      ritmoMusica = await efectos.golpesDeMusica(ff, pista, carpeta);
      if (ritmoMusica.golpes.length < 4) ritmoMusica = null; // sin pulso claro no se fuerza nada
    } catch {
      ritmoMusica = null;
    }
  }
  let cortesAlGolpe = 0;
  let ultimoEfecto = -Infinity; // segundo del video del último efecto de transición (tope de efectos por segundo)

  // ------------------------------------------------ 1. cada escena ----
  const segmentos = [];
  const cierres = [];
  const transiciones = [];
  let cursor = 0;
  let algunaVoz = false;
  let hayCierre = false;
  let ultimaGenerada = null; // { archivo, segundo }: de aquí sale el fondo del cierre si la foto es de fondo blanco
  let subtituloAnterior = "";
  for (const [indice, escena] of escenas.entries()) {
    const esPrimera = indice === 0;
    const tipo = ["foto-real", "cierre"].includes(escena.tipo) ? escena.tipo : "generada";
    const texto = String(escena.voz || "").trim(); // lo que va en los subtítulos
    const dicho = dichos[indice]; // lo que alguien dice (locucion «texto» o «sin-voz»: nadie habla)
    const pedida = Number(escena.duracion) > 0 ? Number(escena.duracion) : 0;
    let fuente = null;
    let audioDe = "silencio"; // de dónde sale lo que se oye en primer plano: clip | voz | silencio
    let ambiente = false; // el audio del clip suena bajito debajo de la narración
    let narracion = null;
    let dura;
    let inicio = 0; // desde qué segundo del clip se toma
    let velocidad = 1; // > 1 acelera el clip, < 1 lo frena (solo con narración)
    let habla = null; // { desde, hasta } de la frase dentro del segmento, si se pudo medir
    let medida = null; // volumen medido de lo que se oye en primer plano
    let medidaClip = null;
    let tramos = []; // apertura en cortes: los trozos del clip que se usan, pegados con corte seco

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
      // Apertura en cortes (lo que manda el CRM): de UN clip se usan solo los tramos de `cortes`.
      tramos = (Array.isArray(escena.cortes) ? escena.cortes : [])
        .map((c) => ({ desde: Math.max(0, Number(c && c.desde) || 0), hasta: Math.min(duraClip, Number(c && c.hasta) || 0) }))
        .filter((c) => c.hasta - c.desde >= 0.3)
        .map((c) => ({ desde: redondo(c.desde, 3), hasta: redondo(c.hasta, 3) }));
      if (Array.isArray(escena.cortes) && escena.cortes.length && !tramos.length) avisos.push(`Los cortes de la escena ${escena.n} no caben en su clip (${redondo(duraClip, 1)} s): se usó el clip entero.`);
      if (tramos.length && !escena._corte) {
        dura = tramos.reduce((a, c) => a + (c.hasta - c.desde), 0);
        if (modo === "veo") {
          const med = conAudio ? await ff.medirAudio(fuente, carpeta, { ruidoDb: H.ruidoDb, silencioMinimo: H.silencioMinimo }) : null;
          if (med && !med.mudo) {
            audioDe = "clip"; // el audio del clip, cortado igual que la imagen
            medida = med;
          } else if (dicho) {
            sinAudio.push(escena.n);
            avisos.push(`El clip de la escena ${escena.n} llegó ${conAudio ? "en silencio" : "sin audio"}: esa escena sale sin voz.`);
          }
        } else if (modo === "elevenlabs") {
          if (dicho) narracion = await narrar(escena.n, dicho, vecino(indice, -1), vecino(indice, 1));
          if (narracion) {
            audioDe = "voz";
            dura = Math.max(dura, antes + narracion.dura + despues); // si la frase es más larga que los cortes, se congela el último cuadro
          } else if (dicho) sinNarrar.push(escena.n);
          if (conAudio && N.ambiente !== false) {
            medidaClip = await ff.medirAudio(fuente, carpeta, { ruidoDb: H.ruidoDb, silencioMinimo: H.silencioMinimo });
            ambiente = !medidaClip.mudo && (await ambienteSinVoz(escena.n, fuente));
          }
        }
      } else if (escena._corte) {
        tramos = [];
        // Corte de la apertura: un trozo corto del clip, sin su audio (los golpes de sonido marcan el ritmo).
        inicio = Math.min(Math.max(0, duraClip - 0.3), escena._corte.desde);
        dura = Math.min(escena._corte.largo, duraClip - inicio);
      } else if (modo === "veo") {
        const med = conAudio ? await ff.medirAudio(fuente, carpeta, { ruidoDb: H.ruidoDb, silencioMinimo: H.silencioMinimo }) : null;
        if (med && !(dicho && med.mudo)) {
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
        } else if (dicho) {
          // Nunca un video mudo sin avisar.
          sinAudio.push(escena.n);
          avisos.push(`El clip de la escena ${escena.n} llegó ${conAudio ? "en silencio" : "sin audio"}: esa escena sale sin voz (con subtítulos si se pidieron). Vuelve a generar ese clip.`);
        }
      } else if (modo === "elevenlabs") {
        if (dicho) narracion = await narrar(escena.n, dicho, vecino(indice, -1), vecino(indice, 1));
        if (narracion) {
          audioDe = "voz";
          // La escena dura lo que dura su frase. El clip la acompaña: se acelera un poco si sobra,
          // se frena un poco si falta y, si aun así no alcanza, se congela su último cuadro.
          const objetivo = antes + narracion.dura + despues;
          velocidad = duraClip >= objetivo ? Math.min(N.velocidadMax ?? 1.2, duraClip / objetivo) : Math.max(1 / (N.lentoMax ?? 1.25), duraClip / objetivo);
          velocidad = redondo(velocidad, 3);
          dura = objetivo;
        } else if (dicho) sinNarrar.push(escena.n);
        // El audio del clip (sin diálogo: solo ambiente) queda de fondo, muy bajo.
        if (conAudio && N.ambiente !== false) {
          medidaClip = await ff.medirAudio(fuente, carpeta, { ruidoDb: H.ruidoDb, silencioMinimo: H.silencioMinimo });
          ambiente = !medidaClip.mudo && (await ambienteSinVoz(escena.n, fuente));
        }
      }
    } else {
      const url = escena.fotoUrl || (Array.isArray(contexto.fotos) ? contexto.fotos[0] : null);
      if (url) {
        await latir(`Escena ${escena.n}: foto real`);
        fuente = await traer(carpeta, url, { prefijo: "f", ext: "jpg", stats, local, conCerrojo });
      } else if (tipo === "foto-real") {
        throw new Error(`No se puede armar: la escena ${escena.n} es de foto real y no trae foto (fotoUrl).`);
      }
      dura = Math.max(pedida || 4, tipo === "cierre" ? A.cierreMinSegundos || 5 : 0);
      if (dicho && modo === "elevenlabs") {
        narracion = await narrar(escena.n, dicho, vecino(indice, -1), vecino(indice, 1));
        if (narracion) {
          audioDe = "voz";
          // Una foto dura lo que su frase (no hace falta que se quede quieta de más); el cierre conserva su mínimo.
          dura = tipo === "cierre" ? Math.max(dura, antes + narracion.dura + despues) : Math.max(1.2, antes + narracion.dura + despues);
        } else sinNarrar.push(escena.n);
      } else if (dicho && modo === "veo") {
        sinLocucion.push(escena.n); // una foto no habla: solo lleva subtítulos (y música, si hay)
      }
    }
    // Corte al ritmo de la música: si hay un golpe a ±0,15 s del final de esta escena, el corte se lleva ahí.
    // Nunca se acorta por debajo de la frase (ni de la narración), y la última escena y el cierre no se tocan.
    if (ritmoMusica && indice < escenas.length - 1 && tipo !== "cierre") {
      const g = efectos.golpeCercano(ritmoMusica, cursor + dura, D.margenGolpe ?? 0.15);
      const minimo = narracion ? antes + narracion.dura + 0.06 : habla ? habla.hasta + 0.1 : audioDe === "clip" && dicho ? dura : 0.4;
      if (g !== null && g - cursor >= Math.max(0.4, minimo)) {
        dura = g - cursor;
        cortesAlGolpe++;
      }
    }
    // Un clip sin frase puede ser un corte muy corto (apertura mandada como escenas): desde 0,4 s. Con frase, mínimo 1 s.
    dura = Math.max(escena._corte ? 0.3 : tipo === "generada" && !dicho ? 0.4 : 1, Math.round(dura * fps) / fps);
    inicio = redondo(inicio, 3);
    if (audioDe !== "silencio") algunaVoz = true;
    if (narracion) medida = await ff.medirAudio(narracion.archivo, carpeta, { ruidoDb: H.ruidoDb, silencioMinimo: H.silencioMinimo });
    // Nivelación: una ganancia fija hacia el mismo volumen objetivo (sin compresión que «bombee»).
    const haciaLufs = (m, objetivo, tope) => (m && Number.isFinite(m.lufs) && m.lufs > -60 ? redondo(Math.max(-tope, Math.min(tope, objetivo - m.lufs)), 1) : 0);
    let ganancia = haciaLufs(medida, H.objetivoLufs ?? -16, H.gananciaMaxDb ?? 12);
    if (audioDe === "clip" && !dicho) ganancia = Math.min(0, ganancia); // un clip donde nadie habla (solo ambiente) nunca se sube
    const gananciaAmbiente = ambiente ? haciaLufs(medidaClip, N.ambienteLufs ?? -38, 30) : 0;

    // ---- transición con la que entra esta escena, y con la que entrará la siguiente ----
    const sig = escenas[indice + 1];
    const tipoDe = (e) => (e && ["foto-real", "cierre"].includes(e.tipo) ? e.tipo : "generada");
    const comun = { ritmo, semilla, activas: D.transiciones !== false };
    const transicion = efectos.elegirTransicion({ ...comun, indice, inicio: cursor, pedida: escena.transicion, tipo, desdeUltimo: cursor - ultimoEfecto });
    if (transicion !== "corte") ultimoEfecto = cursor;
    const transicionSiguiente = sig ? efectos.elegirTransicion({ ...comun, indice: indice + 1, inicio: cursor + dura, pedida: sig.transicion, tipo: tipoDe(sig), desdeUltimo: cursor + dura - ultimoEfecto }) : "corte";
    transiciones.push(transicion);
    const ritmoAqui = efectos.ritmoEn(ritmo, cursor);
    const fuerza = efectos.INTENSIDAD[ritmoAqui];
    // Acelerón al entrar (y al salir en «muy-rapido»). Nunca sobre un clip que habla (se desincronizarían los labios).
    const ramp = tipo === "generada" && !tramos.length && !escena._corte && !(audioDe === "clip" && dicho) && transicion !== "corte" && D.acelerones !== false ? efectos.aceleron(ritmoAqui, dura) : { filtro: "" };

    // ---- subtítulos de esta escena (tiempos desde el inicio de SU segmento) ----
    let palabras = [];
    // En el cierre no se quema subtítulo (la tarjeta ya lo dice). Tampoco se repite el de la escena anterior.
    if (texto && quemar && tipo !== "cierre" && !escena._corte && sinSignos(texto) !== subtituloAnterior) {
      if (narracion && narracion.palabras) palabras = narracion.palabras.map((p) => ({ texto: p.texto, inicio: p.inicio + antes, fin: p.fin + antes }));
      else if (narracion) palabras = palabrasConTiempo(texto, antes, narracion.dura);
      else if (dicho && habla && habla.hasta - habla.desde > 0.4) palabras = palabrasConTiempo(texto, habla.desde, Math.min(dura - habla.desde - 0.05, habla.hasta - habla.desde));
      else {
        const n = texto.split(/\s+/).length;
        const desde = audioDe === "clip" ? 0.3 : 0.12;
        palabras = palabrasConTiempo(texto, desde, Math.max(0.3, Math.min(dura - (audioDe === "clip" ? 0.8 : 0.4), Math.max(1.2, n * 0.42))));
      }
      subtituloAnterior = sinSignos(texto);
    } else if (tipo !== "cierre") subtituloAnterior = "";
    const sub = palabras.length ? subtitulosDeEscena({ estilo: estiloSub, palabras, ancho, alto, marca, enfasis: escena.enfasis, hasta: dura }) : null;

    // ---- tarjeta de cierre ----
    let tarjeta = null;
    if (tipo === "cierre") {
      hayCierre = true;
      tarjeta = await prepararCierre({ ff, carpeta, conCerrojo, ancho, alto, fps, dura, foto: fuente, previa: ultimaGenerada, cierre });
      for (const a of tarjeta.avisos) if (!avisos.includes(a)) avisos.push(a);
      for (const f of tarjeta.usados) usados.add(f);
      cierres.push({ n: escena.n, inicio: cursor, dura, zonas: tarjeta.zonas, fondo: tarjeta.fondoDe });
    }
    // ---- título de apoyo (frase corta con lo importante, arriba; NO es el subtítulo) ----
    // No va en la tarjeta de cierre ni en los cortes de la apertura. Con Captions se pinta después.
    let titulo = null;
    if (tipo !== "cierre" && !escena._corte && opciones.titulos !== false) {
      titulo = await tituloDeEscena({ ff, carpeta, escena, dura, ancho, alto, marca, estilo: estiloTit });
      if (titulo && usarCaptions) titulosDelCuerpo.push({ escena, dura, inicio: cursor });
    }
    const pintarTitulo = titulo && !usarCaptions;
    const estilosAss = tarjeta ? tarjeta.estilos : [...(sub ? sub.estilos : []), ...(pintarTitulo ? titulo.estilos : [])];
    const eventosAss = tarjeta ? tarjeta.eventos : [...(sub ? sub.eventos : []), ...(pintarTitulo ? titulo.eventos : [])];
    const ass = eventosAss.length ? documentoAss({ ancho, alto, estilos: estilosAss, eventos: eventosAss }) : "";

    const mov = MOVIMIENTOS.includes(escena.movimiento) ? escena.movimiento : F.movimientoPorDefecto || "acercar";
    const amplitud = redondo((F.amplitud ?? 0.1) * (ritmo === "rapido" ? 1.5 : ritmo === "calmado" ? 0.6 : 1), 3); // en «rapido» ninguna foto queda casi quieta
    const recorte = Math.min(0.5, Math.max(0, F.recorteMaximo ?? 0.12));
    const microZoom = tipo === "generada" ? redondo(Math.max(0, Math.min(0.12, D.microZoom ?? 0.04)) * (ritmo === "calmado" ? 0.5 : 1), 3) : 0;
    const fundidoE = esPrimera ? Math.min(0.01, H.fundidoEntrada ?? 0.04) : H.fundidoEntrada ?? 0.04; // el primero, sin fundido que se note
    const fundidoS = H.fundidoSalida ?? 0.1;
    // Golpes visuales dentro de la toma (acercamientos bruscos que se mantienen): los que mande el CRM y, en
    // «muy-rapido», uno cada ~1,5 s si no manda. No en la apertura en cortes ni en el cierre.
    const gv = tipo !== "cierre" && !tramos.length && !escena._corte && D.golpesVisuales !== false
      ? efectos.golpesVisuales(escena.golpesVisuales, { dura, H: alto, fps, fuerza: redondo(Math.min(0.18, 0.15 * Math.max(0.8, fuerza)), 3), cadaSiFaltan: ritmo === "muy-rapido" && dura >= 3 ? 1.5 : 0 })
      : { marcas: [], zoom: "", dy: "" };
    const golpe = fx && transicion !== "corte" ? fx[efectos.SONIDO[transicion]] : null;
    const previoSeg = (transicion === "deslizar" || transicion === "fundido") && segmentos.length ? segmentos[segmentos.length - 1] : null;
    const id = huella(
      VERSION, hilos, tipo, fuente, ancho, alto, fps, crf, preset, dura, audioDe, narracion && narracion.archivo, ass,
      tipo === "foto-real" ? [mov, amplitud, recorte] : "", tarjeta ? tarjeta.firma : "",
      [inicio, velocidad, ganancia, ambiente, gananciaAmbiente, fundidoE, fundidoS, antes, microZoom, indice % 2, tramos],
      ["fx2", transicion, transicionSiguiente === "barrido" ? "sale-barrido" : "", golpe, D.efectosDb ?? -14, previoSeg && previoSeg.archivo, transicion !== "corte" || transicionSiguiente === "barrido" ? fuerza : 0, ramp.filtro, transicion === "flash" ? marca : "", gv.zoom, gv.dy],
    );
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
      let nEntradas = 0;
      const agregar = (...args) => (entradas.push(...args), nEntradas++);
      const filtros = [];
      let cortarAudio = "";
      const fxEntrada = efectos.entrada(transicion, { W: ancho, i: fuerza, marca: String(marca).replace("#", "") });
      let video;
      if (tipo === "generada") {
        if (inicio > 0) entradas.push("-ss", String(inicio)); // se salta el silencio inicial (video y audio a la vez)
        agregar("-i", fuente);
        // Con cortes: solo esos tramos del clip, pegados en seco (imagen y sonido se cortan igual).
        const elige = tramos.map((c) => `gte(t,${c.desde})*lt(t,${c.hasta})`).join("+");
        if (tramos.length) cortarAudio = `aselect='${elige}',asetpts=N/SR/TB,`;
        video = `[0:v]${tramos.length ? `select='${elige}',setpts=N/FRAME_RATE/TB,` : ""}${velocidad !== 1 ? `setpts=PTS/${velocidad},` : ""}${ramp.filtro}scale=${ancho}:${alto}:force_original_aspect_ratio=increase,crop=${ancho}:${alto},setsar=1,fps=${fps},tpad=stop_mode=clone:stop_duration=120`;
      } else if (tipo === "foto-real") {
        agregar("-i", fuente);
        const n = Math.round(dura * fps) + 2;
        const m = movimiento(mov, n, amplitud);
        filtros.push(filtroLienzo({ W: ancho, H: alto, caja: { x: 0, y: 0, w: ancho, h: alto }, ampliar: redondo(1 / (1 - recorte), 4), oscurecer: -0.06 }));
        video = `[lienzo]zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=${n}:s=${ancho}x${alto}:fps=${fps},setsar=1`;
      } else {
        entradas.push(...tarjeta.entradas);
        nEntradas += tarjeta.nEntradas;
        // Con fundido pedido por el CRM, la tarjeta aparece sobre el último cuadro de la escena anterior (no desde negro).
        filtros.push(...(transicion === "fundido" ? tarjeta.filtros.map((f) => f.replace(",fade=t=in:st=0:d=0.3[cfondo]", "[cfondo]")) : tarjeta.filtros));
        video = "[base]null";
      }
      // Micro-zoom (para que ningún clip quede quieto) + el golpe de zoom de la transición, en un solo reencuadre.
      const partesZoom = [];
      // (el tiempo se topa en la duración: pasado el final el zoom no debe bajar de 100 %)
      if (microZoom) partesZoom.push(indice % 2 === 0 ? `${microZoom}*min(t/${dura},1)` : `${microZoom}*(1-min(t/${dura},1))`);
      if (fxEntrada.zoomExtra) partesZoom.push(fxEntrada.zoomExtra);
      if (gv.zoom) partesZoom.push(gv.zoom);
      if (partesZoom.length) {
        const Z = `max(1,1+${partesZoom.join("+")})`; // nunca por debajo de 100 %: el recorte no puede salirse del cuadro
        // El encuadre puede correrse unos píxeles (sacudida al impacto, entrada de lado): el zoom deja el margen.
        video += `,scale=w='2*trunc(${ancho}*${Z}/2)':h='2*trunc(${alto}*${Z}/2)':eval=frame,crop=${ancho}:${alto}:'(iw-${ancho})/2${fxEntrada.dx ? `+(${fxEntrada.dx})` : ""}':'(ih-${alto})/2${fxEntrada.dy ? `+(${fxEntrada.dy})` : ""}${gv.dy ? `+(${gv.dy})` : ""}'`;
      }
      video += fxEntrada.cadena + efectos.salida(transicionSiguiente, { W: ancho, dura, i: fuerza });
      if (previoSeg) {
        // Deslizar: la escena nueva entra de derecha a izquierda sobre el último cuadro de la anterior.
        const cuadro = `u-${huella(previoSeg.archivo)}.jpg`;
        if (!existe(cuadro)) await ff.ffmpeg(["-sseof", "-0.08", "-i", previoSeg.archivo, "-frames:v", "1", "-q:v", "2", "-update", "1", cuadro], carpeta);
        const k = agregar("-loop", "1", "-framerate", String(fps), "-t", String(dura + 0.5), "-i", cuadro);
        if (transicion === "fundido") filtros.push(`${video},format=yuva420p,fade=t=in:st=0:d=${efectos.DURA.fundido}:alpha=1[entra];[${k}:v]fps=${fps},scale=${ancho}:${alto},setsar=1[queda];[queda][entra]overlay=format=auto[cuadro]`);
        else filtros.push(`${video}[entra];[${k}:v]fps=${fps},scale=${ancho}:${alto},setsar=1[queda];[queda][entra]overlay=x='${ancho}*pow(max(0,1-t/${efectos.DURA.deslizar}),3)':y=0:eval=frame[cuadro]`);
        video = "[cuadro]null";
      }
      if (ass) {
        fs.writeFileSync(enCarpeta(`s-${id}.ass`), ass, "utf8");
        video += `,ass=s-${id}.ass:fontsdir=fuentes`;
      }
      filtros.push(`${video},format=yuv420p[v]`);

      // ---- audio: lo que se oye en primer plano + ambiente + golpe de la transición ----
      const pistas = [];
      const nivel = (g) => `volume=${g}dB,alimiter=limit=0.9:level=disabled`;
      const fundidos = `afade=t=in:st=0:d=${fundidoE},afade=t=out:st=${redondo(Math.max(0, dura - fundidoS), 3)}:d=${fundidoS}`;
      const estereo = "aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo";
      if (audioDe === "clip") {
        filtros.push(`[0:a]${cortarAudio}${estereo},${nivel(ganancia)},${fundidos},apad[a0]`);
        pistas.push("[a0]");
      } else if (audioDe === "voz") {
        const k = agregar("-i", narracion.archivo);
        filtros.push(`[${k}:a]${estereo},${nivel(ganancia)},adelay=${Math.round(antes * 1000)}:all=1,apad[a0]`);
        pistas.push("[a0]");
      }
      if (ambiente) {
        // El sonido del clip, al ritmo al que quedó el video, muy por debajo de la narración.
        filtros.push(`[0:a]${cortarAudio}${velocidad !== 1 ? `atempo=${velocidad},` : ""}${estereo},volume=${gananciaAmbiente}dB,${fundidos},apad[amb]`);
        pistas.push("[amb]");
      }
      if (golpe) {
        const k = agregar("-i", golpe);
        filtros.push(`[${k}:a]${estereo},volume=${D.efectosDb ?? -14}dB,apad[fx]`);
        pistas.push("[fx]");
      }
      if (!pistas.length) {
        const k = agregar("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
        filtros.push(`[${k}:a]anull[a]`);
      } else if (pistas.length === 1) filtros.push(`${pistas[0]}anull[a]`);
      else filtros.push(`${pistas.join("")}amix=inputs=${pistas.length}:duration=longest:normalize=0:dropout_transition=0[a]`);

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
    if (ass) usados.add(`s-${id}.ass`);
    if (fuente) usados.add(fuente);
    if (tipo === "generada" && !escena._corte) ultimaGenerada = { archivo: fuente, segundo: tramos.length ? redondo(Math.max(0, tramos[tramos.length - 1].hasta - 0.12), 2) : redondo(Math.max(0, inicio + Math.min(dura * velocidad, (await ff.duracion(fuente, carpeta)) - inicio) - 0.12), 2) };
    segmentos.push({
      n: escena.n, tipo, archivo: seg, inicio: cursor, dura, golpesVisuales: gv.marcas, audio: audioDe, recorteInicio: inicio, ganancia, velocidad, transicion, cortes: tramos.length,
      titulo: titulo ? { texto: titulo.texto, desde: titulo.desde, hasta: titulo.hasta, zona: titulo.zona, renglones: titulo.renglones } : null,
      subtitulo: palabras.length ? { desde: redondo(palabras[0].inicio, 2), dura: redondo(palabras[palabras.length - 1].fin - palabras[0].inicio, 2), zona: sub.zona, palabras: palabras.length } : null,
    });
    cursor += dura;
  }
  const total = redondo(cursor, 3);

  const lasEscenas = (l) => `${l.length === 1 ? "la escena" : "las escenas"} ${l.join(", ")}`;
  if (sinNarrar.length) avisos.push(`ElevenLabs no entregó la voz de ${lasEscenas(sinNarrar)}: ${sinNarrar.length === 1 ? "sale" : "salen"} sin voz.`);
  if (sinLocucion.length) avisos.push(`Sin voz en ${lasEscenas(sinLocucion)}: ${sinLocucion.length === 1 ? "es de" : "son de"} foto real y el audio de este video es el de los clips. ${sinLocucion.length === 1 ? "Lleva" : "Llevan"} subtítulos${pedidaMusicaAntes ? " y música" : ""}. Para narrarlas hace falta pedir la narración (y que el servidor tenga la clave de ElevenLabs).`);
  if (!algunaVoz && modo !== "ninguno" && escenas.some((e) => String(e.voz || "").trim())) avisos.unshift("OJO: este video salió SIN VOZ en todas sus escenas.");
  if (modo === "ninguno" && escenas.some((e) => String(e.voz || "").trim())) avisos.push(opciones.voz === false ? "Se pidió sin voz." : "Este formato está configurado sin audio.");
  if (!hayCierre && (cierre.oferta || cierre.llamadoALaAccion || cierre.titular)) avisos.push("El proyecto no tiene escena de cierre: la tarjeta con la oferta no se dibujó.");
  if (clipsCallados.size) avisos.push(audioClip === "silencio" ? "Audio de los clips en silencio (opciones.audioClip): solo se oye la narración y la música." : `${clipsCallados.size === 1 ? "El clip de la escena" : "Los clips de las escenas"} ${[...clipsCallados].sort((x, y) => x - y).join(", ")} ${clipsCallados.size === 1 ? "traía" : "traían"} voz: se dejó en silencio para que no se oiga un murmullo debajo de la narración.`);
  if (conSubtitulos && !escenas.some((e) => String(e.voz || "").trim())) avisos.push("Las escenas no traen frases habladas: el video sale sin subtítulos.");
  if (modo === "elevenlabs" && vozElegida) avisos.push(`Voz: ${vozElegida.nombre || vozElegida.id} · ${vozElegida.acento} (ElevenLabs, ${vozElegida.origen})`, `Narración de ElevenLabs${stats.caracteresVoz ? `: ${stats.caracteresVoz} caracteres nuevos` : " (ya estaba hecha: no se cobró de nuevo)"}.`);
  if (sinTiempos) avisos.push("La voz no devolvió el tiempo de cada palabra: los subtítulos van con tiempos estimados.");

  // ---------------------------------------------------- 2. música: nivel ----
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

  // -------------------------------------- 2b. subtítulos de Captions ----
  let piezas = segmentos.map((x) => x.archivo);
  let infoCaptions = null;
  let transcripcionCaptions = _interno.transcripcionCaptions || null;
  if (usarCaptions && segmentos.some((x) => x.tipo !== "cierre")) {
    try {
      const C = cfg.config.captions || {};
      // El cuerpo = todo menos el cierre del final: la tarjeta se pega DESPUÉS, sin subtítulos encima.
      let nCola = 0;
      while (nCola < segmentos.length - 1 && segmentos[segmentos.length - 1 - nCola].tipo === "cierre") nCola++;
      const cuerpo = segmentos.slice(0, segmentos.length - nCola);
      const cola = segmentos.slice(segmentos.length - nCola);
      const plantilla = await captions.resolverPlantilla(cfg, cap.plantilla);
      const idCap = huella("captions-v2", cuerpo.map((x) => x.archivo), plantilla.id, ancho, alto, fps, crf, estiloTit, titulosDelCuerpo.map((t) => [t.escena.tituloApoyo, t.inicio, t.dura]));
      // Lo que devuelve Captions se guarda aparte (sin títulos): cambiar un título de apoyo NO manda ni paga de nuevo.
      const idEnvio = huella("captions-envio", cuerpo.map((x) => x.archivo), plantilla.id);
      const crudo = `capx-${idEnvio}.mp4`;
      const listo = `cap-${idCap}.mp4`;
      const duraCuerpo = cuerpo.reduce((a, x) => a + x.dura, 0);
      await conCerrojo(listo, async () => {
        if (existe(listo) && Math.abs((await ff.duracion(listo, carpeta)) - duraCuerpo) < 0.6) return;
        await latir("Subtítulos en Captions");
        const sinSub = `tmp-cuerpo-${idCap}.mp4`;
        const memo = `capx-${idEnvio}.json`;
        try {
          fs.writeFileSync(enCarpeta(`lista-${idCap}.txt`), cuerpo.map((x) => `file '${x.archivo}'`).join("\n") + "\n");
          await ff.ffmpeg(["-f", "concat", "-safe", "0", "-i", `lista-${idCap}.txt`, "-c", "copy", "-movflags", "+faststart", ...BITEXACTO, sinSub], carpeta);
          const tope = (C.maxMb || 50) * 1048576;
          if (fs.statSync(enCarpeta(sinSub)).size > tope * 0.97) {
            // Pasa de 50 MB: se comprime a un peso que quepa antes de mandarlo.
            const kbps = Math.max(600, Math.floor((tope * 0.9 * 8) / duraCuerpo / 1000) - 128);
            await ff.ffmpeg(["-i", sinSub, "-c:v", "libx264", "-preset", "veryfast", "-b:v", `${kbps}k`, "-maxrate", `${kbps}k`, "-bufsize", `${kbps * 2}k`, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", `tmp-chico-${idCap}.mp4`], carpeta);
            fs.renameSync(enCarpeta(`tmp-chico-${idCap}.mp4`), enCarpeta(sinSub));
            if (fs.statSync(enCarpeta(sinSub)).size > tope) throw new Error(`el video pesa más de ${C.maxMb || 50} MB aun comprimido`);
          }
          let memoria = null;
          try {
            memoria = JSON.parse(fs.readFileSync(enCarpeta(memo), "utf8"));
          } catch {
            /* primera vez */
          }
          const yaSubtitulado = existe(crudo) && Math.abs((await ff.duracion(crudo, carpeta)) - duraCuerpo) < 0.6;
          const rc = yaSubtitulado ? { id: null, costo: null, yaEstaba: true, segundos: null } : await captions.subtitular({ cfg, registro, archivo: enCarpeta(sinSub), plantillaId: plantilla.id, destino: enCarpeta(`tmp-${crudo}`), memoria, recordar: (m) => (m ? fs.writeFileSync(enCarpeta(memo), JSON.stringify(m)) : fs.rmSync(enCarpeta(memo), { force: true })), latir });
          if (!yaSubtitulado) fs.renameSync(enCarpeta(`tmp-${crudo}`), enCarpeta(crudo));
          // Los títulos de apoyo se pintan AQUÍ, por nuestro lado, encima de lo que devolvió Captions.
          let pintar = "";
          if (titulosDelCuerpo.length) {
            const partes = [];
            for (const t of titulosDelCuerpo) partes.push(await tituloDeEscena({ ff, carpeta, escena: t.escena, dura: t.dura, ancho, alto, marca, estilo: estiloTit, desfase: t.inicio }));
            const hay = partes.filter(Boolean);
            if (hay.length) {
              fs.writeFileSync(enCarpeta(`cap-${idCap}.ass`), documentoAss({ ancho, alto, estilos: hay[0].estilos, eventos: hay.flatMap((p) => p.eventos) }), "utf8");
              pintar = `,ass=cap-${idCap}.ass:fontsdir=fuentes`;
            }
          }
          // Lo que devuelve se lleva al mismo formato de las demás piezas, para poder pegarle el cierre sin recodificar.
          await ff.ffmpeg(
            ["-i", crudo, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-filter_complex", `[0:v]scale=${ancho}:${alto}:force_original_aspect_ratio=increase,crop=${ancho}:${alto},setsar=1,fps=${fps}${pintar},format=yuv420p[v]`, "-map", "[v]", "-map", (await ff.tieneAudio(crudo, carpeta)) ? "0:a" : "1:a", "-t", String(duraCuerpo),
              "-c:v", "libx264", "-preset", preset, "-crf", String(crf), "-pix_fmt", "yuv420p", "-r", String(fps), "-g", String(fps * 2), "-video_track_timescale", "15360", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2", ...BITEXACTO, `tmp-${listo}`],
            carpeta,
          );
          if (Math.abs((await ff.duracion(`tmp-${listo}`, carpeta)) - duraCuerpo) > 0.6) throw new Error("el video que devolvió Captions no dura lo mismo que el que se mandó");
          fs.renameSync(enCarpeta(`tmp-${listo}`), enCarpeta(listo));
          infoCaptions = { plantilla: plantilla.nombre, plantillaId: plantilla.id, trabajo: rc.id, costo: rc.costo, yaEstaba: !!rc.yaEstaba, segundos: rc.segundos };
        } finally {
          for (const f of [sinSub, `tmp-${crudo}`, `lista-${idCap}.txt`, `tmp-${listo}`]) fs.rmSync(enCarpeta(f), { force: true });
        }
      });
      usados.add(listo);
      if (existe(crudo)) usados.add(crudo);
      if (!infoCaptions) infoCaptions = { plantilla: plantilla.nombre, plantillaId: plantilla.id, trabajo: null, costo: null, yaEstaba: true, segundos: null };
      // ¿Escribió bien la marca? Su API no acepta vocabulario ni devuelve el texto: se LEE el video (lib/lectura.js).
      const dichoDe = (s) => (s.tipo === "cierre" || String(s.n).startsWith("apertura-") ? "" : String((escenas.find((e) => e.n === s.n) || {}).voz || ""));
      const guion = cuerpo.map(dichoDe).join(" ");
      const nombres = [contexto.producto, contexto.marca, contexto.nombreMarca, trabajo.producto, (contexto.cliente && contexto.cliente.marca) || ""].filter((x) => typeof x === "string" && x.trim());
      const palabras = lectura.palabrasDeMarca(nombres, guion);
      const memoLectura = `capx-${idEnvio}-${huella("lectura-v1", palabras, guion)}.lectura.json`;
      if (C.revisarMarca !== false) {
        let lec = null;
        try {
          lec = JSON.parse(fs.readFileSync(enCarpeta(memoLectura), "utf8"));
        } catch {
          /* todavía no se ha leído */
        }
        if (!lec && existe(crudo)) {
          // Cada 0,25 s en las escenas donde se dice la marca; cada segundo en el resto (para la lectura del CRM).
          const momentos = [];
          for (const s of cuerpo) {
            const conMarca = palabras.length && lectura.palabrasDeMarca(nombres, dichoDe(s)).length;
            const paso = conMarca ? 0.25 : 1;
            for (let t = s.inicio + Math.min(0.12, s.dura / 4); t < s.inicio + s.dura - 0.05; t += paso) momentos.push(redondo(t, 2));
          }
          await latir("Revisando lo que escribió Captions");
          try {
            const leido = await lectura.leerVideo({ ff, carpeta, video: crudo, momentos, base: `lec-${idEnvio}` });
            const marcas = palabras.length ? lectura.revisarMarcas(leido.lecturas, palabras, guion) : [];
            lec = { transcripcion: leido.transcripcion, marcas, leidas: momentos.length };
          } catch (e) {
            lec = { transcripcion: null, marcas: [], sinOcr: true, motivo: registro.limpiar(e.message || String(e)).slice(0, 160) };
          }
          fs.writeFileSync(enCarpeta(memoLectura), JSON.stringify(lec));
        }
        if (lec) {
          usados.add(memoLectura);
          transcripcionCaptions = lec.transcripcion || null;
          const malas = (lec.marcas || []).filter((m) => m.malEscrita);
          if (malas.length && C.respaldoSiMarcaMal !== false) {
            const como = malas.map((m) => `«${Object.keys(m.mal).sort((a, b) => m.mal[b] - m.mal[a])[0]}» en vez de «${m.palabra}»`).join(", ");
            throw Object.assign(new Error(`Captions escribió mal la marca (${como})`), { marcaMal: como, transcripcionCaptions });
          }
          if (lec.sinOcr) avisos.push(`No se pudo comprobar cómo escribió Captions la marca (${lec.motivo || "sin OCR en este equipo"}).`);
          else if ((lec.marcas || []).length) avisos.push(`Captions escribió bien la marca (${lec.marcas.map((m) => m.palabra).join(", ")}).`);
        }
      }
      piezas = [listo, ...cola.map((x) => x.archivo)];
      avisos.push(`Subtítulos hechos por Captions, plantilla «${plantilla.nombre}»${infoCaptions.yaEstaba ? " (ya estaban: no se mandó de nuevo)" : infoCaptions.segundos !== null ? ` (tardó ${Math.round(infoCaptions.segundos)} s)` : ""}${infoCaptions.costo !== null ? ` · costo informado: ${infoCaptions.costo}` : ""}.`);
    } catch (e) {
      // Respaldo: se arma otra vez con las plantillas propias. Lo ya hecho (voz, clips, cierre) se reutiliza.
      const motivo = registro.limpiar(e.message || String(e)).slice(0, 220);
      registro.aviso(`captions: no se pudo (${motivo}); se arma con las plantillas propias`);
      const avisoCaptions = e.marcaMal ? `Captions escribió mal la marca (${e.marcaMal}): se usaron los subtítulos propios.` : `Los subtítulos de Captions no se pudieron hacer (${motivo}): se usaron las plantillas propias.`;
      return armar({ cfg, ff, registro, trabajo, carpeta, latir, conCerrojo, _interno: { sinCaptions: true, avisoCaptions, transcripcionCaptions: e.transcripcionCaptions || transcripcionCaptions } });
    }
  }

  // ------------------------------------------------------ 3. unir ----
  const idFinal = huella(VERSION, hilos, piezas, pista, volumen, M.entradaSegundos, M.salidaSegundos, total);
  const final = `final-${idFinal}.mp4`;
  await conCerrojo(final, async () => {
    if (fs.existsSync(enCarpeta(final)) && Math.abs((await ff.duracion(final, carpeta)) - total) < 0.5) {
      stats.finalReutilizado = true;
      return;
    }
    await latir("Uniendo las escenas");
    const lista = `lista-${idFinal}.txt`;
    fs.writeFileSync(enCarpeta(lista), piezas.map((x) => `file '${x}'`).join("\n") + "\n");
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
    `Armado de ${trabajo.guionId || trabajo.id}: ${segmentos.length} escenas, ${redondo(duracion, 1)} s de video en ${segundos} s · descargas ${stats.descargas} (ya en disco ${stats.reutilizados}) · escenas codificadas ${stats.segmentosHechos} (reutilizadas ${stats.segmentosReutilizados})${stats.finalReutilizado ? " · final sin cambios" : ""}${pista ? " · con música" : ""} · subtítulos «${estiloSub}»${modo === "elevenlabs" ? ` · narración (${stats.caracteresVoz} caracteres nuevos)` : ""}`,
  );
  return { archivo: enCarpeta(final), duracion, sinVoz: !algunaVoz, avisos, stats, segundos, cierres, segmentos, modo, conMusica: !!pista, tonoMusica, sinAudio, sinLocucion, estiloSubtitulos: infoCaptions ? `captions:${infoCaptions.plantilla}` : estiloSub, subtitulosPuestos: !!infoCaptions || segmentos.some((x) => x.subtitulo), transcripcionCaptions, captionsSegundos: infoCaptions ? infoCaptions.segundos : null, audioClip, clipsCallados: [...clipsCallados], estiloTitulos: estiloTit, titulosDeApoyo: segmentos.filter((x) => x.titulo).length, voz: vozElegida, captions: infoCaptions, transiciones, cortesAlGolpe, golpesDeLaMusica: ritmoMusica ? ritmoMusica.golpes.length : 0, caracteresNarrados: stats.caracteresVoz };
}

module.exports = { armar, modoAudio, movimiento, filtroLienzo, asegurarFuentes };
