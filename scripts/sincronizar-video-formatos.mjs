#!/usr/bin/env node
// Trae al CRM la biblioteca de formatos de video (sección «Crear video»).
//
// Fuente:  carpeta `formatos-video/` de este repositorio (un .md por formato).
// Destino: src/lib/video-formatos/formatos.json  (NO se edita a mano).
//
// Uso, desde la carpeta del CRM:
//   node scripts/sincronizar-video-formatos.mjs [ruta-de-la-carpeta]
//
// La ruta del repositorio se toma, en este orden, del primer argumento, de la
// variable VIDEO_FORMATOS_DIR o de ./formatos-video. Si esa carpeta todavía no
// existe, usa la ubicación anterior (../Projects/reditus-video-formatos).
//
// Qué hace: ejecuta `construir.cjs` en ese repositorio (valida los formatos y
// regenera formatos/index.json) y copia el índice aquí. Si la validación
// falla no copia nada. Después hay que revisar el cambio y publicar el CRM.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const crm = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(
  process.argv[2] ||
    process.env.VIDEO_FORMATOS_DIR ||
    (fs.existsSync(path.join(crm, "formatos-video", "construir.cjs"))
      ? path.join(crm, "formatos-video")
      : path.join(crm, "..", "Projects", "reditus-video-formatos")),
);
const constructor = path.join(repo, "construir.cjs");
const origen = path.join(repo, "formatos", "index.json");
const destino = path.join(crm, "src", "lib", "video-formatos", "formatos.json");

if (!fs.existsSync(constructor)) {
  console.error(`No encuentro construir.cjs en ${repo}. Pasa la ruta del repositorio como argumento.`);
  process.exit(1);
}

const r = spawnSync(process.execPath, [constructor], { cwd: repo, stdio: "inherit" });
if (r.status !== 0) {
  console.error("La validación de los formatos falló: no se copió nada al CRM.");
  process.exit(1);
}

const indice = JSON.parse(fs.readFileSync(origen, "utf8"));
if (!Array.isArray(indice.formatos) || !indice.formatos.length) {
  console.error("El índice no trae formatos: no se copió nada.");
  process.exit(1);
}

fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, JSON.stringify(indice, null, 2) + "\n", "utf8");
console.log(`\nCopiado a ${path.relative(crm, destino)} · ${indice.formatos.length} formatos · versión ${indice.version}`);
