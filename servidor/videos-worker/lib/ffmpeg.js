"use strict";
// Envoltura mínima de ffmpeg/ffprobe. Siempre con lista de argumentos (sin
// consola de por medio) y con la carpeta del trabajo como carpeta actual, para
// poder nombrar archivos sin rutas (los filtros de ffmpeg se enredan con `C:\`).
const { spawn } = require("child_process");

function correr(programa, args, cwd, limiteMs = 15 * 60000) {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(programa, args, { cwd, windowsHide: true });
    let salida = "";
    let errores = "";
    const reloj = setTimeout(() => hijo.kill("SIGKILL"), limiteMs);
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.stderr.on("data", (d) => (errores = (errores + d).slice(-6000)));
    hijo.on("error", (e) => {
      clearTimeout(reloj);
      rechazar(new Error(`No se pudo ejecutar ${programa}: ${e.message}. ¿Está instalado y en el PATH?`));
    });
    hijo.on("close", (codigo) => {
      clearTimeout(reloj);
      if (codigo === 0) return resolver(salida);
      const cola = errores.trim().split(/\r?\n/).slice(-4).join(" | ");
      rechazar(new Error(`${programa} terminó con código ${codigo}: ${cola}`));
    });
  });
}

function crear(cfg) {
  const ffmpeg = (args, cwd, limiteMs) => correr(cfg.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], cwd, limiteMs);

  /** Duración en segundos de un archivo de audio o video (0 si no se puede leer). */
  async function duracion(archivo, cwd) {
    try {
      const s = await correr(cfg.ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", archivo], cwd, 60000);
      const n = Number(String(s).trim());
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  /** ¿El archivo trae pista de audio? */
  async function tieneAudio(archivo, cwd) {
    try {
      const s = await correr(cfg.ffprobe, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", archivo], cwd, 60000);
      return String(s).trim().length > 0;
    } catch {
      return false;
    }
  }

  /** Comprueba que ffmpeg y ffprobe responden. Devuelve la versión o lanza. */
  async function comprobar() {
    const v = await correr(cfg.ffmpeg, ["-version"], undefined, 20000);
    await correr(cfg.ffprobe, ["-version"], undefined, 20000);
    return v.split(/\r?\n/)[0];
  }

  return { ffmpeg, duracion, tieneAudio, comprobar };
}

/** Ancho y alto de salida para una relación de aspecto («9:16», «16:9», «1:1»…). */
function tamano(relacion, ladoCorto = 1080) {
  const m = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(String(relacion || "").trim());
  const a = m ? Number(m[1]) : 9;
  const b = m ? Number(m[2]) : 16;
  const par = (n) => Math.round(n / 2) * 2;
  return a >= b ? { ancho: par((ladoCorto * a) / b), alto: par(ladoCorto) } : { ancho: par(ladoCorto), alto: par((ladoCorto * b) / a) };
}

module.exports = { crear, tamano };
