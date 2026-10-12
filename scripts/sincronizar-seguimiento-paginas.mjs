// Copia al CRM la lista de páginas hechas por Reditus (antes y después) que
// vive en Pulso, para que «Seguimiento diario» asigne la página del día.
//
// Uso (desde la raíz del CRM):
//   node scripts/sincronizar-seguimiento-paginas.mjs
//   node scripts/sincronizar-seguimiento-paginas.mjs "D:/otra/ruta/final.json"
//
// Origen por defecto: C:/Users/Usuario/Projects/pulso/qa/contenido/final.json
// (lo arma qa/contenido/armar.cjs de Pulso). Cada fila es
//   [id, nombre, enlace del antes, enlace del después, tipo de antes, de dónde sale]
// Destino: src/lib/seguimiento-paginas.json (se importa en src/lib/seguimiento.ts).
//
// Las imágenes NO se copian: se muestran desde Pulso,
//   https://pulso.crmreditusconsulting.company/presentacion/ct-<id>-a.webp   (antes, miniatura)
//   https://pulso.crmreditusconsulting.company/presentacion/ct-<id>-d.webp   (después, miniatura)
//   …-al.webp y …-dl.webp son el recorrido largo de la página.
//
// Las de tipo «m» (referencia de mercado: tienda ajena, no es del cliente)
// quedan en el archivo con rotacion=false y no entran a la página del día.
//
// Ojo: la rotación depende del orden y de la cantidad de páginas en rotación.
// Al agregar páginas, los días ya registrados conservan la suya (queda
// guardada en el archivo del día); los días futuros se reacomodan.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ORIGEN = process.argv[2] || "C:/Users/Usuario/Projects/pulso/qa/contenido/final.json";
const DESTINO = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "seguimiento-paginas.json");

// Mismos rótulos que usa Pulso en la sección Contenido (ANTES_CONT).
const ROTULOS = {
  a: "Antes · página anterior del cliente",
  o: "Así se ven las otras páginas de esta tienda (sin Reditus)",
  b: "Antes · plantilla estándar del tema, sin el trabajo de Reditus",
  p: "Antes · página anterior de Reditus",
  m: "Referencia de mercado · así vende este producto otra tienda (no es del cliente)",
  c: "Antes: falta captura",
};

const filas = JSON.parse(readFileSync(ORIGEN, "utf8"));
if (!Array.isArray(filas) || !filas.length) throw new Error(`«${ORIGEN}» no trae una lista de páginas.`);

const vistos = new Set();
const paginas = filas.map((f, i) => {
  const [id, nombre, antes, despues, tipo, nota] = f;
  if (!/^[a-z0-9]+$/.test(String(id)) || !nombre || !/^https:\/\//.test(String(despues))) {
    throw new Error(`Fila ${i + 1} inválida: ${JSON.stringify(f).slice(0, 120)}`);
  }
  if (vistos.has(id)) throw new Error(`Id repetido: ${id}`);
  vistos.add(id);
  if (!ROTULOS[tipo]) throw new Error(`Tipo de antes desconocido «${tipo}» en ${id}`);
  return {
    id,
    nombre,
    antes: /^https:\/\//.test(String(antes)) ? antes : "",
    despues,
    tipo,
    rotulo: ROTULOS[tipo],
    nota: String(nota ?? ""),
    // Fuera de la rotación: referencia de mercado (no es del cliente) y las que no tienen captura del antes.
    rotacion: tipo !== "m" && tipo !== "c",
  };
});

const salida = {
  origen: "Pulso · qa/contenido/final.json",
  sincronizado: new Date().toISOString().slice(0, 10),
  imagenes: "https://pulso.crmreditusconsulting.company/presentacion/",
  paginas,
};
writeFileSync(DESTINO, JSON.stringify(salida, null, 2) + "\n");
const enRotacion = paginas.filter((p) => p.rotacion).length;
console.log(`${paginas.length} páginas copiadas · ${enRotacion} en rotación · ${paginas.length - enRotacion} fuera`);
