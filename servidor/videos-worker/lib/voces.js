"use strict";
// Elegir SOLO la voz de ElevenLabs según el país del proyecto. Con la clave basta: el ID de voz ya no
// es obligatorio.
//
// Orden para decidir la voz de un video:
//   1. `contexto.voz.vozId` del trabajo (si el CRM quiere una concreta).
//   2. La que una persona fijó para ese país y sexo (`datos\voces.json`, o `voz.porPais` en config.json).
//   3. `ELEVENLABS_VOICE_ID` del .env, si está (una voz fija para todo).
//   4. AUTOMÁTICO: se le pregunta a ElevenLabs por voces en español del acento del país (primero las de
//      la cuenta, después la biblioteca compartida), se puntúan y se toma la mejor. Si es de la
//      biblioteca, se añade a la cuenta. La elección queda guardada en `datos\voces.json` por país y
//      sexo: el mismo país usa siempre la misma voz, hasta que alguien la cambie.
//
// España → español peninsular; México, Colombia, Argentina, Chile, Perú y Ecuador → su acento; si no
// hay del país exacto (o es otro país), español latino neutro.
//
// VERIFICADO contra la documentación oficial (elevenlabs.io/docs/api-reference, leída en octubre de 2026),
// SIN ninguna llamada real:
//   · Voces de la cuenta:   GET /v2/voices?page_size=100[&next_page_token=…]
//        → { voices: [{ voice_id, name, category, labels: { accent, gender, age, language, use_case },
//            preview_url, verified_languages: [{ language, accent, locale, preview_url }] }], has_more, next_page_token }
//   · Biblioteca compartida: GET /v1/shared-voices?language=es&locale=es-ES&gender=female&page_size=100&sort=usage_character_count_1y
//        → { voices: [{ public_owner_id, voice_id, name, accent, gender, age, descriptive, use_case, category,
//            language, locale, preview_url, usage_character_count_1y, cloned_by_count, free_users_allowed,
//            is_added_by_user, verified_languages }], has_more }
//   · Añadir a la cuenta:   POST /v1/voices/add/{public_owner_id}/{voice_id}  { new_name } → { voice_id }
// POR VERIFICAR con la primera llamada real:
//   · Los VALORES de los filtros y etiquetas (`gender`: female/male; `locale`: es-ES, es-MX…; `accent`:
//     peninsular, mexican, colombian, latin american…): la documentación da los campos pero no la lista
//     de valores. Por eso aquí se filtra poco en la petición y se puntúa por texto al recibir.
//   · Que el plan de la cuenta permita añadir voces de la biblioteca (hay un cupo de voces); si no deja,
//     se prueba con la siguiente candidata y, en último caso, con una voz que ya esté en la cuenta.
//   · Que la voz elegida suene bien: son etiquetas de quien la publicó. Por eso se puede fijar otra a mano
//     (`.\probar.ps1 -Voces ES` lista 5 candidatas con su muestra).
const fs = require("fs");
const path = require("path");
const { codigoPais, POR_PAIS } = require("./habla");

const BASE = "https://api.elevenlabs.io";
// Cómo se reconoce el acento de cada país en las etiquetas de una voz (texto libre de quien la publicó).
const ACENTOS = {
  ES: { locale: "es-ES", claves: ["peninsular", "castilian", "castellano", "spain", "espana", "european spanish", "iberian"] },
  MX: { locale: "es-MX", claves: ["mexic"] },
  CO: { locale: "es-CO", claves: ["colombia"] },
  AR: { locale: "es-AR", claves: ["argentin", "rioplatense"] },
  CL: { locale: "es-CL", claves: ["chile"] },
  PE: { locale: "es-PE", claves: ["peru"] },
  EC: { locale: "es-EC", claves: ["ecuador", "ecuatorian"] },
};
const NEUTRO = { locale: "es-419", claves: ["latin american", "latinoamerican", "latino", "neutral", "neutro", "standard"] };
const USOS_BUENOS = ["narrat", "advert", "commercial", "conversational", "social", "informative", "educational", "entertainment"];

const plano = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const sexoNormal = (s) => (/^(h|masc|male|man)/.test(plano(s)) ? "hombre" : /^(m|f|wom)/.test(plano(s)) ? "mujer" : "");
const generoApi = (sexo) => (sexo === "hombre" ? "male" : sexo === "mujer" ? "female" : "");

/** El sexo de la voz que pide el trabajo: `contexto.voz.sexo` o, si no, lo que diga la descripción. */
function sexoDelTrabajo(trabajo) {
  const v = (trabajo && trabajo.contexto && trabajo.contexto.voz) || {};
  const directo = sexoNormal(v.sexo);
  if (directo) return directo;
  const d = plano(v.descripcion);
  if (/\b(hombre|masculin|varon|locutor\b|chico|senor\b)/.test(d)) return "hombre";
  if (/\b(mujer|femenin|locutora|chica|senora)/.test(d)) return "mujer";
  return "";
}

/** El país del proyecto (ES, MX…) según el trabajo. */
function paisDelTrabajo(trabajo) {
  const c = (trabajo && trabajo.contexto) || {};
  const v = c.voz || {};
  return codigoPais(v.pais) || codigoPais((/[-_]([a-z]{2})$/i.exec(v.idioma || "") || [])[1]) || codigoPais(c.pais) || codigoPais(trabajo && trabajo.pais) || "";
}

async function api(cfg, metodo, ruta, cuerpo) {
  // `elevenBase` solo lo ponen las pruebas locales (nunca el .env ni config.json).
  const res = await fetch((cfg.elevenBase || BASE) + ruta, { method: metodo, headers: { "xi-api-key": cfg.elevenKey, ...(cuerpo ? { "content-type": "application/json" } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined, signal: AbortSignal.timeout(60000) });
  const texto = await res.text();
  if (!res.ok) throw Object.assign(new Error(`ElevenLabs respondió ${res.status}: ${texto.slice(0, 160)}`), { estado: res.status });
  try {
    return texto ? JSON.parse(texto) : {};
  } catch {
    throw new Error("ElevenLabs devolvió algo que no es JSON");
  }
}

/** Una voz de cualquiera de las dos listas, en una forma común. */
function normalizar(v, deLaCuenta) {
  const et = v.labels || {};
  const verif = Array.isArray(v.verified_languages) ? v.verified_languages : [];
  return {
    id: String(v.voice_id || ""),
    dueno: v.public_owner_id || null,
    nombre: String(v.name || "").trim(),
    deLaCuenta: !!deLaCuenta || v.is_added_by_user === true,
    genero: plano(v.gender || et.gender),
    acento: plano(v.accent || et.accent),
    idioma: plano(v.language || et.language),
    locales: [v.locale, ...verif.map((x) => x && x.locale)].filter(Boolean).map((x) => String(x).toLowerCase()),
    idiomas: [v.language || et.language, ...verif.map((x) => x && x.language)].filter(Boolean).map(plano),
    acentosVerificados: verif.map((x) => plano(x && x.accent)).filter(Boolean),
    uso: plano(v.use_case || et.use_case),
    descriptivo: plano(v.descriptive || et.descriptive || et.description),
    categoria: plano(v.category),
    usoAnual: Number(v.usage_character_count_1y) || 0,
    clonada: Number(v.cloned_by_count) || 0,
    libre: v.free_users_allowed !== false,
    muestra: v.preview_url || (verif.find((x) => x && /^es/i.test(x.locale || x.language || "")) || {}).preview_url || null,
  };
}

/** Qué tan buena es una voz para un país y un sexo. Devuelve { puntos, acento: "pais" | "neutro" | "otro" } o null si no sirve. */
function puntuar(v, pais, sexo) {
  const habla = v.idiomas.some((i) => i === "es" || i.startsWith("spa") || i.startsWith("espa")) || v.locales.some((l) => l.startsWith("es"));
  if (!v.id || !habla) return null;
  const g = generoApi(sexo);
  if (g && v.genero && v.genero !== g) return null; // se pidió el otro sexo
  const A = ACENTOS[pais] || null;
  const tiene = (def) => def && (v.locales.includes(def.locale.toLowerCase()) || def.claves.some((c) => v.acento.includes(c) || v.acentosVerificados.some((a) => a.includes(c))));
  let puntos = 0;
  let acento = "otro";
  if (tiene(A)) {
    puntos += 60;
    acento = "pais";
  } else if (tiene(NEUTRO) || (!v.acento && !v.locales.some((l) => /^es-[a-z]{2}$/.test(l)))) {
    puntos += pais === "ES" ? 5 : 30; // el neutro latino no sirve bien para España
    acento = "neutro";
  } else if (pais !== "ES" && !Object.values(ACENTOS).some((d) => d !== A && d.locale !== "es-ES" && tiene(d)) && !tiene(ACENTOS.ES)) puntos += 10;
  if (g && v.genero === g) puntos += 15;
  if (USOS_BUENOS.some((u) => v.uso.includes(u))) puntos += 12; // narración, anuncio, conversacional…
  if (/(professional|high_quality)/.test(v.categoria)) puntos += 8;
  if (v.usoAnual > 0) puntos += Math.min(20, Math.log10(v.usoAnual + 1) * 2.5); // «bien valorada»: la que más se usa
  if (v.clonada > 0) puntos += Math.min(6, Math.log10(v.clonada + 1) * 2);
  if (v.deLaCuenta) puntos += 6; // ya está en la cuenta: no hay que añadirla
  if (!v.libre) puntos -= 4;
  return { puntos: Math.round(puntos * 10) / 10, acento };
}

/**
 * Las mejores voces para un país y un sexo: primero se miran las de la cuenta y la biblioteca compartida.
 * Devuelve [{ id, dueno, nombre, puntos, acento, genero, uso, muestra, deLaCuenta }] de mejor a peor.
 */
async function candidatas(cfg, { pais = "", sexo = "", cuantas = 5 } = {}) {
  const vistas = new Map();
  const meter = (lista, deLaCuenta) => {
    for (const cruda of lista || []) {
      const v = normalizar(cruda, deLaCuenta);
      if (v.id && !vistas.has(v.id)) vistas.set(v.id, v);
    }
  };
  // 1. Las de la cuenta.
  try {
    let ficha = "";
    for (let p = 0; p < 5; p++) {
      const j = await api(cfg, "GET", `/v2/voices?page_size=100${ficha ? `&next_page_token=${encodeURIComponent(ficha)}` : ""}`);
      meter(j.voices, true);
      if (!j.has_more || !j.next_page_token) break;
      ficha = j.next_page_token;
    }
  } catch (e) {
    if (e.estado === 401 || e.estado === 403) throw e; // clave mala: no tiene sentido seguir
  }
  // 2. La biblioteca compartida: en español, las más usadas; primero las del acento del país y después todas.
  const g = generoApi(sexo);
  const A = ACENTOS[pais];
  const consultas = [];
  if (A) consultas.push(`language=es&locale=${A.locale}`);
  consultas.push(`language=es`);
  for (const q of consultas) {
    try {
      const j = await api(cfg, "GET", `/v1/shared-voices?${q}${g ? `&gender=${g}` : ""}&page_size=100&sort=usage_character_count_1y`);
      meter(j.voices, false);
    } catch (e) {
      if (e.estado === 401 || e.estado === 403) throw e;
    }
  }
  return [...vistas.values()]
    .map((v) => ({ v, p: puntuar(v, pais, sexo) }))
    .filter((x) => x.p)
    .sort((a, b) => b.p.puntos - a.p.puntos || a.v.nombre.localeCompare(b.v.nombre))
    .slice(0, cuantas)
    .map(({ v, p }) => ({ id: v.id, dueno: v.dueno, nombre: v.nombre, puntos: p.puntos, acento: p.acento, genero: v.genero, uso: v.uso, muestra: v.muestra, deLaCuenta: v.deLaCuenta }));
}

// --------------------------------------------------------- lo elegido ----
const archivoVoces = (cfg) => path.join(cfg.carpetas.datos, "voces.json");
function leerElegidas(cfg) {
  try {
    return JSON.parse(fs.readFileSync(archivoVoces(cfg), "utf8")) || {};
  } catch {
    return {};
  }
}
function guardarElegida(cfg, clave, voz) {
  const todo = leerElegidas(cfg);
  todo[clave] = voz;
  fs.mkdirSync(cfg.carpetas.datos, { recursive: true });
  fs.writeFileSync(`${archivoVoces(cfg)}.tmp`, JSON.stringify(todo, null, 1));
  fs.renameSync(`${archivoVoces(cfg)}.tmp`, archivoVoces(cfg));
}
const claveDe = (pais, sexo) => `${pais || "otro"}|${sexo || "cualquiera"}`;
const acentoDicho = (pais, tipo) => (tipo === "pais" && POR_PAIS[pais] ? POR_PAIS[pais].replace(/\s*\(.*\)$/, "") : tipo === "neutro" ? "español latino neutro" : "español");

/** Añade a la cuenta una voz de la biblioteca compartida. Devuelve el ID con el que queda. */
async function anadir(cfg, c) {
  if (c.deLaCuenta || !c.dueno) return c.id;
  const j = await api(cfg, "POST", `/v1/voices/add/${encodeURIComponent(c.dueno)}/${encodeURIComponent(c.id)}`, { new_name: `${c.nombre}`.slice(0, 60) || "Voz Reditus" });
  return (j && j.voice_id) || c.id;
}

const enCurso = new Map(); // una sola elección a la vez por país y sexo, aunque haya varios armados
/**
 * La voz con la que se narra este trabajo: { id, nombre, acento, origen, pais, automatica }.
 * Lanza solo si no hay forma de conseguir una voz (clave mala o ElevenLabs caído).
 */
async function vozDelProyecto(cfg, trabajo, registro = null) {
  const V = cfg.config.voz || {};
  const c = (trabajo && trabajo.contexto && trabajo.contexto.voz) || {};
  const pais = paisDelTrabajo(trabajo);
  const sexo = sexoDelTrabajo(trabajo);
  const valido = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{6,60}$/.test(id);
  if (valido(c.vozId)) return { id: c.vozId, nombre: "", acento: acentoDicho(pais, "pais"), origen: "la que pidió el proyecto", pais };
  const clave = claveDe(pais, sexo);
  const fijas = (Array.isArray((V.porPais || {})[pais]) ? V.porPais[pais] : []).filter((v) => v && valido(v.id));
  const fija = fijas.find((v) => !sexo || v.sexo === sexo) || fijas[0];
  if (fija) return { id: fija.id, nombre: fija.nombre || "", acento: acentoDicho(pais, "pais"), origen: "config.json", pais };
  const guardada = leerElegidas(cfg)[clave];
  if (guardada && valido(guardada.id)) return { ...guardada, origen: guardada.fijadaAMano ? "fijada a mano" : "elegida automáticamente", pais };
  if (valido(cfg.elevenVoz)) return { id: cfg.elevenVoz, nombre: "", acento: "voz fija del servidor", origen: "ELEVENLABS_VOICE_ID", pais };

  if (!enCurso.has(clave)) {
    enCurso.set(
      clave,
      (async () => {
        const lista = await candidatas(cfg, { pais, sexo, cuantas: 5 });
        let elegida = null;
        for (const cand of lista.slice(0, 3)) {
          try {
            elegida = { id: await anadir(cfg, cand), nombre: cand.nombre, acento: acentoDicho(pais, cand.acento), sexo: sexo || "", elegidaAt: new Date().toISOString(), muestra: cand.muestra || null };
            break;
          } catch (e) {
            if (registro) registro.aviso(`voces: no se pudo añadir «${cand.nombre}» a la cuenta (${registro.limpiar(e.message).slice(0, 120)}); se prueba la siguiente`);
          }
        }
        // Ninguna de la biblioteca se pudo añadir: la mejor que YA esté en la cuenta.
        if (!elegida) {
          const propia = lista.find((x) => x.deLaCuenta) || (await candidatas(cfg, { pais: "", sexo: "", cuantas: 20 })).find((x) => x.deLaCuenta);
          if (propia) elegida = { id: propia.id, nombre: propia.nombre, acento: acentoDicho(pais, propia.acento), sexo: sexo || "", elegidaAt: new Date().toISOString(), muestra: propia.muestra || null };
        }
        if (!elegida) throw new Error("ElevenLabs no devolvió ninguna voz en español que se pueda usar con esta cuenta. Fija una a mano con  .\\probar.ps1 -Voces <país>  o pon ELEVENLABS_VOICE_ID en el .env.");
        guardarElegida(cfg, clave, elegida);
        if (registro) registro.info(`voces: para ${pais || "país sin definir"}${sexo ? ` (${sexo})` : ""} se eligió «${elegida.nombre}» (${elegida.acento}); queda guardada en datos\\voces.json`);
        return elegida;
      })().finally(() => enCurso.delete(clave)),
    );
  }
  const e = await enCurso.get(clave);
  return { ...e, origen: "elegida automáticamente", pais, automatica: true };
}

/** Fija a mano la voz de un país y sexo (la añade a la cuenta si viene de la biblioteca). */
async function fijar(cfg, { pais, sexo = "", id }) {
  const lista = await candidatas(cfg, { pais, sexo, cuantas: 50 });
  const c = lista.find((x) => x.id === id) || { id, dueno: null, nombre: "", acento: "pais", deLaCuenta: true };
  const elegida = { id: await anadir(cfg, c), nombre: c.nombre, acento: acentoDicho(pais, c.acento), sexo, elegidaAt: new Date().toISOString(), muestra: c.muestra || null, fijadaAMano: true };
  guardarElegida(cfg, claveDe(pais, sexo), elegida);
  return elegida;
}

module.exports = { candidatas, vozDelProyecto, fijar, puntuar, normalizar, sexoDelTrabajo, paisDelTrabajo, leerElegidas, claveDe, ACENTOS };
