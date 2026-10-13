"use strict";
// Proveedores de IMAGEN intercambiables (etapa «imagenes»: la imagen base de cada
// escena, que una persona aprueba antes de gastar en video). Igual que con los de
// video: cada archivo de esta carpeta exporta la MISMA interfaz y se elige con
// PROVEEDOR_IMAGEN en el `.env` (vacío: `simulado` si PROVEEDOR=simulado; si no, `kie`).
//
//   module.exports = {
//     nombre: "mi-proveedor",
//
//     // Devuelve un texto con lo que falta (clave, etc.) o null si está listo.
//     comprobar(cfg) { return null; },
//
//     // Genera UNA imagen y la deja en `ctx.carpeta`. Devuelve el nombre del archivo.
//     async generarImagen(ctx) {
//       return { archivo, modelo, creditos, costoUsd };
//       //  archivo   nombre del archivo dentro de ctx.carpeta (png, jpg o webp)
//       //  modelo    identificador del modelo usado
//       //  creditos  créditos que cobró el proveedor (o null si no lo dice)
//       //  costoUsd  costo estimado, o null si no se conoce la tarifa
//     },
//   };
//
//   ctx = {
//     cfg, registro, ff,       configuración, registro y ffmpeg
//     trabajo, escena,         el trabajo del CRM y la escena { n, promptImagen, … }
//     prompt,                  el texto de la imagen (escena.promptImagen)
//     referencias,             fotos reales del producto (URL públicas), puede venir vacío
//     analisis,                contexto.analisisProducto (texto) o ""
//     carpeta, base,           dónde dejar la imagen y el nombre SIN extensión
//     ancho, alto, relacion,   tamaño final del video y su relación («9:16»)
//     memoria, recordar(obj),  lo que este proveedor guardó de esta escena (el id de la tarea, para no pagarla dos veces)
//     latir(detalle),          avisa al CRM que el trabajo sigue vivo
//   }
const fs = require("fs");
const path = require("path");

function cargarProveedorImagen(nombre) {
  if (!/^[a-z0-9-]+$/.test(nombre)) throw new Error(`PROVEEDOR_IMAGEN inválido: «${nombre}».`);
  const archivo = path.join(__dirname, `${nombre}.js`);
  if (nombre === "index" || !fs.existsSync(archivo)) {
    const hay = fs
      .readdirSync(__dirname)
      .filter((f) => f.endsWith(".js") && f !== "index.js")
      .map((f) => f.slice(0, -3));
    throw new Error(`No existe el proveedor de imagen «${nombre}». Disponibles: ${hay.join(", ")}.`);
  }
  const p = require(archivo);
  if (typeof p.generarImagen !== "function" || typeof p.comprobar !== "function") {
    throw new Error(`El proveedor de imagen «${nombre}» no cumple la interfaz (faltan comprobar o generarImagen).`);
  }
  return p;
}

module.exports = { cargarProveedorImagen };
