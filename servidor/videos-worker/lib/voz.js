"use strict";
// Narración con ElevenLabs. Se usa SOLO cuando el trabajo la pide (`contexto.voz.motor: "narracion"`
// u `opciones.voz: "elevenlabs"`) y el servidor tiene ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID.
// Sin clave, el video sigue con la voz del clip y lo avisa (lib/habla.js).
//
// Cómo se narra un video:
//   · UNA sola voz para todo el video (la misma `voice_id` en todas las escenas).
//   · Una petición por escena, con el texto de la escena anterior y de la siguiente como contexto
//     (`previous_text` / `next_text`), para que la entonación sea continua entre escenas.
//   · Con marcas de tiempo: la respuesta trae cuándo empieza y termina cada letra; de ahí salen
//     los tiempos de cada palabra para los subtítulos.
//   · Las cifras y símbolos se escriben como se dicen antes de mandar el texto («79 €» → «79 euros»,
//     «99,14 %» → «99,14 por ciento», «2x1» → «dos por uno»).
//
// VERIFICADO contra la documentación oficial (elevenlabs.io/docs/api-reference, leída el 16-oct-2026),
// SIN ninguna llamada real (aquí no hay clave):
//   POST https://api.elevenlabs.io/v1/text-to-speech/<voice_id>/with-timestamps?output_format=mp3_44100_128
//   cabeceras: xi-api-key, content-type: application/json
//   cuerpo: { text, model_id (por defecto eleven_multilingual_v2), voice_settings { stability,
//             similarity_boost, style, use_speaker_boost, speed }, previous_text, next_text,
//             apply_text_normalization: "auto" | "on" | "off", language_code }
//   respuesta: { audio_base64, alignment: { characters[], character_start_times_seconds[],
//                character_end_times_seconds[] }, normalized_alignment }
//   · `language_code` NO sirve con eleven_multilingual_v2 (ese modelo saca el idioma del texto): por eso
//     no se manda salvo que config.json lo pida para otro modelo.
// POR VERIFICAR con la primera llamada real (todo aislado en config.json → "voz"):
//   · El rango que acepta `speed` (la documentación no lo dice; aquí se usa 1.08 y se limita a 0.7–1.2).
//   · Que el plan de la cuenta permita `with-timestamps` (si responde 404/405, se usa la ruta sin
//     tiempos y los subtítulos van con tiempos estimados; se avisa).
//   · Que el acento salga del país con la voz elegida: el acento lo da sobre todo la VOZ, no el modelo.
//     Para castellano de España hay que elegir una voz española (config.json → voz.porPais).
//   · El costo: se cobra por carácter narrado según el plan (ver README).
const fs = require("fs");
const { esperar } = require("./red");
const { codigoPais } = require("./habla");

function disponible(cfg) {
  return !!(cfg.elevenKey && cfg.elevenVoz);
}

// Cómo se llama la moneda al decirla, por país.
const MONEDA = { ES: ["euro", "euros"], CO: ["peso", "pesos"], MX: ["peso", "pesos"], AR: ["peso", "pesos"], CL: ["peso", "pesos"], PE: ["sol", "soles"], EC: ["dólar", "dólares"], US: ["dólar", "dólares"] };
const UNIDADES = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce"];

/**
 * Escribe una palabra del guion como se DICE. Devuelve la palabra (o varias) ya hablable.
 * Solo toca cifras con símbolo; el resto va tal cual (el modelo lee bien los números sueltos).
 */
function decirPalabra(p, pais) {
  const [m1, mN] = MONEDA[pais] || ["dólar", "dólares"];
  const uno = (num) => /^1([.,]0+)?$/.test(num);
  let r;
  // 2x1, 3x2 → «dos por uno»
  if ((r = /^(\d{1,2})[xX×](\d{1,2})([.,;:!?…]*)$/.exec(p))) return `${UNIDADES[r[1]] || r[1]} por ${UNIDADES[r[2]] || r[2]}${r[3]}`;
  // 79€, 79,90€, €79 → «79 euros»
  if ((r = /^(\d[\d.,]*?)€([.,;:!?…]*)$/.exec(p)) || (r = /^€(\d[\d.,]*?)([.,;:!?…]*)$/.exec(p))) return `${r[1]} ${uno(r[1]) ? "euro" : "euros"}${r[2]}`;
  // US$20 → «20 dólares»; $89.900 → «89.900 pesos» (la moneda del país)
  if ((r = /^US\$(\d[\d.,]*?)([.,;:!?…]*)$/i.exec(p))) return `${r[1]} ${uno(r[1]) ? "dólar" : "dólares"}${r[2]}`;
  if ((r = /^\$(\d[\d.,]*?)([.,;:!?…]*)$/.exec(p)) || (r = /^(\d[\d.,]*?)\$([.,;:!?…]*)$/.exec(p))) return `${r[1]} ${uno(r[1]) ? m1 : mN}${r[2]}`;
  // 99,14% → «99,14 por ciento»
  if ((r = /^(\d[\d.,]*?)%([.,;:!?…]*)$/.exec(p))) return `${r[1]} por ciento${r[2]}`;
  if ((r = /^([€%$&+])([.,;:!?…]*)$/.exec(p))) return `${{ "€": "euros", "%": "por ciento", $: mN, "&": "y", "+": "más" }[r[1]]}${r[2]}`;
  return p;
}

/**
 * El texto del guion tal como se le manda a la voz.
 * Devuelve { texto, grupos, originales }: `grupos[i]` = cuántas palabras DICHAS corresponden a la
 * palabra i del guion (para devolverle a cada palabra escrita su tiempo, aunque «79€» se diga en dos).
 */
function paraDecir(texto, pais = "") {
  const originales = String(texto || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const grupos = [];
  const dichas = [];
  for (const [i, p] of originales.entries()) {
    let dicha = decirPalabra(p, codigoPais(pais) || pais);
    // «1 €» (el símbolo suelto después de un 1): en singular.
    if (/^[€$][.,;:!?…]*$/.test(p) && originales[i - 1] === "1") dicha = dicha.replace(/^euros/, "euro").replace(/^pesos/, "peso").replace(/^dólares/, "dólar").replace(/^soles/, "sol");
    const d = dicha.split(" ").filter(Boolean);
    grupos.push(d.length);
    dichas.push(...d);
  }
  return { texto: dichas.join(" "), grupos, originales };
}

/** De la alineación por letras de ElevenLabs a palabras con tiempo: [{ texto, inicio, fin }]. */
function palabrasDeAlineacion(al) {
  if (!al || !Array.isArray(al.characters)) return [];
  const ini = al.character_start_times_seconds || [];
  const fin = al.character_end_times_seconds || [];
  const salida = [];
  let actual = null;
  al.characters.forEach((c, i) => {
    if (/\s/.test(c)) {
      if (actual) salida.push(actual);
      actual = null;
      return;
    }
    if (!actual) actual = { texto: "", inicio: Number(ini[i]) || 0, fin: Number(fin[i]) || 0 };
    actual.texto += c;
    actual.fin = Number(fin[i]) || actual.fin;
  });
  if (actual) salida.push(actual);
  return salida;
}

/** Reparte los tiempos de las palabras dichas sobre las palabras del guion (según `grupos`). */
function tiemposDelGuion(originales, grupos, dichas) {
  if (!dichas.length || dichas.length !== grupos.reduce((a, b) => a + b, 0)) return null; // la voz dijo otra cantidad de palabras: no se adivina
  const salida = [];
  let k = 0;
  originales.forEach((texto, i) => {
    const tramo = dichas.slice(k, k + grupos[i]);
    k += grupos[i];
    if (tramo.length) salida.push({ texto, inicio: tramo[0].inicio, fin: tramo[tramo.length - 1].fin });
  });
  return salida;
}

/** La voz de este trabajo: la que mande el CRM, la del país en config.json, o la del .env. */
function vozPara(cfg, trabajo) {
  const V = cfg.config.voz || {};
  const c = (trabajo && trabajo.contexto && trabajo.contexto.voz) || {};
  const valido = (id) => typeof id === "string" && /^[A-Za-z0-9]{10,40}$/.test(id);
  const pais = codigoPais(c.pais) || codigoPais((/[-_]([a-z]{2})$/i.exec(c.idioma || "") || [])[1]) || codigoPais(trabajo && trabajo.contexto && trabajo.contexto.pais) || codigoPais(trabajo && trabajo.pais);
  if (valido(c.vozId)) return { id: c.vozId, origen: "el trabajo", pais };
  const sexo = /^(h|masc|male)/i.test(String(c.sexo || "")) ? "hombre" : /^(m|f)/i.test(String(c.sexo || "")) ? "mujer" : "";
  const lista = (Array.isArray((V.porPais || {})[pais]) ? V.porPais[pais] : []).filter((v) => v && valido(v.id));
  const elegida = lista.find((v) => !sexo || v.sexo === sexo) || lista[0];
  if (elegida) return { id: elegida.id, origen: `config.json (${pais}${elegida.nombre ? `, ${elegida.nombre}` : ""})`, pais };
  return { id: cfg.elevenVoz, origen: "ELEVENLABS_VOICE_ID", pais };
}

async function pedir(cfg, vozId, ruta, cuerpo, aceptar) {
  let ultimo;
  for (const espera of [0, 3000, 12000]) {
    if (espera) await esperar(espera);
    try {
      // `elevenBase` solo lo ponen las pruebas locales (nunca el .env ni config.json).
      const res = await fetch(`${cfg.elevenBase || "https://api.elevenlabs.io"}/v1/text-to-speech/${encodeURIComponent(vozId)}${ruta}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: aceptar, "xi-api-key": cfg.elevenKey },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        const detalle = (await res.text().catch(() => "")).slice(0, 200);
        const error = Object.assign(new Error(`ElevenLabs respondió ${res.status}: ${detalle}`), { estado: res.status });
        // Clave mala, sin saldo, o una ruta o un campo que no acepta: reintentar no lo arregla.
        if ([400, 401, 402, 403, 404, 405, 422].includes(res.status)) error.sinRemedio = true;
        throw error;
      }
      return res;
    } catch (e) {
      ultimo = e;
      if (e.sinRemedio) break;
    }
  }
  throw ultimo;
}

function ajustesDeVoz(cfg) {
  const o = cfg.config.voz || {};
  return {
    stability: o.estabilidad ?? 0.45,
    similarity_boost: o.similitud ?? 0.8,
    style: o.estilo ?? 0,
    use_speaker_boost: o.realce !== false,
    speed: Math.max(0.7, Math.min(1.2, o.velocidad ?? 1.08)),
  };
}

/** Genera el audio de un texto y lo guarda en `destino` (.mp3). Sin tiempos (la ruta de siempre). */
async function generar(cfg, texto, destino, vozId = cfg.elevenVoz) {
  const o = cfg.config.voz || {};
  const res = await pedir(cfg, vozId, "", { text: String(texto).slice(0, 2500), model_id: o.modelo || "eleven_multilingual_v2", voice_settings: ajustesDeVoz(cfg) }, "audio/mpeg");
  fs.writeFileSync(destino, Buffer.from(await res.arrayBuffer()));
  if (fs.statSync(destino).size < 500) throw new Error("ElevenLabs devolvió un audio vacío");
  return destino;
}

/**
 * Narra el texto de UNA escena. Guarda el MP3 en `destino` y devuelve
 *   { palabras: [{ texto, inicio, fin }] | null, conTiempos, caracteres }
 * `palabras` son las del GUION (no las normalizadas) con su tiempo dentro del audio; null si la
 * voz no devolvió tiempos (entonces los subtítulos se reparten por estimación).
 */
async function narrar(cfg, { texto, previo = "", siguiente = "", vozId, pais = "" }, destino) {
  const o = cfg.config.voz || {};
  const d = paraDecir(texto, pais);
  const cuerpo = {
    text: d.texto.slice(0, 2500),
    model_id: o.modelo || "eleven_multilingual_v2",
    voice_settings: ajustesDeVoz(cfg),
    apply_text_normalization: o.normalizacion || "auto",
    ...(previo ? { previous_text: paraDecir(previo, pais).texto.slice(-600) } : {}),
    ...(siguiente ? { next_text: paraDecir(siguiente, pais).texto.slice(0, 600) } : {}),
    ...(o.mandarIdioma && o.idioma ? { language_code: o.idioma } : {}),
  };
  const id = vozId || cfg.elevenVoz;
  try {
    const res = await pedir(cfg, id, `/with-timestamps?output_format=${encodeURIComponent(o.formato || "mp3_44100_128")}`, cuerpo, "application/json");
    const j = await res.json();
    const audio = Buffer.from(String(j.audio_base64 || ""), "base64");
    if (audio.length < 500) throw new Error("ElevenLabs devolvió un audio vacío");
    fs.writeFileSync(destino, audio);
    const dichas = palabrasDeAlineacion(j.alignment || j.normalized_alignment);
    return { palabras: tiemposDelGuion(d.originales, d.grupos, dichas), conTiempos: dichas.length > 0, caracteres: d.texto.length };
  } catch (e) {
    // La ruta con tiempos no existe o el plan no la tiene: se narra por la ruta de siempre, sin tiempos.
    if (!(e.estado === 404 || e.estado === 405)) throw e;
    await generar(cfg, d.texto, destino, id);
    return { palabras: null, conTiempos: false, caracteres: d.texto.length };
  }
}

module.exports = { disponible, generar, narrar, paraDecir, decirPalabra, palabrasDeAlineacion, tiemposDelGuion, vozPara };
