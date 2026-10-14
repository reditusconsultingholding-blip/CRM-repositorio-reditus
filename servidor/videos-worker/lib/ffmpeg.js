"use strict";
// Envoltura mínima de ffmpeg/ffprobe. Siempre con lista de argumentos (sin
// consola de por medio) y con la carpeta del trabajo como carpeta actual, para
// poder nombrar archivos sin rutas (los filtros de ffmpeg se enredan con `C:\`).
//
// ffmpeg corre con PRIORIDAD BAJA y con los hilos acotados (config.json → "paralelo"):
// un armado nunca debe dejar sin CPU a los demás procesos del servidor.
const { spawn } = require("child_process");
const os = require("os");
const { ajustesParalelo } = require("./limites");

function correr(programa, args, cwd, limiteMs = 15 * 60000, prioridadBaja = false) {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(programa, args, { cwd, windowsHide: true });
    if (prioridadBaja && hijo.pid) {
      try {
        // En Windows: «por debajo de lo normal». En Linux: nice 10.
        os.setPriority(hijo.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        /* si no se puede bajar la prioridad, corre igual */
      }
    }
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
  const paralelo = ajustesParalelo(cfg);
  const hilos = String(paralelo.hilosFfmpeg);
  // `-threads` va justo antes del archivo de salida (acota el codificador) y los de filtros son globales.
  const ffmpeg = (args, cwd, limiteMs) =>
    correr(cfg.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-filter_threads", hilos, "-filter_complex_threads", hilos, ...args.slice(0, -1), "-threads", hilos, args[args.length - 1]], cwd, limiteMs, paralelo.prioridadBaja);

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

  /** Ancho y alto del primer flujo de video o imagen ({ ancho: 0, alto: 0 } si no se puede leer). */
  async function dimensiones(archivo, cwd) {
    try {
      const s = await correr(cfg.ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", archivo], cwd, 60000);
      const m = /(\d+)x(\d+)/.exec(String(s));
      return m ? { ancho: Number(m[1]), alto: Number(m[2]) } : { ancho: 0, alto: 0 };
    } catch {
      return { ancho: 0, alto: 0 };
    }
  }

  /** Comprueba que ffmpeg y ffprobe responden. Devuelve la versión o lanza. */
  async function comprobar() {
    const v = await correr(cfg.ffmpeg, ["-version"], undefined, 20000);
    await correr(cfg.ffprobe, ["-version"], undefined, 20000);
    return v.split(/\r?\n/)[0];
  }

  /**
   * Corre ffmpeg y devuelve TODO lo que escribe (para los filtros que informan por texto:
   * silencedetect, ebur128, showinfo…). No produce archivo: la salida va a `-f null -`.
   */
  function informe(args, cwd, limiteMs = 10 * 60000) {
    return new Promise((resolver, rechazar) => {
      const hijo = spawn(cfg.ffmpeg, ["-hide_banner", "-nostats", "-filter_threads", hilos, ...args, "-f", "null", "-"], { cwd, windowsHide: true });
      if (paralelo.prioridadBaja && hijo.pid) {
        try {
          os.setPriority(hijo.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
        } catch {
          /* corre igual */
        }
      }
      let texto = "";
      const reloj = setTimeout(() => hijo.kill("SIGKILL"), limiteMs);
      hijo.stdout.on("data", () => {});
      hijo.stderr.on("data", (d) => {
        if (texto.length < 8e6) texto += d;
      });
      hijo.on("error", (e) => (clearTimeout(reloj), rechazar(new Error(`No se pudo ejecutar ffmpeg: ${e.message}`))));
      hijo.on("close", (codigo) => {
        clearTimeout(reloj);
        if (codigo === 0) return resolver(texto);
        rechazar(new Error(`ffmpeg terminó con código ${codigo}: ${texto.trim().split(/\r?\n/).slice(-3).join(" | ")}`));
      });
    });
  }

  const medidas = new Map();
  /**
   * Mide el audio de un archivo: volumen integrado (LUFS) y dónde empieza y termina el sonido.
   *   { dura, lufs, mudo, desde, hasta, inicioDetectado, finDetectado }
   * `inicioDetectado` / `finDetectado`: hay un silencio claro al inicio / al final. Si no lo hay
   * (ruido de ambiente continuo), `desde` = 0 y `hasta` = `dura`, y NO se sabe dónde acaba la frase.
   */
  async function medirAudio(archivo, cwd, { ruidoDb = -35, silencioMinimo = 0.3 } = {}) {
    const clave = `${cwd || ""}|${archivo}|${ruidoDb}|${silencioMinimo}`;
    if (medidas.has(clave)) return medidas.get(clave);
    const dura = await duracion(archivo, cwd);
    const r = { dura, lufs: NaN, mudo: true, desde: 0, hasta: dura, inicioDetectado: false, finDetectado: false };
    try {
      const texto = await informe(["-i", archivo, "-vn", "-af", `silencedetect=noise=${ruidoDb}dB:d=${silencioMinimo},ebur128=framelog=verbose`], cwd);
      const i = /I:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(texto.slice(texto.lastIndexOf("Summary:")));
      r.lufs = i && i[1] !== "-inf" ? Number(i[1]) : -Infinity;
      r.mudo = !(r.lufs > -55);
      const silencios = [];
      let abierto = null;
      for (const m of texto.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
        if (m[1] === "start") abierto = Math.max(0, Number(m[2]));
        else if (abierto !== null) {
          silencios.push([abierto, Number(m[2])]);
          abierto = null;
        }
      }
      if (abierto !== null) silencios.push([abierto, dura]);
      const primero = silencios[0];
      const ultimo = silencios[silencios.length - 1];
      if (primero && primero[0] <= 0.08) {
        r.desde = Math.min(dura, primero[1]);
        r.inicioDetectado = true;
      }
      if (ultimo && ultimo[1] >= dura - 0.12 && ultimo[0] > r.desde) {
        r.hasta = ultimo[0];
        r.finDetectado = true;
      }
      if (r.desde >= dura - 0.05) r.mudo = true; // todo el archivo es silencio
    } catch {
      /* sin medida: se trata como audio normal, sin recortes ni ganancia */
      r.mudo = false;
    }
    if (medidas.size > 400) medidas.clear();
    medidas.set(clave, r);
    return r;
  }

  const voces = new Map();
  /**
   * ¿El audio tiene VOZ hablada? Sin servicios externos: el volumen de la banda de la voz (300–3400 Hz)
   * cada 0,1 s. El habla sube y baja con cada sílaba (variación media ≥ 3,5 dB entre décimas); un
   * ambiente (ruido, viento, tráfico, zumbido) es parejo (< 1 dB). Calibrado con voz sintética, voz con
   * ruido, ruidos, tonos, música con pulso y clips reales con diálogo. Una música muy marcada puede
   * pasar por voz: en ese caso se silencia un ambiente que sobraba, que es el error barato.
   *   { voz, variacion, activos, banda }
   */
  async function detectarVoz(archivo, cwd) {
    const clave = `${cwd || ""}|${archivo}`;
    if (voces.has(clave)) return voces.get(clave);
    const serie = async (filtro) => {
      const t = await informe(["-i", archivo, "-vn", "-af", `aresample=16000,aformat=channel_layouts=mono,${filtro}asetnsamples=n=1600:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level`, "-f", "null", "-"], cwd);
      return [...t.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) => (m[1] === "-inf" ? -120 : Number(m[1])));
    };
    let r = { voz: false, variacion: 0, activos: 0, banda: 0 };
    try {
      const b = await serie("highpass=f=300,lowpass=f=3400,");
      const t = await serie("");
      const act = b.map((_, i) => i).filter((i) => b[i] > -50);
      let suma = 0;
      let n = 0;
      for (let i = 1; i < b.length; i++) if (b[i] > -50 || b[i - 1] > -50) (suma += Math.abs(b[i] - b[i - 1])), n++;
      const variacion = n ? suma / n : 0;
      const activos = b.length ? act.length / b.length : 0;
      const banda = act.length ? act.reduce((a, i) => a + (b[i] - t[i]), 0) / act.length : -99;
      r = { voz: activos >= 0.25 && variacion >= 3.5 && banda >= -7, variacion: Math.round(variacion * 100) / 100, activos: Math.round(activos * 100) / 100, banda: Math.round(banda * 10) / 10 };
    } catch {
      /* sin audio legible: sin voz */
    }
    voces.set(clave, r);
    return r;
  }

  return { ffmpeg, informe, medirAudio, detectarVoz, duracion, tieneAudio, dimensiones, comprobar };
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
