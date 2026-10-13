"use strict";
// Quién habla en el video y cómo se le pide al modelo de video.
//
//   · De dónde sale el audio: por defecto, del PROPIO CLIP (lo dice Veo). ElevenLabs solo si
//     el trabajo lo pide (`opciones.voz: "elevenlabs"`) y el servidor tiene clave; si no hay
//     clave, se usa el audio del clip y se avisa. `opciones.voz: false` = sin voz.
//   · Acento e idioma: salen del trabajo (`contexto.voz`), no de un texto fijo. Si no llegan,
//     se decide por el país del proyecto (config.json → habla.porPais); resto → español neutro.
//   · Formatos narrados (config.json → habla.narrados): nadie habla a cámara; se pide un
//     narrador fuera de cámara.
//   · La descripción de la voz o del personaje (`contexto.voz.descripcion`) va IGUAL en todas
//     las escenas del proyecto, para que la voz no cambie de un clip a otro.

const PAISES = {
  es: "ES", espana: "ES", "españa": "ES", spain: "ES",
  mx: "MX", mexico: "MX", "méxico": "MX",
  co: "CO", colombia: "CO",
  ar: "AR", argentina: "AR",
  cl: "CL", chile: "CL",
  pe: "PE", peru: "PE", "perú": "PE",
  ec: "EC", ecuador: "EC",
};

const POR_PAIS = {
  ES: "español de España (castellano peninsular)",
  MX: "español de México",
  CO: "español de Colombia",
  AR: "español de Argentina (rioplatense)",
  CL: "español de Chile",
  PE: "español de Perú",
  EC: "español de Ecuador",
};

const txt = (v, max = 400) => (typeof v === "string" ? v.replace(/[\r\n"“”]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Código de país (ES, MX, CO…) a partir de «CO», «Colombia», «co»… o "" si no se reconoce. */
function codigoPais(valor) {
  const v = txt(valor, 40).toLowerCase();
  if (!v) return "";
  return PAISES[v] || (/^[a-z]{2}$/.test(v) ? v.toUpperCase() : "");
}

/** Lo que el trabajo dice de la voz: `contexto.voz` (lo acordado) o `trabajo.voz` si llega ahí. */
function vozDelTrabajo(trabajo) {
  const c = (trabajo && trabajo.contexto) || {};
  const v = (c.voz && typeof c.voz === "object" ? c.voz : null) || (trabajo && trabajo.voz && typeof trabajo.voz === "object" ? trabajo.voz : null) || {};
  const idioma = txt(v.idioma, 40);
  // `idioma` llega como BCP-47 («es-CO», «es-ES», «en-US»): la región también dice el país.
  const region = (/^[a-z]{2,3}[-_]([a-z]{2})$/i.exec(idioma) || [])[1];
  return {
    motor: v.motor === "narracion" ? "narracion" : v.motor === "clip" ? "clip" : "",
    idioma,
    acento: txt(v.acento, 160),
    descripcion: txt(v.descripcion, 400),
    pais: codigoPais(v.pais) || codigoPais(region) || codigoPais(c.pais) || codigoPais(trabajo && trabajo.pais),
  };
}

const IDIOMAS = { en: "inglés", pt: "portugués", fr: "francés", it: "italiano", de: "alemán" };

/** ¿En esta escena alguien DICE la frase? `locucion`: "camara" | "narrador" sí; "texto" | "sin-voz" no. */
function seHabla(escena) {
  if (!escena || !String(escena.voz || "").trim()) return false;
  return !["texto", "sin-voz"].includes(escena.locucion);
}

/**
 * ¿El CRM ya escribió en el prompt del clip quién habla, la frase, el acento y la voz (su bloque
 * «AUDIO»)? Entonces el trabajador NO agrega otra instrucción de voz: mandaría dos frases distintas.
 */
function audioYaEnPrompt(trabajo, prompt) {
  return vozDelTrabajo(trabajo).motor === "clip" || /(^|\n)\s*AUDIO\b/.test(String(prompt || ""));
}

/** «español de Colombia», «castellano peninsular», «portugués de Brasil»… según el trabajo y, si no, el país. */
function acentoPara(cfg, trabajo) {
  const h = (cfg.config && cfg.config.habla) || {};
  const v = vozDelTrabajo(trabajo);
  if (v.acento) return v.acento;
  const esEspanol = !v.idioma || /^(es|esp|spa|castellano)/i.test(v.idioma);
  if (!esEspanol) {
    // Otro idioma, sin acento dado: su nombre en español si se conoce («en-US» → «inglés (en-US)»); si no, tal cual.
    const base = IDIOMAS[v.idioma.slice(0, 2).toLowerCase()];
    return base && /^[a-z]{2}([-_][a-z]{2})?$/i.test(v.idioma) ? `${base} (${v.idioma})` : v.idioma;
  }
  const tabla = { ...POR_PAIS, ...(h.porPais || {}) };
  return (v.pais && typeof tabla[v.pais] === "string" && tabla[v.pais]) || h.neutro || "español latino neutro";
}

/** ¿Este formato lo cuenta un narrador (nadie habla a cámara)? */
function esNarrado(cfg, trabajo, escena = null) {
  const h = (cfg.config && cfg.config.habla) || {};
  // Lo que diga la escena manda (`locucion` del CRM); si no lo dice, depende del formato.
  if (escena && escena.locucion === "narrador") return true;
  if (escena && escena.locucion === "camara") return false;
  const lista = Array.isArray(h.narrados) ? h.narrados : ["historia", "crochet", "esqueleto", "plastilina"];
  return lista.includes(trabajo && trabajo.formato);
}

/**
 * Las líneas del prompt que piden la frase hablada. `frase` es el texto de la escena.
 * Devuelve un arreglo de líneas (vacío si no hay frase).
 * Solo se usa cuando el CRM NO mandó ya su bloque «AUDIO» en el prompt (ver audioYaEnPrompt).
 */
function lineasDeHabla(cfg, trabajo, frase, escena = null) {
  const h = (cfg.config && cfg.config.habla) || {};
  const dicho = txt(frase, 600);
  if (!dicho) return [];
  const acento = acentoPara(cfg, trabajo);
  const v = vozDelTrabajo(trabajo);
  const plantilla = esNarrado(cfg, trabajo, escena)
    ? h.plantillaNarrador || "Narrador fuera de cámara (voz en off; ningún personaje mueve los labios), en {acento}, con voz natural, dice exactamente:"
    : h.plantillaEnCamara || "La persona dice a cámara, en {acento}, con voz natural, exactamente:";
  const lineas = [`${plantilla.replace("{acento}", acento)} "${dicho}"`];
  if (v.descripcion) lineas.push((h.plantillaVoz || "Voz: {descripcion}. Es la misma voz en todas las escenas de este video.").replace("{descripcion}", v.descripcion));
  if (h.sinMusica !== false) lineas.push(h.textoSinMusica || "Sin música de fondo.");
  return lineas;
}

/**
 * De dónde sale el audio de este trabajo.
 *   modo: "veo" (el del clip) | "elevenlabs" | "ninguno"      aviso: texto para el resultado, o ""
 * `tts`: ¿hay clave de ElevenLabs en el servidor?
 */
function decidirAudio(cfg, trabajo, tts) {
  const a = (cfg.config && cfg.config.audio) || {};
  const pedido = trabajo && trabajo.opciones ? trabajo.opciones.voz : undefined;
  if (pedido === false || pedido === "ninguno") return { modo: "ninguno", aviso: "" };
  // `contexto.voz.motor` (lo acordado con el CRM): "clip" = habla el propio clip, NUNCA ElevenLabs;
  // "narracion" = narración aparte de ElevenLabs. `opciones.voz: "elevenlabs" | "veo"` vale igual.
  const motor = vozDelTrabajo(trabajo).motor;
  let modo =
    pedido === "elevenlabs" || (motor === "narracion" && pedido !== "veo" && pedido !== "clip")
      ? "elevenlabs"
      : pedido === "veo" || pedido === "clip" || motor === "clip"
        ? "veo"
        : (a.porFormato || {})[trabajo && trabajo.formato] || a.porDefecto || "veo";
  if (!["veo", "elevenlabs", "ninguno"].includes(modo)) modo = "veo";
  if (modo === "elevenlabs" && !tts) {
    return { modo: "veo", aviso: "Se pidió voz de ElevenLabs pero el servidor no tiene esa clave: se usa el audio del propio clip." };
  }
  return { modo, aviso: "" };
}

module.exports = { codigoPais, vozDelTrabajo, acentoPara, esNarrado, seHabla, audioYaEnPrompt, lineasDeHabla, decidirAudio, POR_PAIS };
