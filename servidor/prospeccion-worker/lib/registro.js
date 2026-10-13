"use strict";
// Registro en archivo con rotación (5 MB × 5). Nunca se escribe el texto de
// un correo ni una clave; las direcciones salen tapadas (a***@dominio.com).
const fs = require("fs");
const path = require("path");

const MAX_BYTES = 5 * 1024 * 1024;
const ARCHIVOS = 5;

/** `ana.perez@tienda.com` → `a***@tienda.com`. */
function tapar(correo) {
  const c = String(correo || "");
  const i = c.indexOf("@");
  return i > 0 ? `${c[0]}***${c.slice(i)}` : c ? "***" : "";
}

function crearRegistro(carpeta, secretos, marca) {
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, "trabajador.log");

  function limpiar(texto) {
    let t = String(texto);
    for (const s of secretos) t = t.split(s).join("[clave oculta]");
    return t.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._:\-+/=]{8,}/g, "$1 [clave oculta]").replace(/(AUTH\s+(?:PLAIN|LOGIN)\s+)\S+/gi, "$1[oculto]");
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
    const texto = partes.map((p) => (p instanceof Error ? p.message : typeof p === "string" ? p : JSON.stringify(p))).join(" ");
    const linea = `${new Date().toISOString()} ${nivel} ${marca ? marca() : ""}${limpiar(texto).replace(/\s+/g, " ").slice(0, 600)}`;
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
    info: (...p) => escribir("INFO ", p),
    aviso: (...p) => escribir("AVISO", p),
    error: (...p) => escribir("ERROR", p),
  };
}

module.exports = { crearRegistro, tapar };
