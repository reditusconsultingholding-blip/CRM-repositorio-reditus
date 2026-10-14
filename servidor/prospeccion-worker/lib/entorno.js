"use strict";
// Configuración del trabajador: `.env` (claves y direcciones) + `config.json`
// (tiempos). Lo que ya está en el entorno del proceso gana sobre el archivo.
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const LINEAS = ["video", "landing"];

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
  const env = { ...leerEnv(path.join(RAIZ, ".env")), ...process.env };
  const config = JSON.parse(fs.readFileSync(path.join(RAIZ, "config.json"), "utf8"));
  const dato = (k) => (typeof env[k] === "string" ? env[k].trim() : "");
  const datos = path.resolve(RAIZ, dato("CARPETA_DATOS") || "datos");
  const modo = (dato("MODO") || "simulacion").toLowerCase();

  const cuentas = {};
  for (const linea of LINEAS) {
    const M = linea.toUpperCase();
    const usuario = dato(`GMAIL_${M}_USER`).toLowerCase();
    // Google muestra la contraseña de aplicación en grupos de 4 con espacios: se aceptan y se quitan.
    const clave = dato(`GMAIL_${M}_APP_PASSWORD`).replace(/\s+/g, "");
    if (modo === "simulacion") cuentas[linea] = { linea, usuario: usuario || `${linea}@simulacion.local`, clave: "" };
    else if (usuario && clave) cuentas[linea] = { linea, usuario, clave };
  }

  const acelerar = Number(dato("PRUEBA_ACELERAR")) || 1;
  const ahoraPrueba = dato("PRUEBA_AHORA");
  return {
    raiz: RAIZ,
    modo,
    crmUrl: dato("CRM_URL").replace(/\/+$/, ""),
    secreto: dato("SERVIDOR_SECRET"),
    remitente: dato("NOMBRE_REMITENTE") || "Sebastian Vargas",
    cuentas,
    lineas: LINEAS.filter((l) => cuentas[l]),
    // La búsqueda tiene su propio modo: se puede buscar de verdad con el correo aún en simulación, y al revés.
    busqueda: (dato("MODO_BUSQUEDA") || "simulacion").toLowerCase(),
    apify: { token: dato("APIFY_TOKEN"), actor: dato("APIFY_ACTOR_ANUNCIOS") || "apify~facebook-ads-scraper" },
    meta: { token: dato("META_AD_LIBRARY_TOKEN") },
    nombre: dato("NOMBRE_SERVIDOR") || require("os").hostname(),
    prueba: { acelerar: acelerar > 0 ? acelerar : 1, ahora: ahoraPrueba && Number.isFinite(Date.parse(ahoraPrueba)) ? ahoraPrueba : "" },
    carpetas: {
      datos,
      registro: path.join(datos, "registro"),
      simulacion: path.join(datos, "simulacion"),
    },
    config,
  };
}

/** Problemas que impiden arrancar. Lista vacía = todo bien. */
function revisar(cfg) {
  const p = [];
  if (!cfg.crmUrl) p.push("Falta CRM_URL en el .env.");
  if (!cfg.secreto) p.push("Falta SERVIDOR_SECRET en el .env.");
  if (cfg.modo !== "simulacion" && cfg.modo !== "real") p.push("MODO debe ser «simulacion» o «real».");
  if (cfg.busqueda !== "simulacion" && cfg.busqueda !== "real") p.push("MODO_BUSQUEDA debe ser «simulacion» o «real».");
  if (cfg.busqueda === "real" && !cfg.apify.token && !cfg.meta.token) p.push("MODO_BUSQUEDA=real y no hay APIFY_TOKEN ni META_AD_LIBRARY_TOKEN en el .env.");
  if (cfg.busqueda === "real" && (cfg.prueba.acelerar !== 1 || cfg.prueba.ahora)) p.push("PRUEBA_ACELERAR y PRUEBA_AHORA no se permiten con MODO_BUSQUEDA=real: quítalas.");
  if (cfg.modo === "real") {
    if (!cfg.lineas.length) p.push("MODO=real y no hay ninguna cuenta completa (GMAIL_VIDEO_USER + GMAIL_VIDEO_APP_PASSWORD, o las de LANDING).");
    if (cfg.prueba.acelerar !== 1 || cfg.prueba.ahora) p.push("PRUEBA_ACELERAR y PRUEBA_AHORA solo se permiten con MODO=simulacion: quítalas.");
    if (cfg.crmUrl && !/^https:\/\//.test(cfg.crmUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(cfg.crmUrl)) p.push("CRM_URL debe empezar por https://");
    for (const l of cfg.lineas) {
      if (cfg.cuentas[l].clave.length !== 16) p.push(`La contraseña de aplicación de la cuenta «${l}» debe tener 16 letras (sin contar espacios).`);
    }
  }
  return p;
}

/** Los valores que jamás deben aparecer en el registro. */
function secretos(cfg) {
  return [cfg.secreto, cfg.apify.token, cfg.meta.token, ...Object.values(cfg.cuentas).map((c) => c.clave)].filter((s) => s && s.length >= 6);
}

module.exports = { cargar, revisar, secretos, leerEnv, RAIZ, LINEAS };
