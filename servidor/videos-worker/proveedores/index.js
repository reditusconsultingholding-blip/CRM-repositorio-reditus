"use strict";
// Proveedores de video intercambiables. Cada archivo de esta carpeta exporta
// la MISMA interfaz; para agregar uno nuevo se copia `simulado.js`, se cambia
// lo de adentro y se pone su nombre en PROVEEDOR del `.env`.
//
//   module.exports = {
//     nombre: "mi-proveedor",
//
//     // Devuelve un texto con lo que falta (clave, etc.) o null si está listo.
//     comprobar(cfg) { return null; },
//
//     // Genera UNA escena y deja el clip en `ctx.carpeta/ctx.salida` (MP4).
//     async generarEscena(ctx) {
//       return { segundos, modelo, costoUsd };
//       //  segundos  segundos de video pedidos al proveedor (lo que se cobra)
//       //  modelo    identificador del modelo usado
//       //  costoUsd  costo estimado de esta escena, o null si no se conoce la tarifa
//     },
//   };
//
//   ctx = {
//     cfg, registro, ff,            configuración, registro y ffmpeg
//     trabajo, escena,              el trabajo del CRM y la escena { n, nombre, prompt, duracion, usaImagenProducto, voz }
//     carpeta, salida,              dónde dejar el clip (carpeta del trabajo + nombre del archivo)
//     ancho, alto, relacion,        tamaño final del video y su relación («9:16»)
//     memoria,                      lo que este proveedor guardó de esta escena en un intento anterior
//     recordar(obj),                guarda datos de la escena en disco (p. ej. el id de la petición, para no pagarla dos veces)
//     latir(detalle),               avisa al CRM que el trabajo sigue vivo (llamar en esperas largas)
//     primerFotograma,              true en la etapa «clips» del proyecto por escenas: trabajo.imagenesProducto[0] es la
//                                   imagen base YA aprobada y debe ser el primer fotograma del clip (imagen a video)
//   }
const fs = require("fs");
const path = require("path");

function cargarProveedor(nombre) {
  if (!/^[a-z0-9-]+$/.test(nombre)) throw new Error(`PROVEEDOR inválido: «${nombre}».`);
  const archivo = path.join(__dirname, `${nombre}.js`);
  if (nombre === "index" || !fs.existsSync(archivo)) {
    const hay = fs
      .readdirSync(__dirname)
      .filter((f) => f.endsWith(".js") && f !== "index.js")
      .map((f) => f.slice(0, -3));
    throw new Error(`No existe el proveedor «${nombre}». Disponibles: ${hay.join(", ")}.`);
  }
  const p = require(archivo);
  if (typeof p.generarEscena !== "function" || typeof p.comprobar !== "function") {
    throw new Error(`El proveedor «${nombre}» no cumple la interfaz (faltan comprobar o generarEscena).`);
  }
  return p;
}

module.exports = { cargarProveedor };
