"use strict";
// Registro en archivo con rotación. Todo lo que se escribe pasa primero por
// `limpiar`, que tacha las claves: ni el secreto del CRM, ni la de fal, ni la
// de ElevenLabs, ni los tokens de las URL firmadas llegan al disco.
const fs = require("fs");
const path = require("path");

const MAX_BYTES = 5 * 1024 * 1024;
const ARCHIVOS = 5;

function crearRegistro(carpeta, secretos) {
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, "trabajador.log");

  function limpiar(texto) {
    let t = String(texto);
    for (const s of secretos) t = t.split(s).join("[clave oculta]");
    return t
      .replace(/\b(Bearer|Key)\s+[A-Za-z0-9._:\-]{8,}/g, "$1 [clave oculta]")
      .replace(/([?&](?:token|signature|sig|key|apikey|x-amz-signature|x-amz-credential|x-amz-security-token|x-goog-signature|x-goog-credential)=)[^&\s"']+/gi, "$1[oculto]")
      .replace(/(x-goog-api-key["':\s]+)[A-Za-z0-9._\-]{8,}/gi, "$1[clave oculta]")
      .replace(/(xi-api-key["':\s]+)[A-Za-z0-9._\-]{8,}/gi, "$1[clave oculta]");
  }

  function rotar() {
    try {
      if (!fs.existsSync(archivo) || fs.statSync(archivo).size < MAX_BYTES) return;
      for (let i = ARCHIVOS - 1; i >= 1; i--) {
        const de = `${archivo}.${i}`;
        if (fs.existsSync(de)) fs.renameSync(de, `${archivo}.${i + 1}`);
      }
      fs.renameSync(archivo, `${archivo}.1`);
      const sobra = `${archivo}.${ARCHIVOS + 1}`;
      if (fs.existsSync(sobra)) fs.unlinkSync(sobra);
    } catch {
      /* si no se puede rotar, se sigue escribiendo en el mismo archivo */
    }
  }

  function escribir(nivel, partes) {
    const texto = partes
      .map((p) => (p instanceof Error ? p.stack || p.message : typeof p === "string" ? p : JSON.stringify(p)))
      .join(" ");
    const linea = `${new Date().toISOString()} ${nivel} ${limpiar(texto)}`;
    rotar();
    try {
      fs.appendFileSync(archivo, linea + "\n");
    } catch {
      /* sin disco no hay registro, pero el trabajo sigue */
    }
    (nivel === "ERROR" ? console.error : console.log)(linea);
  }

  return {
    archivo,
    limpiar,
    info: (...p) => escribir("INFO ", p),
    aviso: (...p) => escribir("AVISO", p),
    error: (...p) => escribir("ERROR", p),
  };
}

module.exports = { crearRegistro };
