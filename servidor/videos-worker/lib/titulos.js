"use strict";
// Títulos de apoyo: frases cortas con LO IMPORTANTE de la escena (el beneficio, el dato, el nombre
// del producto, el paso). No son subtítulos: no transcriben lo que se dice.
//
//   subtítulos        lo que se dice, palabra a palabra, en la zona media-baja (lib/subtitulos.js)
//   títulos de apoyo  2–5 palabras, en la franja SUPERIOR centrada, debajo del 12 % de arriba que
//                     tapan las redes; más grandes que los subtítulos y con caja o subrayado
//
// Llegan por escena en `escena.tituloApoyo` (un texto, o { texto, desde, hasta } con segundos dentro
// de la escena; por defecto toda la escena menos 0,2 s a cada lado). Estilo: `opciones.estiloTitulos`:
//
//   caja        mayúsculas sobre una caja del color de la marca (entra con un golpe)
//   subrayado   mayúsculas blancas con contorno y una raya del color de la marca que se despliega
//   etiqueta    píldora oscura con un punto del color de la marca y el texto en blanco (la más sobria)
//
// Si el trabajo no dice estilo, sale del de los subtítulos, eligiendo el que más se diferencia
// (subtítulos con caja → título subrayado, etc.). Entran con animación en su `desde` y salen con un
// fundido corto. Nunca van en la tarjeta de cierre ni en los cortes de la apertura.
//
// El trabajador NO sabe dónde está la cara o el producto dentro de un clip: la franja es fija
// (del 13 % al ~28 % del alto), lejos de los subtítulos (64–76 %).
const { ajustarTexto, redondeado } = require("./rotulo");
const { luminancia, hexValido, bgr, colorLegible, tiempoAss } = require("./subtitulos");

const ESTILOS_TITULO = ["caja", "subrayado", "etiqueta"];
// Con qué título se diferencia mejor cada plantilla de subtítulos.
const POR_SUBTITULO = { impacto: "etiqueta", karaoke: "caja", limpio: "subrayado", titular: "subrayado", maquina: "caja" };

const sinMarcas = (t) => String(t == null ? "" : t).replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();
const sinSignos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** El estilo de los títulos: el pedido si existe; si no, el que mejor contrasta con los subtítulos. */
function elegirEstiloTitulos(pedido, estiloSubtitulos = "") {
  const p = sinSignos(pedido);
  if (ESTILOS_TITULO.includes(p)) return p;
  return POR_SUBTITULO[String(estiloSubtitulos).replace(/^captions:.*/, "")] || "caja";
}

/** Lee `escena.tituloApoyo`: texto o { texto, desde, hasta }. Devuelve { texto, desde, hasta } o null. */
function leerTitulo(escena, dura) {
  const t = escena && escena.tituloApoyo;
  const o = t && typeof t === "object" ? t : { texto: t, desde: escena && escena.tituloApoyoDesde, hasta: escena && escena.tituloApoyoHasta };
  const texto = sinMarcas(o.texto).slice(0, 80);
  if (!texto) return null;
  let desde = Number(o.desde);
  let hasta = Number(o.hasta);
  if (!Number.isFinite(desde) || desde < 0) desde = Math.min(0.2, dura / 4);
  if (!Number.isFinite(hasta) || hasta <= desde) hasta = dura - Math.min(0.2, dura / 4);
  hasta = Math.min(hasta, dura - 0.05);
  if (hasta - desde < 0.4) return null; // no daría tiempo a leerlo
  return { texto, desde: Math.round(desde * 100) / 100, hasta: Math.round(hasta * 100) / 100 };
}

/**
 * El título de apoyo de una escena, listo para el .ass.
 *   desfase   segundos que se suman a los tiempos (cuando se pinta sobre el video ya unido)
 * Devuelve { estilos, eventos, zona: { x, y, w, h }, desde, hasta } o null si la escena no trae título.
 */
async function tituloDeEscena({ ff, carpeta, escena, dura, ancho, alto, marca = "", estilo = "caja", desfase = 0 }) {
  const t = leerTitulo(escena, dura);
  if (!t) return null;
  const vertical = alto >= ancho;
  const k = (vertical ? ancho : alto) / 1080;
  const color = hexValido(marca) ? String(marca).replace("#", "").toUpperCase() : "0553C9";
  const arriba = Math.round(alto * 0.13); // debajo de lo que tapan las redes
  const cx = Math.round(ancho / 2);
  const mayus = estilo !== "etiqueta";
  const texto = mayus ? t.texto.toUpperCase() : t.texto;
  const fuente = estilo === "etiqueta" ? "Montserrat" : "Montserrat ExtraBold";
  const negrita = estilo === "etiqueta";
  // Más grande que los subtítulos (que van a 96): hasta 112, y nunca más de 2 renglones.
  const a = await ajustarTexto(ff, carpeta, texto, { fuente, negrita, tamMax: (estilo === "etiqueta" ? 74 : 112) * k, tamMin: (estilo === "etiqueta" ? 54 : 86) * k, anchoMax: ancho * (estilo === "caja" ? 0.74 : 0.8), maxRenglones: 2, espaciadoRel: mayus ? 0.01 : 0 });
  const paso = Math.round(a.tam * 1.08);
  const altoTexto = a.renglones.length * paso;
  const padX = Math.round(a.tam * (estilo === "etiqueta" ? 0.62 : 0.4));
  const padY = Math.round(a.tam * (estilo === "subrayado" ? 0.04 : 0.24));
  const w = Math.round(a.ancho + 2 * padX);
  const h = altoTexto + 2 * padY;
  const ini = desfase + t.desde;
  const fin = desfase + t.hasta;
  const estilos = [
    `Style: TitForma,Montserrat,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`,
    `Style: TitTexto,${fuente},${a.tam},&H00FFFFFF,&H00FFFFFF,&H00000000,&H78000000,${negrita ? -1 : 0},0,0,0,100,100,${(a.tam * (mayus ? 0.01 : 0)).toFixed(1)},0,1,0,0,5,0,0,0,1`,
  ];
  const eventos = [];
  const ev = (capa, est, tags, cuerpo) => eventos.push(`Dialogue: ${capa},${tiempoAss(ini)},${tiempoAss(fin)},${est},,0,0,0,,{${tags}}${cuerpo}`);
  const salida = `\\fad(0,140)`; // sale limpio: un fundido corto
  const cyBloque = arriba + Math.round(h / 2);
  const cyLinea = (i) => arriba + padY + Math.round(paso * (i + 0.5));
  const golpe = `\\fscx86\\fscy86\\t(0,80,\\fscx104\\fscy104)\\t(80,170,\\fscx100\\fscy100)`; // entra con un golpe
  let altoZona = h;
  if (estilo === "caja") {
    const tinta = luminancia(color) > 0.6 ? "0B1220" : "FFFFFF";
    ev(4, "TitForma", `\\an5\\pos(${cx + Math.round(4 * k)},${cyBloque + Math.round(8 * k)})${salida}${golpe}\\1c&H000000&\\1a&H90&\\blur${Math.max(4, Math.round(10 * k))}\\p1`, `${redondeado(w, h, a.tam * 0.22)}{\\p0}`);
    ev(5, "TitForma", `\\an5\\pos(${cx},${cyBloque})${salida}${golpe}\\1c&H${bgr(color)}&\\p1`, `${redondeado(w, h, a.tam * 0.22)}{\\p0}`);
    a.renglones.forEach((r, i) => ev(6, "TitTexto", `\\q2\\an5\\pos(${cx},${cyLinea(i)})${salida}${golpe}\\1c&H${bgr(tinta)}&\\bord0\\shad0`, r));
  } else if (estilo === "subrayado") {
    const borde = Math.max(3, Math.round(a.tam * 0.06));
    a.renglones.forEach((r, i) => ev(6, "TitTexto", `\\q2\\an5\\pos(${cx},${cyLinea(i)})${salida}${golpe}\\3c&H000000&\\bord${borde}\\shad${Math.max(2, Math.round(a.tam * 0.035))}`, r));
    // La raya del color de la marca se despliega de izquierda a derecha justo después del texto.
    const grueso = Math.max(8, Math.round(a.tam * 0.13));
    const largo = Math.round(Math.min(a.ancho, ancho * 0.6));
    const y = arriba + h + Math.round(a.tam * 0.1);
    ev(5, "TitForma", `\\an4\\pos(${Math.round(cx - largo / 2)},${y + Math.round(grueso / 2)})${salida}\\1c&H${bgr(colorLegible(color, 0.3) || color)}&\\fscx0\\t(90,300,\\fscx100)\\p1`, `${redondeado(largo, grueso, grueso / 2)}{\\p0}`);
    altoZona = h + Math.round(a.tam * 0.1) + grueso;
  } else {
    // etiqueta: píldora oscura translúcida, punto del color de la marca, texto blanco
    const punto = Math.round(a.tam * 0.34);
    const wE = w + punto + Math.round(a.tam * 0.3);
    const sube = Math.round(20 * k);
    const entra = (x, y) => `\\move(${x},${y - sube},${x},${y},0,220)\\fad(160,140)`;
    ev(4, "TitForma", `\\an5${entra(cx, cyBloque)}\\1c&H140F0B&\\1a&H38&\\p1`, `${redondeado(wE, h, h / 2)}{\\p0}`);
    ev(5, "TitForma", `\\an5${entra(Math.round(cx - wE / 2 + padX * 0.75 + punto / 2), cyBloque)}\\1c&H${bgr(colorLegible(color, 0.35) || color)}&\\p1`, `${redondeado(punto, punto, punto / 2)}{\\p0}`);
    a.renglones.forEach((r, i) => ev(6, "TitTexto", `\\q2\\an5${entra(Math.round(cx + (punto + a.tam * 0.3) / 2), cyLinea(i))}\\bord0\\shad0`, r));
    return { estilos, eventos, zona: { x: Math.round(cx - wE / 2), y: arriba - sube, w: wE, h: h + sube }, desde: t.desde, hasta: t.hasta, texto: t.texto, renglones: a.renglones.length };
  }
  return { estilos, eventos, zona: { x: Math.round(cx - w / 2), y: arriba, w, h: altoZona }, desde: t.desde, hasta: t.hasta, texto: t.texto, renglones: a.renglones.length };
}

module.exports = { ESTILOS_TITULO, elegirEstiloTitulos, leerTitulo, tituloDeEscena };
