"use strict";
// Carpeta de cada proyecto por escenas: `datos/proyectos/<guion>-v<versión>/`.
//
// Vive más que un trabajo (un proyecto pasa por varios: imágenes, clips, armado,
// correcciones, rearmados) y guarda dos cosas:
//   · la caché del armado: lo descargado y lo ya codificado, con el nombre de su
//     huella. Lo que ya está no se vuelve a bajar ni a codificar.
//   · `tareas.json`: las tareas pagas que quedaron pendientes en el proveedor
//     (imagen o clip), para retomarlas aunque el CRM mande OTRO trabajo para la
//     misma escena: no se paga dos veces.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { descargar } = require("./red");

const huella = (...partes) => crypto.createHash("sha1").update(JSON.stringify(partes)).digest("hex").slice(0, 16);

function carpetaProyecto(cfg, trabajo) {
  const base = String(trabajo.guionId || trabajo.id || "sin-guion").replace(/[^\w.-]/g, "_").slice(0, 80);
  const v = String(trabajo.version == null ? "" : trabajo.version).replace(/[^\w.-]/g, "_").slice(0, 12);
  const carpeta = path.join(cfg.carpetas.proyectos, v ? `${base}-v${v}` : base);
  fs.mkdirSync(carpeta, { recursive: true });
  return carpeta;
}

/**
 * Identidad de un archivo remoto: su dirección SIN la parte firmada (lo que va
 * después de «?» cambia cada vez que el CRM firma el enlace) más el número de
 * intento de la escena. Así un enlace recién firmado del mismo archivo no obliga
 * a bajarlo otra vez, y un clip rehecho (otro intento) sí se baja.
 */
function claveUrl(url, extra = "") {
  const u = new URL(url);
  return huella(u.origin + u.pathname, String(extra));
}

const EXTENSIONES = ["mp4", "mov", "webm", "jpg", "jpeg", "png", "webp", "mp3", "m4a", "wav", "aac", "ogg"];

/**
 * Deja en la carpeta del proyecto el archivo de `url` y devuelve su nombre.
 * Si ya estaba (misma clave), no descarga nada.
 */
async function traer(carpeta, url, { prefijo = "f", extra = "", ext = "bin", stats = null, local = false, conCerrojo = (c, f) => f() } = {}) {
  if (typeof url !== "string" || !(/^https:\/\//.test(url) || (local && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)))) {
    throw new Error(`Dirección no válida (debe ser un enlace https): ${String(url).slice(0, 80)}`);
  }
  const e = (/\.([a-z0-9]{2,4})$/i.exec(new URL(url).pathname) || [])[1];
  const extension = e && EXTENSIONES.includes(e.toLowerCase()) ? e.toLowerCase() : ext;
  const nombre = `${prefijo}-${claveUrl(url, extra)}.${extension}`;
  const destino = path.join(carpeta, nombre);
  // Con cerrojo por archivo: si otro armado lo está bajando, se espera y se usa el suyo.
  return conCerrojo(nombre, async () => {
    if (fs.existsSync(destino) && fs.statSync(destino).size >= 1024) {
      if (stats) stats.reutilizados++;
      return nombre;
    }
    await descargar(url, `${destino}.tmp`);
    fs.renameSync(`${destino}.tmp`, destino);
    if (stats) stats.descargas++;
    return nombre;
  });
}

// ------------------------------------------------ tareas pendientes ----
function leerTareas(carpeta) {
  try {
    return JSON.parse(fs.readFileSync(path.join(carpeta, "tareas.json"), "utf8")) || {};
  } catch {
    return {};
  }
}

/** Memoria de la tarea de una escena (o null). `clave` identifica escena + lo que se pidió. */
function tareaPendiente(carpeta, clave) {
  return leerTareas(carpeta)[clave] || null;
}

/** Guarda (o borra, con null) la tarea de una escena. */
function recordarTarea(carpeta, clave, memoria) {
  const todo = leerTareas(carpeta);
  if (memoria) todo[clave] = memoria;
  else delete todo[clave];
  const archivo = path.join(carpeta, "tareas.json");
  fs.writeFileSync(`${archivo}.tmp`, JSON.stringify(todo, null, 1));
  fs.renameSync(`${archivo}.tmp`, archivo);
}

/** Carpeta de la caché del armado, compartida por todos los proyectos. */
function carpetaCache(cfg) {
  const carpeta = cfg.carpetas.cache || path.join(cfg.carpetas.datos, "cache");
  fs.mkdirSync(carpeta, { recursive: true });
  return carpeta;
}

/** Borra de la caché lo que lleva `diasParaBorrarCache` días sin usarse (cada armado marca lo que usa). */
function limpiarCache(cfg) {
  const carpeta = cfg.carpetas.cache || (cfg.carpetas.datos && path.join(cfg.carpetas.datos, "cache"));
  if (!carpeta || !fs.existsSync(carpeta)) return;
  const limite = Date.now() - (cfg.config.diasParaBorrarCache || 21) * 86400000;
  for (const f of fs.readdirSync(carpeta)) {
    try {
      const ruta = path.join(carpeta, f);
      const viejo = fs.statSync(ruta).mtimeMs < (/^(tmp-|lista-)/.test(f) || /\.tmp$/.test(f) ? Date.now() - 86400000 : limite);
      if (viejo) fs.rmSync(ruta, { force: true });
    } catch {
      /* se intenta en la próxima limpieza */
    }
  }
}

/** Borra los proyectos que llevan mucho sin tocarse (y la caché vieja). */
function limpiarProyectos(cfg) {
  limpiarCache(cfg);
  const raiz = cfg.carpetas.proyectos;
  if (!raiz || !fs.existsSync(raiz)) return;
  const limite = Date.now() - (cfg.config.diasParaBorrarProyectos || 30) * 86400000;
  for (const id of fs.readdirSync(raiz)) {
    const carpeta = path.join(raiz, id);
    try {
      const archivos = fs.readdirSync(carpeta);
      const ultimo = Math.max(fs.statSync(carpeta).mtimeMs, ...archivos.map((f) => fs.statSync(path.join(carpeta, f)).mtimeMs));
      // Una tarea paga pendiente se conserva: borrarla sería perder lo ya cobrado.
      if (ultimo < limite && !Object.keys(leerTareas(carpeta)).length) fs.rmSync(carpeta, { recursive: true, force: true });
    } catch {
      /* se intenta en la próxima limpieza */
    }
  }
}

module.exports = { huella, carpetaProyecto, carpetaCache, limpiarCache, claveUrl, traer, tareaPendiente, recordarTarea, limpiarProyectos };
