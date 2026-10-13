"use strict";
// Servicios de TRANSCRIPCIÓN intercambiables (etapa «analisis»: pasar a texto, con tiempos, lo que
// se dice en el anuncio de referencia). Se elige con TRANSCRIPCION en el `.env`.
//
// Hoy NO hay ninguno real implementado: `ninguno` (por defecto) hace que el análisis devuelva
// `transcripcion: null` con el motivo, y `simulado` sirve solo para las pruebas.
//
// Para agregar uno real: copia `simulado.js`, cambia lo de adentro y pon su nombre en TRANSCRIPCION.
// Recomendado (sin implementar ni verificar todavía): ElevenLabs «Scribe» (voz a texto), porque
// usa la MISMA clave que ya conoce este trabajador (ELEVENLABS_API_KEY), entiende español y da
// tiempos por palabra. Alternativa: OpenAI (voz a texto), con su propia clave (OPENAI_API_KEY).
// Kie, el proveedor de video e imagen, no ofrece voz a texto en su documentación (revisado el 13-oct-2026).
// Antes de programarlo: leer la documentación oficial del servicio (ruta, campos, formato de los
// tiempos, límite de tamaño y precio por minuto) y dejar lo dudoso en config.json marcado «verificar».
//
//   module.exports = {
//     nombre: "mi-servicio",
//
//     // Devuelve un texto con lo que falta (clave, etc.) o null si está listo.
//     comprobar(cfg) { return null; },
//
//     // Transcribe un archivo de audio (MP3 mono de 16 kHz, hasta ~90 s).
//     async transcribir({ cfg, registro, archivo, idioma }) {
//       return { idioma: "es", texto: "todo lo dicho", segmentos: [{ desde: 0.4, hasta: 2.1, texto: "frase" }] };
//     },
//   };
const fs = require("fs");
const path = require("path");

function cargarTranscriptor(nombre) {
  if (!/^[a-z0-9-]+$/.test(nombre)) throw new Error(`TRANSCRIPCION inválido: «${nombre}».`);
  const archivo = path.join(__dirname, `${nombre}.js`);
  if (nombre === "index" || !fs.existsSync(archivo)) {
    const hay = fs
      .readdirSync(__dirname)
      .filter((f) => f.endsWith(".js") && f !== "index.js")
      .map((f) => f.slice(0, -3));
    throw new Error(`No existe el servicio de transcripción «${nombre}». Disponibles: ${hay.join(", ")}.`);
  }
  const p = require(archivo);
  if (typeof p.transcribir !== "function" || typeof p.comprobar !== "function") throw new Error(`El servicio de transcripción «${nombre}» no cumple la interfaz (faltan comprobar o transcribir).`);
  return p;
}

module.exports = { cargarTranscriptor };
