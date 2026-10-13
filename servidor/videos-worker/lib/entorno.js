"use strict";
// Configuración del trabajador: `.env` (claves y direcciones) + `config.json`
// (modelos, tiempos, tamaño de salida). Sin dependencias.
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");

/** Lee un `.env` sencillo (CLAVE=valor, # comentarios, comillas opcionales). */
function leerEnv(archivo) {
  const salida = {};
  if (!fs.existsSync(archivo)) return salida;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linea);
    if (!m || linea.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    salida[m[1]] = v;
  }
  return salida;
}

function cargar() {
  // Lo que ya está en el entorno del proceso gana sobre el archivo.
  const env = { ...leerEnv(path.join(RAIZ, ".env")), ...process.env };
  const config = JSON.parse(fs.readFileSync(path.join(RAIZ, "config.json"), "utf8"));
  const dato = (k) => (typeof env[k] === "string" ? env[k].trim() : "");
  const datos = path.resolve(RAIZ, dato("CARPETA_DATOS") || "datos");
  return {
    raiz: RAIZ,
    crmUrl: dato("CRM_URL").replace(/\/+$/, ""),
    secreto: dato("SERVIDOR_SECRET"),
    proveedor: (dato("PROVEEDOR") || "simulado").toLowerCase(),
    // Quién hace las imágenes base. Vacío: el simulado si PROVEEDOR=simulado; si no, Kie.
    proveedorImagen: (dato("PROVEEDOR_IMAGEN") || ((dato("PROVEEDOR") || "simulado").toLowerCase() === "simulado" ? "simulado" : "kie")).toLowerCase(),
    kieKey: dato("KIE_API_KEY"),
    geminiKey: dato("GEMINI_API_KEY"),
    falKey: dato("FAL_KEY"),
    elevenKey: dato("ELEVENLABS_API_KEY"),
    elevenVoz: dato("ELEVENLABS_VOICE_ID"),
    nombre: dato("NOMBRE_TRABAJADOR") || require("os").hostname(),
    ffmpeg: dato("FFMPEG") || "ffmpeg",
    ffprobe: dato("FFPROBE") || "ffprobe",
    carpetas: {
      datos,
      trabajos: path.join(datos, "trabajos"),
      proyectos: path.join(datos, "proyectos"),
      entregados: path.join(datos, "entregados"),
      registro: path.join(datos, "registro"),
    },
    config,
  };
}

/** Los valores que jamás deben aparecer en el registro. */
function secretos(cfg) {
  return [cfg.secreto, cfg.kieKey, cfg.geminiKey, cfg.falKey, cfg.elevenKey].filter((s) => s && s.length >= 6);
}

module.exports = { cargar, secretos, leerEnv, RAIZ };
