#!/usr/bin/env node
// Lee formatos/*.md (frontmatter + secciones) y REGLAS_COMUNES.md, valida y
// escribe formatos/index.json, que es lo que consume el CRM.
//
//   node construir.cjs            genera formatos/index.json
//   node construir.cjs --revisar  solo valida (sale con código 1 si algo falla)
//
// Sin dependencias: el frontmatter admite solo `clave: valor` y listas en
// línea `[a, b, c]` (los elementos no pueden llevar comas).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RAIZ = __dirname;
const DIR = path.join(RAIZ, "formatos");
const SALIDA = path.join(DIR, "index.json");

const OBLIGATORIOS = ["slug", "nombre", "estado", "para_que_sirve", "duracion", "relacion_aspecto", "necesita", "producto_en_pantalla", "cierre", "riesgos", "modelo_imagen", "modelo_video", "modelo_voz", "modelo_musica", "duracion_clip", "audio_del_clip"];
const ESTADOS = ["confirmado", "por confirmar"];
// La columna vertebral: toda estructura tiene estos cinco pasos, en este orden.
const PASOS = ["Impacto", "Bajada", "Refuerzo", "Subida", "CTA"];
const SECCIONES = {
  que_es: "Qué es",
  cuando_si: "Cuándo usarlo",
  cuando_no: "Cuándo no",
  estructura: "Estructura escena por escena",
  reglas_visuales: "Reglas visuales",
  plantilla: "Plantilla de guion",
  prompts: "Prompts para modelo de video",
};

function sinComillas(v) {
  const t = v.trim();
  return /^".*"$/.test(t) || /^'.*'$/.test(t) ? t.slice(1, -1) : t;
}

function leerFrontmatter(texto, archivo) {
  const m = texto.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${archivo}: falta el frontmatter (--- … ---)`);
  const datos = {};
  for (const linea of m[1].split("\n")) {
    if (!linea.trim() || linea.trim().startsWith("#")) continue;
    const i = linea.indexOf(":");
    if (i < 1) throw new Error(`${archivo}: línea de frontmatter inválida: «${linea}»`);
    const clave = linea.slice(0, i).trim();
    const valor = linea.slice(i + 1).trim();
    datos[clave] = /^\[.*\]$/.test(valor)
      ? valor.slice(1, -1).split(",").map(sinComillas).filter(Boolean)
      : sinComillas(valor);
  }
  return { datos, cuerpo: m[2].trim() };
}

/** Parte el cuerpo por títulos `## `. */
function secciones(cuerpo) {
  const out = {};
  let actual = null;
  for (const linea of cuerpo.split("\n")) {
    const t = linea.match(/^## (.+)$/);
    if (t) {
      actual = t[1].trim();
      out[actual] = [];
    } else if (actual) out[actual].push(linea);
  }
  for (const k of Object.keys(out)) out[k] = out[k].join("\n").trim();
  return out;
}

function vinetas(texto) {
  return texto
    .split("\n")
    .filter((l) => /^- /.test(l))
    .map((l) => l.slice(2).trim());
}

function tabla(texto) {
  const filas = texto.split("\n").filter((l) => l.trim().startsWith("|"));
  return filas.slice(2).map((f) => {
    const c = f.split("|").slice(1, -1).map((x) => x.trim());
    return { tiempo: c[0] ?? "", escena: c[1] ?? "", que_pasa: c[2] ?? "", fuente: c[3] ?? "" };
  });
}

function primerBloque(texto) {
  const m = texto.match(/```[a-z]*\n([\s\S]*?)\n```/);
  return m ? m[1].trim() : "";
}

function promptsPorEscena(texto) {
  const out = [];
  const partes = texto.split(/^### /m).slice(1);
  for (const p of partes) {
    const salto = p.indexOf("\n");
    const escena = p.slice(0, salto).trim();
    const prompt = primerBloque(p.slice(salto));
    if (escena && prompt) out.push({ escena, prompt });
  }
  return out;
}

function construir() {
  const errores = [];
  const formatos = [];
  const archivos = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .sort();

  for (const archivo of archivos) {
    try {
      const { datos, cuerpo } = leerFrontmatter(fs.readFileSync(path.join(DIR, archivo), "utf8"), archivo);
      for (const k of OBLIGATORIOS) {
        const v = datos[k];
        if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) errores.push(`${archivo}: falta «${k}»`);
      }
      if (datos.slug && `${datos.slug}.md` !== archivo) errores.push(`${archivo}: el slug «${datos.slug}» no coincide con el nombre del archivo`);
      if (datos.estado && !ESTADOS.includes(datos.estado)) errores.push(`${archivo}: estado debe ser ${ESTADOS.join(" o ")}`);
      for (const k of ["necesita", "riesgos"]) {
        if (datos[k] !== undefined && !Array.isArray(datos[k])) errores.push(`${archivo}: «${k}» debe ser una lista [a, b]`);
      }

      const s = secciones(cuerpo);
      for (const titulo of Object.values(SECCIONES)) {
        if (!s[titulo]) errores.push(`${archivo}: falta la sección «## ${titulo}»`);
      }
      const estructura = tabla(s[SECCIONES.estructura] ?? "");
      const plantilla = primerBloque(s[SECCIONES.plantilla] ?? "");
      const prompts = promptsPorEscena(s[SECCIONES.prompts] ?? "");
      if (!estructura.length) errores.push(`${archivo}: la tabla de estructura está vacía`);
      if (!plantilla) errores.push(`${archivo}: falta el bloque de la plantilla de guion`);
      if (!/\{\{producto\}\}/.test(plantilla)) errores.push(`${archivo}: la plantilla no usa {{producto}}`);
      if (!prompts.length) errores.push(`${archivo}: no hay prompts por escena`);
      if (estructura.map((e) => e.escena).join("|") !== PASOS.join("|")) {
        errores.push(`${archivo}: la estructura debe tener exactamente los pasos ${PASOS.join(" → ")}`);
      }
      for (let n = 1; n <= PASOS.length; n++) {
        if (!new RegExp(`^PASO ${n} · ${PASOS[n - 1].toUpperCase()}`, "m").test(plantilla)) {
          errores.push(`${archivo}: a la plantilla le falta el rótulo «PASO ${n} · ${PASOS[n - 1].toUpperCase()}»`);
        }
      }
      if (!/PRODUCTO EN PANTALLA/.test(plantilla)) errores.push(`${archivo}: la plantilla no dice cuándo se ve el producto real (PRODUCTO EN PANTALLA)`);
      // El cierre (paso 5) es obligatorio: oferta dicha y escrita, llamado a la acción y producto real, mínimo 5 s.
      const p5 = estructura[4];
      if (p5) {
        if (!/oferta/i.test(p5.que_pasa) || !/llamado a la acci[oó]n/i.test(p5.que_pasa) || !/producto real/i.test(p5.que_pasa)) {
          errores.push(`${archivo}: la fila del paso 5 debe nombrar la oferta, el llamado a la acción y el producto real en pantalla`);
        }
        const m = p5.tiempo.match(/^(\d+)(?::(\d+))?\s*[–-]\s*(\d+)(?::(\d+))?/);
        const seg = (a, b) => (b === undefined ? Number(a) : Number(a) * 60 + Number(b));
        if (!m || seg(m[3], m[4]) - seg(m[1], m[2]) < 5) errores.push(`${archivo}: el paso 5 debe durar al menos 5 s (tiene «${p5.tiempo}»)`);
      }
      for (const [rotulo, variable] of [["OFERTA EN VOZ Y EN PANTALLA", "oferta"], ["LLAMADO A LA ACCIÓN", "llamado"], ["CIERRE", "producto"]]) {
        if (!new RegExp(`^\\s*${rotulo}:.*\\{\\{${variable}\\}\\}`, "m").test(plantilla)) {
          errores.push(`${archivo}: a la plantilla le falta la línea «${rotulo}: … {{${variable}}}» en el paso 5`);
        }
      }
      const cierre = prompts.find((x) => /^Cierre/i.test(x.escena));
      if (!cierre || !/foto real/.test(cierre.prompt) || !/\{\{oferta\}\}/.test(cierre.prompt) || !/\{\{llamado\}\}/.test(cierre.prompt)) {
        errores.push(`${archivo}: falta el prompt «Cierre · …» con la foto real del producto, {{oferta}} y {{llamado}}`);
      }
      const vetado = /pixar|disney|dreamworks|aardman|laika|zack\s*d|minecraft|simpson/i;
      const visible = [datos.nombre, datos.para_que_sirve, plantilla, ...prompts.map((x) => `${x.escena} ${x.prompt}`)].join("\n");
      const hallado = visible.match(vetado);
      if (hallado) errores.push(`${archivo}: nombra a un tercero («${hallado[0]}») en el nombre, la plantilla o un prompt; describe el estilo con rasgos propios`);
      if (!prompts.some((x) => /foto real/.test(x.prompt))) errores.push(`${archivo}: ningún prompt usa la foto real del producto`);

      formatos.push({
        slug: datos.slug,
        nombre: datos.nombre,
        estado: datos.estado,
        confianza: datos.confianza ?? "",
        para_que_sirve: datos.para_que_sirve,
        duracion: datos.duracion,
        relacion_aspecto: datos.relacion_aspecto,
        etapa_embudo: datos.etapa_embudo ?? "",
        necesita: datos.necesita ?? [],
        producto_en_pantalla: datos.producto_en_pantalla ?? "",
        // Otros nombres con los que se conoce el formato (o slugs que se fusionaron en este).
        cierre: datos.cierre ?? "",
        alias: Array.isArray(datos.alias) ? datos.alias : [],
        // Qué modelo usar por tipo. El detalle técnico está en MODELOS-KIE.md.
        modelos_sugeridos: {
          imagen: datos.modelo_imagen ?? "",
          video: datos.modelo_video ?? "",
          voz: datos.modelo_voz ?? "",
          musica: datos.modelo_musica ?? "",
        },
        duracion_clip: datos.duracion_clip ?? "",
        audio_del_clip: datos.audio_del_clip ?? "",
        riesgos: datos.riesgos ?? [],
        fuentes: datos.fuentes ?? [],
        que_es: s[SECCIONES.que_es] ?? "",
        cuando_si: vinetas(s[SECCIONES.cuando_si] ?? ""),
        cuando_no: vinetas(s[SECCIONES.cuando_no] ?? ""),
        estructura: estructura.map((e, i) => ({ paso: i + 1, ...e })),
        reglas_visuales: vinetas(s[SECCIONES.reglas_visuales] ?? ""),
        plantilla,
        prompts,
      });
    } catch (e) {
      errores.push(e.message);
    }
  }

  const repetidos = formatos
    .flatMap((f) => [f.slug, ...f.alias])
    .filter((s, i, a) => a.indexOf(s) !== i);
  if (repetidos.length) errores.push(`slugs o alias repetidos: ${repetidos.join(", ")}`);

  // Primero los confirmados; dentro de cada grupo, por nombre.
  formatos.sort((a, b) => (a.estado === b.estado ? a.nombre.localeCompare(b.nombre, "es") : a.estado === "confirmado" ? -1 : 1));

  const reglas = fs.readFileSync(path.join(RAIZ, "REGLAS_COMUNES.md"), "utf8").replace(/\r\n/g, "\n").trim();
  const contenido = { reglas_comunes: reglas, formatos };
  // La versión es una huella del contenido: cambia solo si cambió algo.
  const version = crypto.createHash("sha1").update(JSON.stringify(contenido)).digest("hex").slice(0, 10);
  return { errores, indice: { version, ...contenido } };
}

const { errores, indice } = construir();
if (errores.length) {
  console.error("No se generó el índice. Errores:\n- " + errores.join("\n- "));
  process.exit(1);
}
if (process.argv.includes("--revisar")) {
  console.log(`OK: ${indice.formatos.length} formatos válidos (versión ${indice.version}).`);
} else {
  fs.writeFileSync(SALIDA, JSON.stringify(indice, null, 2) + "\n", "utf8");
  console.log(`formatos/index.json · ${indice.formatos.length} formatos · versión ${indice.version}`);
  for (const f of indice.formatos) console.log(`  ${f.estado === "confirmado" ? "confirmado   " : "por confirmar"}  ${f.slug}`);
}
