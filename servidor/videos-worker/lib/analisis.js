"use strict";
// Etapa «analisis» (clonar un anuncio): desarma el video de referencia que la persona subió al CRM.
// Contrato: servidor/CONTRATO-PROYECTO-VIDEO.md, «14-oct · B. Análisis de un video de referencia».
//
//   1. Baja el archivo (con tope de tamaño) y comprueba que sea un video y que no pase de la
//      duración máxima. Si pasa, falla con un motivo que empieza por «no analizable».
//   2. Detecta los cortes de plano con ffmpeg (filtro de detección de escena) → tomas. Si salen
//      más de las que admite el CRM (`referencia.maxTomas`, 16), se unen las más cortas.
//   3. Saca UN fotograma JPG por toma (del medio) y la pista de audio (MP3 mono liviano).
//   4. Transcribe el audio SOLO si hay un servicio configurado (TRANSCRIPCION en el .env). Sin
//      servicio va `transcripcion: null` con el motivo: no se inventa nada.
//   5. Sube los fotogramas y el audio al CRM (bucket privado) y devuelve la estructura.
//      El original se BORRA siempre, pase lo que pase.
//
// Aquí solo se hace lo mecánico. Clasificar cada toma (tipo, encuadre, qué pasa) lo hace el CRM
// con su IA de visión: el trabajador no describe personas ni lee textos. No cuesta: es ffmpeg.
const fs = require("fs");
const path = require("path");
const { descargar } = require("./red");
const { cargarTranscriptor } = require("../transcripcion");

const redondo = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const dos = (n) => String(n).padStart(2, "0");

/** Error que repetir no arregla: el archivo no sirve tal como está. El motivo empieza por «no analizable». */
const noSirve = (motivo) => Object.assign(new Error(`no analizable: ${motivo}`), { noAnalizable: true });

/** Segundos donde hay corte de plano, según el filtro de detección de escena de ffmpeg. */
async function cortesDePlano(ff, archivo, cwd, umbral) {
  const texto = await ff.informe(["-i", archivo, "-an", "-vf", `scale=320:-2,select='gt(scene,${umbral})',showinfo`], cwd);
  return [...texto.matchAll(/pts_time:\s*([\d.]+)/g)].map((m) => Number(m[1])).filter((t) => Number.isFinite(t));
}

/**
 * De los cortes a las tomas. Se descartan los cortes demasiado seguidos; si quedan más tomas
 * que `maxTomas`, se va uniendo la más corta con su vecina más corta hasta que quepan.
 */
function armarTomas(cortes, dura, { tomaMinima = 0.6, maxTomas = 16 } = {}) {
  const limites = [0];
  for (const c of [...cortes].sort((a, b) => a - b)) {
    if (c - limites[limites.length - 1] >= tomaMinima && dura - c >= tomaMinima) limites.push(c);
  }
  limites.push(dura);
  let unidas = 0;
  while (limites.length - 1 > Math.max(1, maxTomas)) {
    // la toma más corta…
    let k = 0;
    for (let i = 1; i < limites.length - 1; i++) if (limites[i + 1] - limites[i] < limites[k + 1] - limites[k]) k = i;
    // …se une con su vecina más corta (se borra el corte que las separa)
    const izq = k > 0 ? limites[k] - limites[k - 1] : Infinity;
    const der = k < limites.length - 2 ? limites[k + 2] - limites[k + 1] : Infinity;
    limites.splice(izq <= der ? k : k + 1, 1);
    unidas++;
  }
  const tomas = [];
  for (let i = 0; i < limites.length - 1; i++) tomas.push({ n: i + 1, desde: redondo(limites[i]), hasta: redondo(limites[i + 1]) });
  return { tomas, unidas };
}

/**
 *   { cfg, ff, registro, trabajo, carpeta, subir(archivo, que) → ruta, latir(detalle) }
 * Devuelve { resultado, fotogramas } donde `resultado` es lo que viaja en el cierre al CRM.
 */
async function analizar({ cfg, ff, registro, trabajo, carpeta, subir, latir = async () => {} }) {
  const A = cfg.config.analisis || {};
  const maxSegundos = A.maxSegundos || 180;
  const maxMb = A.maxMb || 200;
  const ref = trabajo.referencia || {};
  const url = typeof ref.url === "string" ? ref.url : "";
  if (!(/^https:\/\//.test(url) || (cfg.permitirHttpLocal && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)))) {
    throw noSirve("el trabajo no trae la dirección https del video de referencia (referencia.url). Los enlaces de redes o bibliotecas de anuncios no sirven: hay que subir el archivo al CRM.");
  }
  const maxTomas = Math.max(1, Math.min(Number(ref.maxTomas) > 0 ? Math.floor(Number(ref.maxTomas)) : 16, A.maxTomas || 16));
  fs.mkdirSync(carpeta, { recursive: true });
  const original = "original.bin"; // sin extensión de video a propósito: ffmpeg lo reconoce por su contenido
  const avisos = [];
  try {
    await latir("Bajando el video de referencia");
    try {
      await descargar(url, path.join(carpeta, original), {}, { maxBytes: maxMb * 1048576 });
    } catch (e) {
      if (e.demasiadoGrande) throw noSirve(`${e.message}. El máximo es ${maxMb} MB: recórtalo o bájale la calidad y súbelo de nuevo.`);
      throw e;
    }
    const dura = await ff.duracion(original, carpeta);
    const dim = await ff.dimensiones(original, carpeta);
    if (!(dura > 0.5) || !dim.ancho) throw noSirve("el archivo no es un video que se pueda leer.");
    if (dura > maxSegundos) throw noSirve(`el video dura ${Math.round(dura)} s y el máximo es ${maxSegundos} s. Recorta el anuncio y súbelo de nuevo.`);
    const conAudio = await ff.tieneAudio(original, carpeta);

    // ---- cortes de plano → tomas ----
    await latir("Buscando los cortes de plano");
    const cortes = await cortesDePlano(ff, original, carpeta, A.umbralCorte || 0.3);
    const { tomas, unidas } = armarTomas(cortes, dura, { tomaMinima: A.tomaMinima || 0.6, maxTomas });
    if (unidas) avisos.push(`El video tiene más de ${maxTomas} tomas: las ${unidas + 1 > 2 ? `${unidas} más cortas se unieron con la de al lado` : "dos más cortas se unieron"}.`);
    if (tomas.length === 1) avisos.push("No se detectaron cortes de plano: el video va como una sola toma.");

    // ---- un fotograma por toma (del medio) ----
    const lado = A.ladoFotograma || 768;
    await latir("Sacando fotogramas");
    for (const t of tomas) {
      const seg = Math.max(0, Math.min(dura - 0.08, (t.desde + t.hasta) / 2));
      t.archivo = `fotograma-${dos(t.n)}.jpg`;
      t.segundo = redondo(seg);
      // lado mayor ≤ `lado`, sin agrandar un video pequeño
      await ff.ffmpeg(["-ss", String(seg), "-i", original, "-frames:v", "1", "-vf", `scale='if(gt(iw,ih),min(iw,${lado}),-2)':'if(gt(iw,ih),-2,min(ih,${lado}))'`, "-q:v", "4", "-update", "1", t.archivo], carpeta);
      if (!fs.existsSync(path.join(carpeta, t.archivo)) || fs.statSync(path.join(carpeta, t.archivo)).size < 200) throw noSirve(`no se pudo sacar el fotograma de la toma ${t.n}.`);
    }

    // ---- audio ----
    let audio = null;
    if (conAudio) {
      await latir("Sacando el audio");
      try {
        await ff.ffmpeg(["-i", original, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k", "audio.mp3"], carpeta);
        const med = await ff.medirAudio("audio.mp3", carpeta);
        audio = { archivo: "audio.mp3", duracion: redondo(await ff.duracion("audio.mp3", carpeta)), silencio: !!med.mudo };
        if (med.mudo) avisos.push("La pista de audio del video está en silencio.");
      } catch (e) {
        avisos.push(`No se pudo sacar el audio del video (${registro.limpiar(e.message || "").slice(0, 120)}).`);
      }
    } else {
      avisos.push("El video no trae pista de audio.");
    }

    // ---- transcripción (solo si hay servicio configurado) ----
    let transcripcion = null;
    let transcripcionMotivo = "";
    if (!audio || audio.silencio) {
      transcripcionMotivo = "El video no tiene audio que transcribir.";
    } else {
      let servicio = null;
      try {
        servicio = cargarTranscriptor(cfg.transcripcion || "ninguno");
      } catch (e) {
        transcripcionMotivo = e.message;
      }
      const falta = servicio ? servicio.comprobar(cfg) : null;
      if (servicio && falta) transcripcionMotivo = falta;
      else if (servicio) {
        try {
          await latir("Transcribiendo el audio");
          const r = await servicio.transcribir({ cfg, registro, archivo: path.join(carpeta, audio.archivo), idioma: typeof ref.idioma === "string" ? ref.idioma.slice(0, 12) : "" });
          transcripcion = (Array.isArray(r && r.segmentos) ? r.segmentos : [])
            .slice(0, 200)
            .map((s) => ({ desde: redondo(Number(s.desde) || 0), hasta: redondo(Number(s.hasta) || 0), texto: String(s.texto || "").trim().slice(0, 600) }))
            .filter((s) => s.texto);
          if (!transcripcion.length) {
            transcripcion = null;
            transcripcionMotivo = `El servicio de transcripción («${servicio.nombre}») no devolvió texto.`;
          }
        } catch (e) {
          transcripcionMotivo = `El servicio de transcripción («${servicio.nombre}») falló: ${registro.limpiar(e.message || String(e)).slice(0, 200)}`;
        }
      }
    }

    // ---- subir: un fotograma por toma (obligatorio) y el audio (si se puede) ----
    await latir("Subiendo fotogramas y audio");
    for (const t of tomas) t.ruta = await subir(path.join(carpeta, t.archivo), { tipo: "fotograma", indice: t.n });
    let rutaAudio = null;
    if (audio && !audio.silencio) {
      try {
        rutaAudio = await subir(path.join(carpeta, audio.archivo), { tipo: "audio", extension: "mp3" });
      } catch (e) {
        if (!(e && e.estado === 400)) throw e;
        avisos.push("El CRM no aceptó la subida del audio: el análisis va sin él.");
      }
    }

    const resultado = {
      duracion: redondo(dura),
      tomas: tomas.map((t) => ({ desde: t.desde, hasta: t.hasta, fotograma: t.ruta })),
      ...(rutaAudio ? { audio: rutaAudio } : {}),
      // Sin transcripción va `null` y el motivo (el CRM lo trata igual que si no viniera).
      transcripcion,
      ...(transcripcion ? {} : { transcripcionMotivo }),
      // De más, informativo:
      ancho: dim.ancho,
      alto: dim.alto,
      tieneAudio: !!(audio && !audio.silencio),
      avisos,
    };
    return { resultado, fotogramas: tomas.length };
  } finally {
    // El original NO se conserva: se borra pase lo que pase.
    fs.rmSync(path.join(carpeta, original), { force: true });
  }
}

module.exports = { analizar, armarTomas, cortesDePlano };
