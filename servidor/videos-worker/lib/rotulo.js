"use strict";
// Rótulo de la escena de cierre: la oferta (grande, sobre un panel oscuro) y el
// llamado a la acción (un botón). Lo dibuja el armado con libass, no el modelo de
// video (que deforma las letras). Los textos van TAL CUAL llegan: son las palabras
// del cliente.
//
// Aquí se decide TODO el reparto del cuadro de la escena de cierre, para que nada
// se pise por construcción:
//   vertical (9:16, 1:1)      oferta arriba · producto en el centro · botón debajo · subtítulos
//   horizontal (16:9)         producto a la izquierda · oferta y botón a la derecha · subtítulos abajo
// Los subtítulos (lib/subtitulos.js) van con margen inferior del 24 % del alto y
// pueden ocupar dos renglones: su franja se deja libre.
//
// No hay librería de fuentes: el ancho del texto se calcula con la tabla de
// anchos de Arial Bold (la fuente por defecto). Con otra fuente es una
// aproximación; por eso se deja un 6 % de holgura.

// Anchos de avance de Arial Bold, en milésimas de em.
const ANCHOS = {
  " ": 278, "!": 333, '"': 474, "#": 556, $: 556, "%": 889, "&": 722, "'": 238, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556, ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611, "@": 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  "¡": 333, "¿": 611, "·": 278, "•": 350, "–": 556, "—": 1000, "“": 500, "”": 500, "‘": 278, "’": 278, "…": 1000, "€": 556, "°": 400, "|": 280, _: 556,
};
// En ASS el tamaño de fuente es el alto del renglón (ascendente + descendente), no el em: en Arial, em ≈ 0,895 × tamaño.
const EM = 0.895;
const HOLGURA = 1.06;

const sinMarcas = (t) => String(t == null ? "" : t).replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();

/** Ancho estimado de un texto (px) a un tamaño de fuente ASS dado. */
function anchoTexto(texto, tam) {
  let total = 0;
  for (const ch of texto) {
    const base = ch.normalize("NFD")[0];
    total += ANCHOS[ch] ?? ANCHOS[base] ?? (ch.codePointAt(0) > 0x2e7f ? 1000 : 620);
  }
  return (total / 1000) * tam * EM * HOLGURA;
}

/**
 * Parte en `k` renglones dejando el renglón más largo lo más corto posible.
 * Devuelve { renglones, ancho } o null si hay menos palabras que renglones.
 */
function partir(palabras, k, tam) {
  const n = palabras.length;
  if (k > n) return null;
  const espacio = anchoTexto(" ", tam);
  const anchos = palabras.map((p) => anchoTexto(p, tam));
  const tramo = (i, j) => {
    let a = 0;
    for (let x = i; x < j; x++) a += anchos[x] + (x > i ? espacio : 0);
    return a;
  };
  // mejor[r][i] = menor «renglón más largo» al partir las primeras i palabras en r renglones
  const mejor = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity));
  const corte = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(0));
  mejor[0][0] = 0;
  for (let r = 1; r <= k; r++) {
    for (let i = r; i <= n; i++) {
      for (let j = r - 1; j < i; j++) {
        const v = Math.max(mejor[r - 1][j], tramo(j, i));
        if (v < mejor[r][i]) {
          mejor[r][i] = v;
          corte[r][i] = j;
        }
      }
    }
  }
  const renglones = [];
  let i = n;
  for (let r = k; r >= 1; r--) {
    const j = corte[r][i];
    renglones.unshift(palabras.slice(j, i).join(" "));
    i = j;
  }
  return { renglones, ancho: mejor[k][n] };
}

/**
 * El tamaño de letra más grande (entre `max` y `min`) con el que el texto cabe en
 * `anchoMax` usando hasta `maxRenglones`. Si ni al mínimo cabe, se permiten más
 * renglones y, en último caso, se achica por debajo del mínimo (no se recorta el texto).
 */
function ajustar(texto, { anchoMax, max, min, maxRenglones }) {
  const palabras = texto.split(" ").filter(Boolean);
  if (!palabras.length) return null;
  for (let tam = max; tam >= min; tam -= 2) {
    for (let k = 1; k <= Math.min(maxRenglones, palabras.length); k++) {
      const p = partir(palabras, k, tam);
      if (p && p.ancho <= anchoMax) return { tam, ...p };
    }
  }
  for (let k = maxRenglones + 1; k <= Math.min(maxRenglones + 3, palabras.length); k++) {
    const p = partir(palabras, k, min);
    if (p && p.ancho <= anchoMax) return { tam: min, ...p };
  }
  const k = Math.min(maxRenglones + 3, palabras.length);
  const p = partir(palabras, k, min);
  const tam = Math.max(18, Math.floor((min * anchoMax) / p.ancho));
  return { tam, renglones: p.renglones, ancho: (p.ancho * tam) / min };
}

const bgr = (rgb) => {
  const c = /^[0-9a-f]{6}$/i.test(rgb || "") ? rgb.toUpperCase() : "FFFFFF";
  return c.slice(4, 6) + c.slice(2, 4) + c.slice(0, 2);
};
const alfa = (opacidad) => Math.round((1 - Math.min(1, Math.max(0, opacidad))) * 255).toString(16).toUpperCase().padStart(2, "0");

/** Rectángulo de esquinas redondeadas como dibujo ASS, con origen en (0,0). */
function rectangulo(w, h, r) {
  const a = Math.round(w);
  const b = Math.round(h);
  const c = Math.round(Math.min(r, a / 2, b / 2));
  return `m ${c} 0 l ${a - c} 0 b ${a} 0 ${a} 0 ${a} ${c} l ${a} ${b - c} b ${a} ${b} ${a} ${b} ${a - c} ${b} l ${c} ${b} b 0 ${b} 0 ${b} 0 ${b - c} l 0 ${c} b 0 0 0 0 ${c} 0`;
}

const tiempo = (s) => {
  const t = Math.max(0, s);
  return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;
};

/**
 * Diseña la escena de cierre.
 *   { ancho, alto, oferta, llamado, conSubtitulos, dura, estilo }
 * Devuelve:
 *   caja      { x, y, w, h }  dónde va la foto del producto (px del cuadro final)
 *   estilos   líneas «Style:» para el .ass
 *   eventos   líneas «Dialogue:» (visibles toda la escena)
 *   zonas     { oferta, llamado, subtitulos } rectángulos usados (para las pruebas)
 *   avisos    textos para el resultado (renglón vacío, texto achicado…)
 */
function disenarCierre({ ancho, alto, oferta, llamado, conSubtitulos, dura, estilo = {} }) {
  const txtOferta = sinMarcas(oferta);
  const txtLlamado = sinMarcas(llamado);
  const avisos = [];
  if (!txtOferta) avisos.push("El cierre llegó sin oferta: ese renglón del rótulo no se dibuja.");
  if (!txtLlamado) avisos.push("El cierre llegó sin llamado a la acción: ese renglón del rótulo no se dibuja.");

  const vertical = alto >= ancho;
  const corto = Math.min(ancho, alto);
  const sep = Math.round(alto * 0.016);
  // Franja de los subtítulos: margen inferior 24 % y hasta dos renglones hacia arriba.
  const subArriba = Math.round(alto * (vertical ? 0.635 : 0.66));
  const subAbajo = Math.round(alto * 0.775);
  // Sin subtítulos se puede bajar más, pero no hasta la zona que tapan los botones de TikTok/Reels.
  const piso = conSubtitulos ? subArriba - sep : Math.round(alto * (vertical ? 0.8 : 0.9));
  const techo = Math.round(alto * 0.08);
  const mx = Math.round(ancho * (vertical ? 0.07 : 0.04));

  // Columna del texto.
  const colX = vertical ? mx : Math.round(ancho * 0.51);
  const colW = vertical ? ancho - 2 * mx : ancho - mx - colX;
  const centroX = colX + colW / 2;

  // Los dos bloques de texto a una escala dada (1 = tamaño ideal).
  function bloques(f) {
    let bo = null;
    if (txtOferta) {
      const max = Math.round(corto * 0.092 * f);
      const min = Math.round(corto * 0.052 * Math.min(1, f * 1.15));
      const padX = Math.round(corto * 0.035);
      const a = ajustar(txtOferta, { anchoMax: colW - 2 * padX, max, min, maxRenglones: vertical ? 3 : 4 });
      const interlinea = Math.round(a.tam * 1.14);
      const padY = Math.round(a.tam * 0.38);
      bo = { ...a, interlinea, padX, padY, w: Math.round(Math.min(colW, a.ancho + 2 * padX)), h: a.renglones.length * interlinea + 2 * padY };
    }
    let bl = null;
    if (txtLlamado) {
      const ref = bo ? bo.tam * 0.66 : corto * 0.06 * f;
      const max = Math.round(Math.min(corto * 0.06 * f, Math.max(corto * 0.044 * f, ref)));
      const min = Math.round(corto * 0.04 * Math.min(1, f * 1.15));
      const padX = Math.round(max * 0.8);
      const a = ajustar(txtLlamado, { anchoMax: colW - 2 * padX, max, min, maxRenglones: 2 });
      const interlinea = Math.round(a.tam * 1.14);
      const padY = Math.round(a.tam * 0.42);
      bl = { ...a, interlinea, padX, padY, w: Math.round(Math.min(colW, a.ancho + 2 * padX)), h: a.renglones.length * interlinea + 2 * padY };
    }
    return { bo, bl };
  }

  // ---- reparto: se achica el texto hasta que el producto conserve su espacio ----
  // vertical: el producto se queda al menos con el 24 % del alto; horizontal: el texto cabe en su columna.
  const minCaja = Math.round(alto * 0.24);
  let bloqueOferta = null;
  let bloqueLlamado = null;
  let caja = null;
  let escala = 1;
  for (; ; escala -= 0.06) {
    const { bo, bl } = bloques(escala);
    bloqueOferta = bo;
    bloqueLlamado = bl;
    let cabe;
    if (vertical) {
      if (bo) bo.y = techo;
      if (bl) bl.y = piso - bl.h;
      const y0 = bo ? bo.y + bo.h + sep : techo;
      const y1 = bl ? bl.y - sep : piso;
      caja = { x: mx, y: y0, w: ancho - 2 * mx, h: y1 - y0 };
      cabe = caja.h >= minCaja;
    } else {
      const altoTexto = (bo ? bo.h : 0) + (bl ? bl.h : 0) + (bo && bl ? sep * 2 : 0);
      let y = Math.max(techo, Math.round(techo + (piso - techo - altoTexto) / 2));
      if (bo) {
        bo.y = y;
        y += bo.h + sep * 2;
      }
      if (bl) bl.y = y;
      caja = bo || bl ? { x: mx, y: techo, w: Math.round(ancho * 0.47) - mx, h: piso - techo } : { x: mx, y: techo, w: ancho - 2 * mx, h: piso - techo };
      cabe = altoTexto <= piso - techo;
    }
    if (cabe || escala <= 0.3) break;
  }
  if (escala < 0.75) avisos.push("Los textos del cierre son muy largos: el rótulo se achicó para que cupieran completos. Conviene acortarlos.");

  // ---- ASS ----
  const fuente = estilo.fuente || "Arial";
  const estilos = [
    `Style: RotForma,${fuente},20,&H00000000,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    `Style: RotTexto,${fuente},60,&H00FFFFFF,&H00FFFFFF,&H00000000,&H78000000,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`,
  ];
  const eventos = [];
  const fin = tiempo(dura + 1);
  const entrada = "\\fad(200,0)";
  const linea = (capa, est, texto) => eventos.push(`Dialogue: ${capa},0:00:00.00,${fin},${est},,0,0,0,,${texto}`);
  const zonas = { subtitulos: conSubtitulos ? { x: 0, y: subArriba, w: ancho, h: subAbajo - subArriba } : null, oferta: null, llamado: null };

  if (bloqueOferta) {
    const b = bloqueOferta;
    const x = Math.round(centroX - b.w / 2);
    zonas.oferta = { x, y: b.y, w: b.w, h: b.h };
    linea(1, "RotForma", `{${entrada}\\pos(${x},${b.y})\\1c&H${bgr(estilo.fondoOferta || "000000")}&\\1a&H${alfa(estilo.opacidadFondo ?? 0.62)}&\\p1}${rectangulo(b.w, b.h, b.tam * 0.3)}{\\p0}`);
    b.renglones.forEach((r, i) => {
      const cy = Math.round(b.y + b.padY + b.interlinea * (i + 0.5));
      linea(2, "RotTexto", `{${entrada}\\q2\\an5\\pos(${Math.round(centroX)},${cy})\\fs${b.tam}\\1c&H${bgr(estilo.colorOferta || "FFFFFF")}&\\3c&H000000&\\bord${Math.max(2, Math.round(b.tam * 0.05))}\\shad${Math.max(1, Math.round(b.tam * 0.04))}}${r}`);
    });
  }
  if (bloqueLlamado) {
    const b = bloqueLlamado;
    const x = Math.round(centroX - b.w / 2);
    zonas.llamado = { x, y: b.y, w: b.w, h: b.h };
    // Sombra del botón (un rectángulo oscuro corrido unos píxeles) y el botón.
    const corr = Math.max(3, Math.round(b.tam * 0.09));
    linea(1, "RotForma", `{${entrada}\\pos(${x + corr},${b.y + corr})\\1c&H000000&\\1a&H80&\\p1}${rectangulo(b.w, b.h, b.h / 2)}{\\p0}`);
    linea(2, "RotForma", `{${entrada}\\pos(${x},${b.y})\\1c&H${bgr(estilo.fondoLlamado || "FFE600")}&\\1a&H00&\\p1}${rectangulo(b.w, b.h, b.h / 2)}{\\p0}`);
    b.renglones.forEach((r, i) => {
      const cy = Math.round(b.y + b.padY + b.interlinea * (i + 0.5));
      linea(3, "RotTexto", `{${entrada}\\q2\\an5\\pos(${Math.round(centroX)},${cy})\\fs${b.tam}\\1c&H${bgr(estilo.colorLlamado || "111111")}&\\bord0\\shad0}${r}`);
    });
  }
  return { caja, estilos, eventos, zonas, avisos, vertical };
}

module.exports = { disenarCierre, anchoTexto, ajustar, partir };
