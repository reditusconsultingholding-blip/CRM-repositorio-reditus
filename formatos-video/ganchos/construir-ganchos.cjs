#!/usr/bin/env node
// Banco de ganchos (aperturas de 3 s). Valida `ganchos.json` y lo copia a donde lo lee el CRM.
//
//   node formatos-video/ganchos/construir-ganchos.cjs            valida y copia
//   node formatos-video/ganchos/construir-ganchos.cjs --revisar  solo valida
//
// CÓMO REFRESCAR LA INVESTIGACIÓN (cada 2 o 3 meses, o cuando los videos dejen de frenar el scroll):
//  1. Buscar qué aperturas de anuncios verticales están funcionando (guías recientes de TikTok/Meta,
//     bibliotecas de anuncios de la categoría, los anuncios más longevos que trae la investigación del CRM).
//  2. Editar `ganchos.json`: agregar, ajustar o quitar ganchos; subir `version`; poner la fecha en
//     `investigado` y las páginas consultadas en `fuentes`.
//  3. Cada gancho describe un TIPO de toma que se recrea con el producto real. Sin marcas, creadores,
//     música ni material de terceros. Las cifras solo salen de la página del producto o del cliente.
//  4. Correr este archivo. Los proyectos ya creados conservan su gancho; los nuevos usan el banco nuevo.
const fs = require("fs");
const path = require("path");

const ORIGEN = path.join(__dirname, "ganchos.json");
const DESTINO = path.join(__dirname, "..", "..", "src", "lib", "video-formatos", "ganchos.json");
const TRANSICIONES = ["corte", "zoom", "barrido", "flash", "glitch", "deslizar", "fundido"];
const CAMPOS = ["id", "nombre", "cuando", "como", "promptImagen", "promptClip", "frase", "riesgos"];

const banco = JSON.parse(fs.readFileSync(ORIGEN, "utf8"));
const errores = [];
if (!/^\d{4}-\d{2}-\d{2}$/.test(banco.investigado || "")) errores.push("`investigado` debe ser una fecha AAAA-MM-DD");
if (!Array.isArray(banco.fuentes) || !banco.fuentes.length) errores.push("faltan `fuentes`");
const ids = new Set();
for (const g of banco.ganchos || []) {
  for (const c of CAMPOS) if (typeof g[c] !== "string" || !g[c].trim()) errores.push(`${g.id || "?"}: falta «${c}»`);
  if (ids.has(g.id)) errores.push(`${g.id}: id repetido`);
  ids.add(g.id);
  if (!/^[a-z0-9-]+$/.test(g.id || "")) errores.push(`${g.id}: el id solo lleva minúsculas, números y guiones`);
  if ((g.frase || "").trim().split(/\s+/).length > 5) errores.push(`${g.id}: la frase tipo pasa de 5 palabras`);
  if (!/\{producto\}/.test(g.promptImagen || "") || !/\{producto\}/.test(g.promptClip || "")) errores.push(`${g.id}: los prompts deben nombrar {producto}`);
  for (const m of ["0–1 s", "2–3 s", "4–5 s", "6–7 s"]) if (!(g.promptClip || "").includes(m)) errores.push(`${g.id}: al prompt del clip le falta el momento «${m}»`);
  if (!Array.isArray(g.palabras) || !g.palabras.length) errores.push(`${g.id}: faltan «palabras» para elegirlo`);
  if (g.transicion && !TRANSICIONES.includes(g.transicion)) errores.push(`${g.id}: transición desconocida «${g.transicion}»`);
}
if ((banco.ganchos || []).length < 6) errores.push("el banco necesita al menos 6 ganchos");
if (errores.length) {
  console.error("Banco de ganchos con errores:\n- " + errores.join("\n- "));
  process.exit(1);
}
if (!process.argv.includes("--revisar")) fs.writeFileSync(DESTINO, JSON.stringify(banco, null, 2) + "\n", "utf8");
console.log(`Banco de ganchos v${banco.version} (${banco.investigado}): ${banco.ganchos.length} ganchos${process.argv.includes("--revisar") ? " · solo revisión" : " · copiado al CRM"}`);
