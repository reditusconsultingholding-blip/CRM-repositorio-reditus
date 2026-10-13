"use strict";
// Subtítulos estilo anuncio, sin ningún servicio externo.
//
// Salen del texto de voz de cada escena. Se muestran en frases cortas (hasta 3
// palabras), en mayúsculas, con borde grueso, centradas en el tercio inferior
// (fuera de la zona que tapan los botones de TikTok/Reels), y la palabra que
// se está diciendo va resaltada en amarillo.
//
// Tiempos: si hay voz, las palabras se reparten sobre la duración real del
// audio de esa escena, en proporción a su largo (aproximación: no hay
// reconocimiento de voz). Sin voz, se reparten sobre la duración de la escena.

const tiempoAss = (s) => {
  const t = Math.max(0, s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const seg = (t % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${seg}`;
};

const limpio = (p) => p.replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();

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

/** Agrupa en frases de hasta `maxPalabras` y `maxLetras`; corta también en la puntuación fuerte. */
function frases(palabras, maxPalabras = 3, maxLetras = 18) {
  const grupos = [];
  let actual = [];
  let letras = 0;
  for (const p of palabras) {
    if (actual.length && (actual.length >= maxPalabras || letras + p.texto.length > maxLetras)) {
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

/**
 * Arma el archivo .ass completo.
 * `tramos`: [{ texto, desde, dura }] — lo que se dice en cada escena y cuándo.
 */
function armarAss(tramos, { ancho, alto, fuente = "Arial", resaltado = "FFE600", maxPalabras = 3 }, extra = null) {
  const tamano = Math.round(Math.min(ancho, alto) * 0.082);
  // ASS escribe los colores al revés (azul-verde-rojo).
  const bgr = resaltado.slice(4, 6) + resaltado.slice(2, 4) + resaltado.slice(0, 2);
  const cabecera = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${ancho}`,
    `PlayResY: ${alto}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ...((extra && extra.estilos) || []),
    `Style: Anuncio,${fuente},${tamano},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,${Math.round(tamano * 0.09)},${Math.round(tamano * 0.03)},2,${Math.round(ancho * 0.07)},${Math.round(ancho * 0.07)},${Math.round(alto * 0.24)},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const eventos = [];
  for (const tramo of tramos) {
    const palabras = palabrasConTiempo(tramo.texto, tramo.desde, tramo.dura);
    for (const grupo of frases(palabras, maxPalabras)) {
      grupo.forEach((p, i) => {
        // La frase entera queda en pantalla; cambia cuál palabra va resaltada.
        const fin = i === grupo.length - 1 ? p.fin : grupo[i + 1].inicio;
        const texto = grupo
          .map((q, j) => (j === i ? `{\\c&H${bgr}&\\fscx108\\fscy108}${q.texto.toUpperCase()}{\\c&HFFFFFF&\\fscx100\\fscy100}` : q.texto.toUpperCase()))
          .join(" ");
        eventos.push(`Dialogue: 0,${tiempoAss(p.inicio)},${tiempoAss(fin)},Anuncio,,0,0,0,,${texto}`);
      });
    }
  }
  // `extra`: estilos y eventos ya armados que van en el mismo archivo (el rótulo de cierre).
  const otros = (extra && extra.eventos) || [];
  return { ass: [...cabecera, ...otros, ...eventos, ""].join("\n"), eventos: eventos.length + otros.length };
}

module.exports = { armarAss, palabrasConTiempo, frases };
