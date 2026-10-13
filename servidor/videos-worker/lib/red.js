"use strict";
// Llamadas HTTP con reintentos y espera creciente, y descarga a archivo.
const fs = require("fs");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Error con el código HTTP y el cuerpo que devolvió el otro lado. */
class ErrorHttp extends Error {
  constructor(estado, cuerpo, url) {
    const detalle = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
    super(`HTTP ${estado} en ${url}: ${String(detalle).slice(0, 300)}`);
    this.estado = estado;
    this.cuerpo = cuerpo;
  }
}

/**
 * Pide JSON. Reintenta los fallos de red y los 5xx/429 con espera creciente
 * (2 s, 5 s, 15 s, 30 s). Un 4xx no se reintenta: es un error de quien llama.
 */
async function pedirJson(url, opciones = {}, esperas = [2000, 5000, 15000, 30000]) {
  let ultimo;
  for (let intento = 0; intento <= esperas.length; intento++) {
    try {
      const res = await fetch(url, { ...opciones, signal: AbortSignal.timeout(opciones.limiteMs || 60000) });
      const texto = await res.text();
      let cuerpo;
      try {
        cuerpo = texto ? JSON.parse(texto) : {};
      } catch {
        cuerpo = texto;
      }
      if (res.ok) return cuerpo;
      const error = new ErrorHttp(res.status, cuerpo, url.split("?")[0]);
      if (res.status < 500 && res.status !== 429) throw error;
      ultimo = error;
    } catch (e) {
      if (e instanceof ErrorHttp && e.estado < 500 && e.estado !== 429) throw e;
      ultimo = e;
    }
    if (intento < esperas.length) await esperar(esperas[intento]);
  }
  throw ultimo;
}

/** Descarga una URL a un archivo (por flujo: un video no se carga entero en memoria). */
async function descargar(url, destino, cabeceras = {}) {
  let ultimo;
  for (const espera of [0, 3000, 10000]) {
    if (espera) await esperar(espera);
    try {
      const res = await fetch(url, { headers: cabeceras, signal: AbortSignal.timeout(10 * 60000) });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} al descargar ${url.split("?")[0]}`);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destino));
      if (fs.statSync(destino).size < 1024) throw new Error("la descarga llegó vacía");
      return destino;
    } catch (e) {
      ultimo = e;
    }
  }
  throw ultimo;
}

module.exports = { pedirJson, descargar, esperar, ErrorHttp };
