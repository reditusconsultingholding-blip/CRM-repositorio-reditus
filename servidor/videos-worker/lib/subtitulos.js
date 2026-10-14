"use strict";
// Subtítulos quemados con libass, en CINCO plantillas de estilo propias (`opciones.estiloSubtitulos`):
//
//   impacto   una palabra a la vez, enorme, con rebote; las palabras clave en el color de la marca
//   karaoke   frase corta en mayúsculas; la palabra que se está diciendo va resaltada
//   limpio    hasta dos renglones, blanco con sombra suave; las palabras van apareciendo
//   titular   mayúsculas condensadas sobre una caja del color de la marca
//   maquina   aparece letra a letra, como tecleado, sobre una franja oscura
//
// Si el trabajo no dice cuál, cada proyecto usa siempre el mismo (se elige por su guion) y
// proyectos distintos se reparten entre los cinco.
//
// Tipografías (todas con licencia libre SIL OFL 1.1, incluidas en `fuentes\`): Montserrat (Black,
// ExtraBold), Manrope Bold, Barlow Semi Condensed ExtraBold y Space Mono Bold.
//
// Tiempos: cada palabra entra cuando se dice. Con narración de ElevenLabs los tiempos son los
// reales (los devuelve la voz); con la voz del clip se reparten sobre el tramo donde se oye la
// frase, en proporción al largo de cada palabra (aproximado: no hay reconocimiento de voz).
//
// Zona segura (9:16): nada por encima del 12 % ni por debajo del 84 % del alto. El bloque se
// apoya en el 76 % del alto y crece hacia arriba; nunca pasa de dos renglones.
// El resaltado NO es amarillo fijo: es el color de la marca (aclarado si es muy oscuro para leerse
// sobre video) o, si no hay color, blanco con contorno.
const crypto = require("crypto");

const ESTILOS = ["impacto", "karaoke", "limpio", "titular", "maquina"];

const tiempoAss = (s) => {
  const t = Math.max(0, s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const seg = (t % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${seg}`;
};

const limpio = (p) => String(p).replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();
const sinSignos = (p) => String(p).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]/g, "");

/** Parte el texto en palabras con su inicio y fin dentro de [desde, desde+dura]. */
function palabrasConTiempo(texto, desde, dura) {
  const palabras = limpio(texto).split(" ").filter(Boolean);
  if (!palabras.length || dura <= 0) return [];
  // Cada palabra pesa su largo más una pausa; la puntuación alarga la pausa.
  const pesos = palabras.map((p) => p.replace(/[^\p{L}\p{N}]/gu, "").length + 2 + (/[.,;:!?…]$/.test(p) ? 2 : 0));
  const total = pesos.reduce((a, b) => a + b, 0);
  let t = desde;
  return palabras.map((p, i) => {
    const d = (dura * pesos[i]) / total;
    const w = { texto: p, inicio: t, fin: t + d };
    t += d;
    return w;
  });
}

/** Agrupa en frases de hasta `maxPalabras` y `maxLetras`; corta también en la puntuación fuerte y en las pausas largas. */
function frases(palabras, maxPalabras = 3, maxLetras = 18) {
  const grupos = [];
  let actual = [];
  let letras = 0;
  for (const p of palabras) {
    const pausa = actual.length && p.inicio - actual[actual.length - 1].fin > 0.6;
    if (actual.length && (actual.length >= maxPalabras || letras + p.texto.length > maxLetras || pausa)) {
      grupos.push(actual);
      actual = [];
      letras = 0;
    }
    actual.push(p);
    letras += p.texto.length + 1;
    if (/[.!?…]$/.test(p.texto)) {
      grupos.push(actual);
      actual = [];
      letras = 0;
    }
  }
  if (actual.length) grupos.push(actual);
  return grupos;
}

// ------------------------------------------------------------- color ----
const hexValido = (c) => /^#?[0-9a-f]{6}$/i.test(String(c || ""));
const aRgb = (c) => {
  const h = String(c).replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const aHex = (rgb) => rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
/** Luminancia relativa (0 negro … 1 blanco) de un color hex. */
function luminancia(c) {
  const [r, g, b] = aRgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** El color de la marca, aclarado hacia blanco lo justo para que se lea como texto sobre video. */
function colorLegible(c, minimo = 0.42) {
  if (!hexValido(c)) return null;
  let rgb = aRgb(c);
  for (let i = 0; i < 20 && luminancia(aHex(rgb)) < minimo; i++) rgb = rgb.map((v) => v + (255 - v) * 0.12);
  return aHex(rgb);
}
/** ASS escribe los colores al revés (azul-verde-rojo). */
const bgr = (rgb) => {
  const c = String(rgb).replace("#", "").toUpperCase();
  return c.slice(4, 6) + c.slice(2, 4) + c.slice(0, 2);
};

// Los nombres que manda el CRM hoy (opciones.estiloSubtitulos) y a qué plantilla corresponden.
const ALIAS = { palabra: "karaoke", palabraporpalabra: "karaoke", caja: "titular", tecleo: "maquina" };

/**
 * La plantilla de un proyecto. Vale el nombre propio (impacto, karaoke, limpio, titular, maquina) o el
 * del CRM (palabra → karaoke, caja → titular). «auto» = una fija según el producto, repartiendo
 * productos distintos entre las cinco. Ausente o desconocido → karaoke (el estilo de siempre).
 */
function elegirEstilo(pedido, semilla = "") {
  const p = sinSignos(pedido || "");
  if (ESTILOS.includes(p)) return p;
  if (ALIAS[p]) return ALIAS[p];
  if (p !== "auto") return "karaoke";
  const n = parseInt(crypto.createHash("sha1").update(String(semilla)).digest("hex").slice(0, 8), 16);
  return ESTILOS[n % ESTILOS.length];
}

const FORMATO_ESTILO = "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding";

/** Un archivo .ass completo a partir de líneas «Style:» y «Dialogue:». */
function documentoAss({ ancho, alto, estilos = [], eventos = [] }) {
  return ["[Script Info]", "ScriptType: v4.00+", `PlayResX: ${ancho}`, `PlayResY: ${alto}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "", "[V4+ Styles]", FORMATO_ESTILO, ...estilos, "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text", ...eventos, ""].join("\n");
}

/**
 * Los subtítulos de UNA escena en la plantilla pedida.
 *   palabras   [{ texto, inicio, fin }] con tiempos dentro del segmento
 *   marca      color de la marca (#RRGGBB) o vacío
 *   enfasis    palabras clave que marca el CRM (se resaltan)
 * Devuelve { estilos, eventos, zona: { y0, y1 }, estilo }.
 */
function subtitulosDeEscena({ estilo = "karaoke", palabras = [], ancho, alto, marca = "", enfasis = [], hasta = Infinity }) {
  const k = Math.min(ancho, alto) / 1080;
  const cx = Math.round(ancho / 2);
  const base = Math.round(alto * 0.76); // el bloque se apoya aquí y crece hacia arriba
  const margen = Math.round(ancho * 0.07);
  const anchoUtil = ancho - 2 * margen;
  const color = colorLegible(marca); // null = sin color de marca: blanco con contorno
  const claves = new Set((Array.isArray(enfasis) ? enfasis : []).map(sinSignos).filter(Boolean));
  const esClave = (p) => claves.has(sinSignos(p.texto));
  const ws = palabras.map((p) => ({ ...p, texto: limpio(p.texto) })).filter((p) => p.texto && p.inicio < hasta);
  const estilos = [];
  const eventos = [];
  const ev = (capa, desde, fin, est, texto) => {
    const f = Math.min(fin, hasta);
    if (f - desde > 0.04) eventos.push(`Dialogue: ${capa},${tiempoAss(desde)},${tiempoAss(f)},${est},,0,0,0,,${texto}`);
  };
  const ms = (s) => Math.max(0, Math.round(s * 1000));
  const finDe = (grupos, i) => (i + 1 < grupos.length ? Math.min(grupos[i + 1][0].inicio, grupos[i][grupos[i].length - 1].fin + 0.6) : grupos[i][grupos[i].length - 1].fin + 0.35);
  let alturaBloque = 0;

  if (estilo === "impacto") {
    // Una palabra a la vez (dos si son muy cortas), enorme, con rebote.
    const tam = Math.round(150 * k);
    estilos.push(`Style: Sub,Montserrat Black,${tam},&H00FFFFFF,&H00FFFFFF,&H00000000,&H78000000,0,0,0,0,100,100,0,0,1,${Math.round(tam * 0.07)},${Math.round(tam * 0.04)},5,${margen},${margen},0,1`);
    const grupos = [];
    for (const p of ws) {
      const ult = grupos[grupos.length - 1];
      if (ult && ult.length === 1 && ult[0].texto.length <= 3 && p.texto.length <= 6 && !/[.!?…]$/.test(ult[0].texto) && p.inicio - ult[0].fin < 0.4) ult.push(p);
      else grupos.push([p]);
    }
    const y = base - Math.round(tam * 0.5);
    grupos.forEach((g, i) => {
      const texto = g.map((p) => p.texto.toUpperCase()).join(" ");
      const cabe = Math.min(1, anchoUtil / (texto.length * 0.5 * tam * 1.14)); // 0,5 = ancho de una mayúscula ancha de Montserrat Black; 1,14 = el rebote y el contorno
      const fs = Math.round(tam * cabe);
      const clave = g.some(esClave);
      const c = clave && color ? `\\1c&H${bgr(color)}&` : i % 3 === 2 && color ? `\\1c&H${bgr(color)}&` : "";
      const crece = clave ? 118 : 110;
      ev(0, g[0].inicio, finDe(grupos, i), "Sub", `{\\an5\\pos(${cx},${y})\\q2\\fs${fs}${c}\\fscx60\\fscy60\\t(0,90,\\fscx${crece}\\fscy${crece})\\t(90,180,\\fscx100\\fscy100)}${texto}`);
    });
    alturaBloque = tam;
  } else if (estilo === "limpio") {
    // Frase en minúsculas normales, blanca, sin contorno, con sombra suave; las palabras van apareciendo.
    const tam = Math.round(68 * k);
    estilos.push(`Style: Sub,Manrope,${tam},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,2,${Math.round(ancho * 0.09)},${Math.round(ancho * 0.09)},${alto - base},1`);
    const grupos = frases(ws, 7, 36);
    grupos.forEach((g, i) => {
      const t0 = g[0].inicio;
      const linea = (sombra) =>
        g
          .map((p) => {
            const a = ms(p.inicio - t0);
            const col = !sombra && esClave(p) && color ? `\\1c&H${bgr(color)}&` : "";
            return `{\\1a&HFF&${col}\\t(${a},${a + 140},\\1a&H${sombra ? "70" : "00"}&)}${p.texto}{\\1c&H${sombra ? "000000" : "FFFFFF"}&}`;
          })
          .join(" ");
      // capa de sombra: el mismo texto en negro, desenfocado y corrido unos píxeles
      ev(0, t0, finDe(grupos, i), "Sub", `{\\an2\\pos(${cx + Math.round(3 * k)},${base + Math.round(5 * k)})\\1c&H000000&\\blur${Math.max(3, Math.round(7 * k))}}${linea(true)}`);
      ev(1, t0, finDe(grupos, i), "Sub", `{\\an2\\pos(${cx},${base})}${linea(false)}`);
    });
    alturaBloque = Math.round(tam * 2.5);
  } else if (estilo === "titular") {
    // Mayúsculas condensadas sobre una caja del color de la marca.
    const tam = Math.round(112 * k);
    const fondo = hexValido(marca) ? String(marca).replace("#", "") : "0B1220";
    const texto = luminancia(fondo) > 0.6 ? "0B1220" : "FFFFFF";
    estilos.push(`Style: Sub,Barlow Semi Condensed ExtraBold,${tam},&H00${bgr(texto)},&H00${bgr(texto)},&H00${bgr(fondo)},&H00${bgr(fondo)},0,0,0,0,100,100,${Math.round(1 * k)},0,3,${Math.round(tam * 0.16)},0,2,${margen},${margen},${alto - base},1`);
    const grupos = frases(ws, 4, 22);
    grupos.forEach((g, i) => {
      const t0 = g[0].inicio;
      const linea = g
        .map((p) => {
          const a = ms(p.inicio - t0);
          return `{\\1a&HFF&\\t(${a},${a + 80},\\1a&H00&)}${p.texto.toUpperCase()}`;
        })
        .join(" ");
      ev(0, t0, finDe(grupos, i), "Sub", `{\\an2\\pos(${cx},${base})\\q2\\fscy40\\t(0,110,\\fscy100)}${linea}`);
    });
    alturaBloque = Math.round(tam * 1.4);
  } else if (estilo === "maquina") {
    // Tecleado: las letras aparecen una a una sobre una franja oscura.
    const tam = Math.round(56 * k);
    estilos.push(`Style: Sub,Space Mono,${tam},&H00FFFFFF,&H00FFFFFF,&H50000000,&H50000000,-1,0,0,0,100,100,0,0,3,${Math.round(tam * 0.28)},0,2,${Math.round(ancho * 0.08)},${Math.round(ancho * 0.08)},${alto - base},1`);
    const grupos = frases(ws, 5, 28);
    grupos.forEach((g, i) => {
      const t0 = g[0].inicio;
      const linea = g
        .map((p) => {
          const letras = [...p.texto];
          const dur = Math.max(0.06, Math.min(p.fin - p.inicio, letras.length * 0.07));
          const col = esClave(p) && color ? `\\1c&H${bgr(color)}&` : "";
          return (
            letras
              .map((ch, j) => {
                const a = ms(p.inicio - t0 + (dur * j) / letras.length);
                return `{\\1a&HFF&${col}\\t(${a},${a + 1},\\1a&H00&)}${ch}`;
              })
              .join("") + "{\\1c&HFFFFFF&}"
          );
        })
        .join(" ");
      ev(0, t0, finDe(grupos, i), "Sub", `{\\an2\\pos(${cx},${base})}${linea}`);
    });
    alturaBloque = Math.round(tam * 2.9);
  } else {
    // karaoke: la frase entera en pantalla; cambia cuál palabra va resaltada.
    const tam = Math.round(96 * k);
    estilos.push(`Style: Sub,Montserrat ExtraBold,${tam},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,${Math.round(tam * 0.075)},${Math.round(tam * 0.03)},2,${margen},${margen},${alto - base},1`);
    const grupos = frases(ws, 3, 18);
    grupos.forEach((g, gi) => {
      const fin = finDe(grupos, gi);
      g.forEach((p, i) => {
        const hastaP = i === g.length - 1 ? fin : g[i + 1].inicio;
        const texto = g
          .map((q, j) => {
            const t = q.texto.toUpperCase();
            if (j === i) return color ? `{\\1c&H${bgr(color)}&\\fscx108\\fscy108}${t}{\\1c&HFFFFFF&\\fscx100\\fscy100}` : `{\\fscx110\\fscy110}${t}{\\fscx100\\fscy100}`;
            // Sin color de marca: la palabra activa en blanco pleno y las demás un poco apagadas.
            return color ? t : `{\\1a&H50&}${t}{\\1a&H00&}`;
          })
          .join(" ");
        // La frase entra con un golpe pequeño (88 → 100 %) al decirse su primera palabra.
        ev(0, p.inicio, hastaP, "Sub", `{\\an2\\pos(${cx},${base})${i === 0 ? "\\fscx88\\fscy88\\t(0,90,\\fscx100\\fscy100)" : ""}}${texto}`);
      });
    });
    alturaBloque = Math.round(tam * 2.4);
  }
  return { estilo, estilos, eventos, zona: { y0: base - alturaBloque, y1: base + Math.round(12 * k) } };
}

/**
 * Arma un .ass completo con el estilo clásico (karaoke). Lo usan los videos completos de antes
 * (lib/trabajo.js). `tramos`: [{ texto, desde, dura }]. `extra`: estilos y eventos ya armados.
 */
function armarAss(tramos, { ancho, alto, fuente = "Arial", resaltado = "FFE600", maxPalabras = 3 }, extra = null) {
  const tamano = Math.round(Math.min(ancho, alto) * 0.082);
  const estilos = [
    ...((extra && extra.estilos) || []),
    `Style: Anuncio,${fuente},${tamano},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,${Math.round(tamano * 0.09)},${Math.round(tamano * 0.03)},2,${Math.round(ancho * 0.07)},${Math.round(ancho * 0.07)},${Math.round(alto * 0.24)},1`,
  ];
  const eventos = [];
  for (const tramo of tramos) {
    const palabras = palabrasConTiempo(tramo.texto, tramo.desde, tramo.dura);
    for (const grupo of frases(palabras, maxPalabras)) {
      grupo.forEach((p, i) => {
        // La frase entera queda en pantalla; cambia cuál palabra va resaltada.
        const fin = i === grupo.length - 1 ? p.fin : grupo[i + 1].inicio;
        const texto = grupo.map((q, j) => (j === i ? `{\\c&H${bgr(resaltado)}&\\fscx108\\fscy108}${q.texto.toUpperCase()}{\\c&HFFFFFF&\\fscx100\\fscy100}` : q.texto.toUpperCase())).join(" ");
        eventos.push(`Dialogue: 0,${tiempoAss(p.inicio)},${tiempoAss(fin)},Anuncio,,0,0,0,,${texto}`);
      });
    }
  }
  const otros = (extra && extra.eventos) || [];
  return { ass: documentoAss({ ancho, alto, estilos, eventos: [...otros, ...eventos] }), eventos: eventos.length + otros.length };
}

module.exports = { ESTILOS, armarAss, subtitulosDeEscena, documentoAss, elegirEstilo, palabrasConTiempo, frases, colorLegible, luminancia, hexValido, bgr, tiempoAss, FORMATO_ESTILO };
