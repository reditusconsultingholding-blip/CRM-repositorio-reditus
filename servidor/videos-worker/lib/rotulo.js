"use strict";
// Tarjeta de cierre del video (escena `tipo: "cierre"`). Contrato: «16-oct-2026 · tarjeta de cierre
// de calidad» en servidor/CONTRATO-PROYECTO-VIDEO.md.
//
//   fondo      la foto del cierre a pantalla completa, muy desenfocada y oscurecida. Si la foto es de
//              fondo blanco (catálogo), el último cuadro de la escena anterior. Nunca un gris plano:
//              si no hay de dónde, un degradado del color de la marca.
//   producto   la foto real entera, grande (≈ 62 % del ancho), esquinas redondeadas y sombra suave.
//   titular    «2x1»: blanco, Montserrat ExtraBold, enorme, en una línea.
//   detalle    «Dos gafas por 79 €»: debajo, más pequeño, hasta 2 líneas.
//   urgencia   opcional («2x1 solo esta semana»): una línea corta en mayúsculas pequeñas, del color de la marca
//              aclarado, entre el detalle y el botón. Solo si la manda el CRM, con sus palabras.
//   botón      píldora del color de la marca con el llamado a la acción (texto blanco u oscuro según
//              lo claro que sea el color). Nunca amarillo fijo.
//   entrada    0,6 s: el fondo aparece, el producto crece de 94 a 100 %, los textos suben 24 px y el
//              botón entra el último con un rebote mínimo. Después todo queda quieto.
//   márgenes   nada en el 12 % de arriba ni en el 16 % de abajo. Sin subtítulo encima.
//
// Los textos se escriben TAL CUAL llegan (son las palabras del cliente). El ancho de cada texto se
// MIDE dibujándolo con libass (no se estima), así cabe con cualquier tipografía.
// Tipografía: Montserrat (SIL Open Font License 1.1), incluida en `fuentes\`.
const fs = require("fs");
const path = require("path");
const { huella } = require("./proyecto");
const { documentoAss, luminancia, hexValido, bgr, colorLegible } = require("./subtitulos");

const AZUL = "0553C9"; // el color por defecto del contrato
const sinMarcas = (t) => String(t == null ? "" : t).replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();
const par = (n) => Math.max(2, Math.round(n / 2) * 2);

/** Rectángulo de esquinas redondeadas (arcos de verdad) como dibujo ASS. Con r = h/2 es una píldora. */
function redondeado(w, h, r) {
  const a = Math.round(w);
  const b = Math.round(h);
  const q = Math.max(0, Math.min(Math.round(r), Math.floor(a / 2), Math.floor(b / 2)));
  const c = Math.round(q * 0.5523);
  return `m ${q} 0 l ${a - q} 0 b ${a - q + c} 0 ${a} ${q - c} ${a} ${q} l ${a} ${b - q} b ${a} ${b - q + c} ${a - q + c} ${b} ${a - q} ${b} l ${q} ${b} b ${q - c} ${b} 0 ${b - q + c} 0 ${b - q} l 0 ${q} b 0 ${q - c} ${q - c} 0 ${q} 0`;
}

const medidas = new Map();
/**
 * Mide varios textos de una vez dibujándolos con libass: [{ texto, fuente, negrita, tam, espaciado }]
 * → [{ w, h }] en píxeles. Un solo ffmpeg: cada texto ocupa un cuadro y `bbox` informa su caja.
 */
async function medirTextos(ff, carpeta, items) {
  const clave = (i) => JSON.stringify([i.texto, i.fuente, !!i.negrita, i.tam, i.espaciado || 0]);
  const faltan = items.filter((i) => !medidas.has(clave(i)));
  if (faltan.length) {
    const unicos = [...new Map(faltan.map((i) => [clave(i), i])).values()];
    const W = 4000;
    const H = Math.max(300, Math.round(Math.max(...unicos.map((i) => i.tam)) * 3));
    const estilos = unicos.map((i, n) => `Style: M${n},${i.fuente},${i.tam},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,${i.negrita ? -1 : 0},0,0,0,100,100,${i.espaciado || 0},0,1,0,0,7,0,0,0,1`);
    const t = (n) => `0:00:${(n / 25).toFixed(2).padStart(5, "0")}`;
    const eventos = unicos.map((i, n) => `Dialogue: 0,${t(n)},${t(n + 1)},M${n},,0,0,0,,{\\q2\\pos(100,${Math.round(H / 3)})}${i.texto}`);
    const nombre = `tmp-medir-${huella(unicos.map(clave))}.ass`;
    fs.writeFileSync(path.join(carpeta, nombre), documentoAss({ ancho: W, alto: H, estilos, eventos }), "utf8");
    try {
      const texto = await ff.informe(["-f", "lavfi", "-i", `color=black:s=${W}x${H}:r=25:d=${(unicos.length / 25).toFixed(2)}`, "-vf", `ass=${nombre}:fontsdir=fuentes,bbox=min_val=24`], carpeta);
      const cajas = new Map();
      for (const m of texto.matchAll(/n:(\d+)[^\n]*?x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+)/g)) cajas.set(Number(m[1]), { w: Number(m[3]) - Number(m[2]) + 1, h: Number(m[5]) - Number(m[4]) + 1 });
      unicos.forEach((i, n) => medidas.set(clave(i), cajas.get(n) || { w: Math.round(i.texto.length * i.tam * 0.36), h: Math.round(i.tam * 0.75) }));
    } finally {
      fs.rmSync(path.join(carpeta, nombre), { force: true });
    }
    if (medidas.size > 3000) medidas.clear();
  }
  return items.map((i) => medidas.get(clave(i)) || { w: Math.round(i.texto.length * i.tam * 0.36), h: Math.round(i.tam * 0.75) });
}

/**
 * Reparte un texto en renglones que quepan en `anchoMax`, con la letra lo más grande posible entre
 * `tamMax` y `tamMin`, usando como mucho `maxRenglones`. Si ni así cabe, agrega un renglón y achica.
 * Devuelve { tam, renglones: [texto…], ancho }.
 */
async function ajustarTexto(ff, carpeta, texto, { fuente, negrita = false, tamMax, tamMin, anchoMax, maxRenglones = 1, espaciadoRel = 0 }) {
  const palabras = texto.split(" ").filter(Boolean);
  if (!palabras.length) return null;
  const ref = Math.round(tamMax);
  const esp = Math.round(ref * espaciadoRel * 10) / 10;
  // Se mide cada palabra y el par «a a» para saber cuánto ocupa un espacio.
  const m = await medirTextos(ff, carpeta, [...palabras.map((p) => ({ texto: p, fuente, negrita, tam: ref, espaciado: esp })), { texto: "n n", fuente, negrita, tam: ref, espaciado: esp }, { texto: "n", fuente, negrita, tam: ref, espaciado: esp }]);
  const anchos = m.slice(0, palabras.length).map((x) => x.w);
  const espacio = Math.max(ref * 0.12, m[palabras.length].w - 2 * m[palabras.length + 1].w);
  const tramo = (i, j) => anchos.slice(i, j).reduce((a, b) => a + b, 0) + espacio * Math.max(0, j - i - 1);
  // Mejor reparto en k renglones: el que deja más corto el renglón más largo.
  const partir = (k) => {
    const n = palabras.length;
    if (k > n) return null;
    const mejor = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity));
    const corte = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(0));
    mejor[0][0] = 0;
    for (let r = 1; r <= k; r++) for (let i = r; i <= n; i++) for (let j = r - 1; j < i; j++) {
      const v = Math.max(mejor[r - 1][j], tramo(j, i));
      if (v < mejor[r][i]) {
        mejor[r][i] = v;
        corte[r][i] = j;
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
  };
  const holgura = 1.03;
  // El primer número de renglones con el que la letra llega al tamaño mínimo. Si con los permitidos no
  // llega, se permiten hasta dos renglones más; y si ni así, se achica lo que haga falta (no se recorta el texto).
  const tope = Math.min(palabras.length, maxRenglones + 2);
  let elegido = null;
  for (let k = 1; k <= tope; k++) {
    const p = partir(k);
    if (!p) break;
    const tam = Math.max(20, Math.min(Math.round(tamMax), Math.floor((ref * anchoMax) / (p.ancho * holgura))));
    elegido = { tam, renglones: p.renglones, ancho: (p.ancho * tam) / ref, deMas: k > maxRenglones };
    if (tam >= tamMin) break;
  }
  return elegido;
}

/** ¿La foto es de fondo blanco o casi blanco (producto de catálogo)? Mira solo sus bordes. */
async function esFondoClaro(ff, archivo, cwd) {
  try {
    const texto = await ff.informe(
      ["-i", archivo, "-filter_complex", "[0:v]select='eq(n,0)',scale=64:64,format=rgb24,split=4[a][b][c][d];[a]crop=64:4:0:0[a1];[b]crop=64:4:0:60[b1];[c]crop=4:64:0:0,transpose=1[c1];[d]crop=4:64:60:0,transpose=1[d1];[a1][b1][c1][d1]vstack=inputs=4,format=yuv444p,signalstats,metadata=print"],
      cwd,
    );
    const y = Number((/signalstats\.YAVG=([\d.]+)/.exec(texto) || [])[1]);
    const s = Number((/signalstats\.SATAVG=([\d.]+)/.exec(texto) || [])[1]);
    const bajo = Number((/signalstats\.YLOW=([\d.]+)/.exec(texto) || [])[1]);
    return y >= 190 && s <= 16 && !(bajo < 120);
  } catch {
    return false;
  }
}

/** Los textos y el color del cierre, con las compatibilidades del contrato. */
function textosDelCierre(cierre = {}) {
  const titular = sinMarcas(cierre.titular);
  const detalle = sinMarcas(cierre.detalle);
  const oferta = sinMarcas(cierre.oferta);
  // Trabajo viejo (sin titular ni detalle): la oferta entera es la línea principal.
  const principal = titular || (detalle ? "" : oferta);
  const color = hexValido(cierre.color) ? String(cierre.color).replace("#", "").toUpperCase() : AZUL;
  return { principal, esTitular: !!titular, detalle: titular || detalle ? detalle : "", llamado: sinMarcas(cierre.llamadoALaAccion), urgencia: sinMarcas(cierre.urgencia), color, textoBoton: luminancia(color) > 0.6 ? "0B1220" : "FFFFFF" };
}

/**
 * Prepara la tarjeta de cierre.
 *   foto    archivo (en `carpeta`) de la foto del producto, o null
 *   previa  { archivo, segundo } de la escena anterior (un clip y el segundo de su último cuadro, o una foto), o null
 * Devuelve lo que el armado necesita para codificar el segmento:
 *   entradas   argumentos de entrada de ffmpeg (dos imágenes en bucle)
 *   filtros    cadenas de filter_complex; el video queda en la etiqueta [base]
 *   estilos, eventos   para el .ass (textos y botón, con su entrada animada)
 *   firma      todo lo que define el resultado (para la huella del segmento)
 *   zonas      rectángulos usados (para las pruebas)   ·   usados: archivos de la caché
 */
async function prepararCierre({ ff, carpeta, conCerrojo = (c, f) => f(), ancho, alto, fps, dura, foto, previa, cierre }) {
  const T = textosDelCierre(cierre);
  const avisos = [];
  if (!T.principal && !T.detalle) avisos.push("El cierre llegó sin oferta: la tarjeta va sin ese texto.");
  if (!T.llamado) avisos.push("El cierre llegó sin llamado a la acción: la tarjeta va sin botón.");
  const vertical = alto >= ancho;
  const k = vertical ? ancho / 1080 : (alto / 1080) * 0.8;
  // Los tamaños del contrato son de diseño (px de letra, como en la web). En ASS el tamaño es el alto del
  // renglón entero: para Montserrat hay que multiplicar por 1,22 para que la letra mida lo mismo.
  const kt = k * 1.22;
  const arriba = Math.round(alto * 0.125);
  const abajo = Math.round(alto * (vertical ? 0.835 : 0.9));
  const colTexto = vertical ? { cx: ancho / 2, w: ancho } : { cx: ancho * 0.72, w: ancho * 0.5 };
  const colProd = vertical ? { cx: ancho / 2, w: ancho * 0.62, h: alto * 0.46 } : { cx: ancho * 0.26, w: ancho * 0.4, h: alto * 0.7 };

  // ---- tamaños de la foto ----
  let dim = { ancho: 0, alto: 0 };
  let clara = false;
  if (foto) {
    dim = await ff.dimensiones(foto, carpeta);
    if (!dim.ancho) foto = null;
    else clara = await esFondoClaro(ff, foto, carpeta);
  }
  if (!foto) avisos.push("La escena de cierre no trae foto del producto: la tarjeta va solo con los textos.");

  // ---- textos: se ajustan y, si no dejan sitio al producto, se achican todos a la vez ----
  let L = null;
  for (let f = 1; f >= 0.55; f -= 0.09) {
    const principal = T.principal
      ? await ajustarTexto(ff, carpeta, T.principal, { fuente: "Montserrat ExtraBold", tamMax: (T.esTitular ? 150 : 104) * kt * f, tamMin: (T.esTitular ? 90 : 58) * kt * f, anchoMax: colTexto.w * 0.86, maxRenglones: T.esTitular ? 1 : 3, espaciadoRel: -0.01 })
      : null;
    const detalle = T.detalle ? await ajustarTexto(ff, carpeta, T.detalle, { fuente: "Montserrat SemiBold", tamMax: 54 * kt * f, tamMin: 40 * kt * f, anchoMax: colTexto.w * 0.84, maxRenglones: 2 }) : null;
    const padX = Math.round(56 * k * f);
    const padY = Math.round(30 * k * f);
    const llamado = T.llamado ? await ajustarTexto(ff, carpeta, T.llamado, { fuente: "Montserrat", negrita: true, tamMax: 46 * kt * f, tamMin: 36 * kt * f, anchoMax: colTexto.w * 0.84 - 2 * padX, maxRenglones: 2 }) : null;
    const urgencia = T.urgencia ? await ajustarTexto(ff, carpeta, T.urgencia.toUpperCase(), { fuente: "Montserrat", negrita: true, tamMax: 30 * kt * f, tamMin: 22 * kt * f, anchoMax: colTexto.w * 0.84, maxRenglones: 2, espaciadoRel: 0.06 }) : null;
    const paso = (b) => Math.round(b.tam * 1.1);
    const h = {
      urgencia: urgencia ? urgencia.renglones.length * paso(urgencia) : 0,
      principal: principal ? principal.renglones.length * paso(principal) : 0,
      detalle: detalle ? detalle.renglones.length * paso(detalle) : 0,
      boton: llamado ? llamado.renglones.length * paso(llamado) + 2 * padY : 0,
    };
    const sep = { prod: Math.round(46 * k), urgencia: Math.round(20 * k), detalle: Math.round(18 * k), boton: Math.round(44 * k) };
    const altoTextos = h.urgencia + (h.urgencia ? sep.urgencia : 0) + h.principal + (h.detalle ? sep.detalle + h.detalle : 0) + (h.boton ? sep.boton + h.boton : 0);
    // Producto: entero, lo más grande que quepa en su caja.
    let pw = 0;
    let ph = 0;
    if (foto) {
      const maxH = vertical ? Math.min(colProd.h, abajo - arriba - altoTextos - sep.prod) : Math.min(colProd.h, abajo - arriba);
      const e = Math.min(colProd.w / dim.ancho, maxH / dim.alto);
      pw = par(dim.ancho * e);
      ph = par(dim.alto * e);
    }
    L = { f, principal, detalle, llamado, urgencia, padX, padY, h, sep, altoTextos, pw, ph, paso };
    const cabe = vertical ? !foto || ph >= alto * 0.2 : altoTextos <= abajo - arriba;
    if (cabe) break;
  }
  if (L.f < 0.8) avisos.push("Los textos del cierre son muy largos: la tarjeta se achicó para que cupieran completos. Conviene acortarlos.");

  // ---- reparto vertical ----
  const zonas = { producto: null, urgencia: null, principal: null, detalle: null, boton: null, seguro: { y0: Math.round(alto * 0.12), y1: Math.round(alto * (vertical ? 0.84 : 0.92)) } };
  let y;
  let centroProd = null;
  if (vertical) {
    const total = (foto ? L.ph + L.sep.prod : 0) + L.altoTextos;
    y = arriba + Math.max(0, Math.round((abajo - arriba - total) * 0.4));
    if (foto) {
      zonas.producto = { x: Math.round(colProd.cx - L.pw / 2), y, w: L.pw, h: L.ph };
      centroProd = { x: Math.round(colProd.cx), y: Math.round(y + L.ph / 2) };
      y += L.ph + L.sep.prod;
    }
  } else {
    if (foto) {
      const py = Math.round((arriba + abajo) / 2 - L.ph / 2);
      zonas.producto = { x: Math.round(colProd.cx - L.pw / 2), y: py, w: L.pw, h: L.ph };
      centroProd = { x: Math.round(colProd.cx), y: Math.round(py + L.ph / 2) };
    }
    y = Math.round((arriba + abajo) / 2 - L.altoTextos / 2);
  }
  const cx = Math.round(colTexto.cx);

  // ---- textos y botón (ASS) con su entrada ----
  const estilos = [
    `Style: CForma,Montserrat,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`,
    `Style: CTit,Montserrat ExtraBold,100,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`,
    `Style: CDet,Montserrat SemiBold,54,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`,
    `Style: CBot,Montserrat,46,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`,
  ];
  const eventos = [];
  const fin = `0:00:${String(Math.ceil(dura + 1)).padStart(2, "0")}.00`;
  const sube = Math.round(24 * k);
  const linea = (capa, est, tags, texto) => eventos.push(`Dialogue: ${capa},0:00:00.00,${fin},${est},,0,0,0,,{${tags}}${texto}`);
  // Entra subiendo `sube` px y apareciendo, desde `d0` ms. `alfa` = transparencia final (00 = opaco).
  const entra = (x, yy, d0, alfa = "00") => `\\q2\\an5\\move(${x},${yy + sube},${x},${yy},${d0},${d0 + 380})\\alpha&HFF&\\t(${d0},${d0 + 300},\\alpha&H${alfa}&)`;
  const conSombra = (est, x, yy, d0, tam, extra, texto, alfa = "00") => {
    linea(2, est, `${entra(x + Math.round(2 * k), yy + Math.round(5 * k), d0, "78")}\\fs${tam}${extra}\\1c&H000000&\\blur${Math.max(3, Math.round(9 * k))}`, texto);
    linea(3, est, `${entra(x, yy, d0, alfa)}\\fs${tam}${extra}`, texto);
  };
  const T0 = 120; // textos: 0,12 s después del producto
  if (L.principal) {
    const b = L.principal;
    const p = L.paso(b);
    zonas.principal = { x: Math.round(cx - b.ancho / 2), y, w: Math.round(b.ancho), h: b.renglones.length * p };
    b.renglones.forEach((r, i) => conSombra("CTit", cx, y + Math.round(p * (i + 0.5)), T0, b.tam, `\\fsp${(b.tam * -0.01).toFixed(1)}`, r));
    y += b.renglones.length * p;
  }
  if (L.detalle) {
    const b = L.detalle;
    const p = L.paso(b);
    y += L.sep.detalle;
    zonas.detalle = { x: Math.round(cx - b.ancho / 2), y, w: Math.round(b.ancho), h: b.renglones.length * p };
    b.renglones.forEach((r, i) => conSombra("CDet", cx, y + Math.round(p * (i + 0.5)), T0 + 40, b.tam, "", r, "14")); // blanco al 92 %
    y += b.renglones.length * p;
  }
  if (L.urgencia) {
    // Urgencia: una línea corta en mayúsculas pequeñas, del color de la marca aclarado, entre el detalle y el botón.
    // Solo se dibuja si el CRM la manda, con sus palabras.
    const b = L.urgencia;
    const p = L.paso(b);
    y += L.sep.urgencia;
    zonas.urgencia = { x: Math.round(cx - b.ancho / 2), y, w: Math.round(b.ancho), h: b.renglones.length * p };
    const tinta = colorLegible(T.color, 0.5) || "FFFFFF";
    b.renglones.forEach((t, n) => conSombra("CBot", cx, y + Math.round(p * (n + 0.5)), T0 + 80, b.tam, `\\fsp${(b.tam * 0.06).toFixed(1)}\\1c&H${bgr(tinta)}&`, t, "14"));
    y += b.renglones.length * p;
  }
  if (L.llamado) {
    const b = L.llamado;
    const p = L.paso(b);
    y += L.sep.boton;
    const w = Math.round(Math.min(colTexto.w * 0.84, b.ancho + 2 * L.padX));
    const h = L.h.boton;
    const cy = y + Math.round(h / 2);
    zonas.boton = { x: Math.round(cx - w / 2), y, w, h };
    // El botón entra el último, con un rebote mínimo (100 → 104 → 100 %).
    const B0 = 370;
    const rebote = `\\an5\\pos(${cx},__Y__)\\alpha&HFF&\\t(${B0},${B0 + 130},\\alpha&H__A__&)\\fscx100\\fscy100\\t(${B0},${B0 + 110},\\fscx104\\fscy104)\\t(${B0 + 110},${B0 + 230},\\fscx100\\fscy100)`;
    const con = (yy, a) => rebote.replace("__Y__", String(yy)).replace("__A__", a);
    linea(1, "CForma", `${con(cy + Math.round(10 * k), "88")}\\1c&H000000&\\blur${Math.max(4, Math.round(14 * k))}\\p1`, `${redondeado(w, h, h / 2)}{\\p0}`);
    linea(2, "CForma", `${con(cy, "00")}\\1c&H${bgr(T.color)}&\\p1`, `${redondeado(w, h, h / 2)}{\\p0}`);
    b.renglones.forEach((r, i) => linea(3, "CBot", `${con(Math.round(y + L.padY + p * (i + 0.5)), "00")}\\q2\\fs${b.tam}\\1c&H${bgr(T.textoBoton)}&`, r));
    y += h;
  }

  // ---- imágenes fijas (en la caché): fondo y producto con sombra ----
  const usados = [];
  const existe = (f) => fs.existsSync(path.join(carpeta, f)) && fs.statSync(path.join(carpeta, f)).size > 500;
  // Fondo: la foto del cierre; si es de fondo blanco, el último cuadro de la escena anterior.
  const origen = foto && !clara ? { archivo: foto, segundo: null } : previa && previa.archivo ? previa : null;
  const fondo = `cf-${huella("fondo-v1", origen ? [origen.archivo, origen.segundo] : ["degradado", T.color], ancho, alto)}.jpg`;
  await conCerrojo(fondo, async () => {
    if (existe(fondo)) return;
    const oscuro = "lutrgb=r='val*0.55':g='val*0.55':b='val*0.55'"; // capa negra al 45 %
    if (origen) {
      const q = par(ancho / 4);
      const r = par(alto / 4);
      // Desenfoque gaussiano de ≈ 40 px a 1080 de ancho (se hace a un cuarto de tamaño: 10 px).
      await ff.ffmpeg([...(origen.segundo !== null && origen.segundo !== undefined ? ["-ss", String(Math.max(0, origen.segundo))] : []), "-i", origen.archivo, "-frames:v", "1", "-vf", `scale=${q}:${r}:force_original_aspect_ratio=increase,crop=${q}:${r},gblur=sigma=${(10 * (ancho / 1080)).toFixed(1)},scale=${ancho}:${alto}:flags=bicubic,${oscuro}`, "-q:v", "3", "-update", "1", `tmp-${fondo}`], carpeta);
    } else {
      // Sin foto ni escena anterior: un degradado del color de la marca (nunca un gris plano).
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(T.color.slice(i, i + 2), 16));
      const c = (m) => `0x${[r, g, b].map((v) => Math.round(v * m).toString(16).padStart(2, "0")).join("")}`;
      await ff.ffmpeg(["-f", "lavfi", "-i", `gradients=s=${ancho}x${alto}:c0=${c(0.62)}:c1=${c(0.12)}:x0=0:y0=0:x1=0:y1=${alto}:nb_colors=2:d=1:r=1`, "-frames:v", "1", "-q:v", "3", "-update", "1", `tmp-${fondo}`], carpeta);
    }
    fs.renameSync(path.join(carpeta, `tmp-${fondo}`), path.join(carpeta, fondo));
  });
  usados.push(fondo);

  let tarjeta = null;
  const m = Math.round(150 * k); // margen alrededor para que quepa la sombra
  if (foto) {
    const R = Math.round(36 * k);
    tarjeta = `ct-${huella("tarjeta-v1", foto, L.pw, L.ph, R, m)}.png`;
    await conCerrojo(tarjeta, async () => {
      if (existe(tarjeta)) return;
      const W = L.pw;
      const H = L.ph;
      // Esquinas redondeadas con borde suave: la transparencia sale de la distancia al centro de cada esquina.
      const alfa = `255*clip(${R}+0.5-hypot(max(max(${R}-X,X-(${W - 1 - R})),0),max(max(${R}-Y,Y-(${H - 1 - R})),0)),0,1)`;
      await ff.ffmpeg(
        [
          "-i", foto,
          "-filter_complex",
          // la foto entera sobre blanco (por si trae transparencia), a su tamaño final, con las esquinas redondeadas
          `color=c=white:s=${W}x${H}:d=1:r=1,format=rgba[blanco];[0:v]select='eq(n,0)',scale=${W}:${H},format=rgba[f0];[blanco][f0]overlay=format=auto,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alfa}',format=rgba,split[p][q];` +
            // sombra suave: la silueta en negro al 45 %, desenfocada 60 px y corrida 24 px hacia abajo
            `[q]alphaextract,format=gray,pad=w=iw+${2 * m}:h=ih+${2 * m}:x=${m}:y=${m + Math.round(24 * k)}:color=black,gblur=sigma=${(30 * k).toFixed(1)},lut=c0='val*0.45'[sa];` +
            `color=c=black:s=${W + 2 * m}x${H + 2 * m}:d=1:r=1,format=rgba[negro];[negro][sa]alphamerge[sombra];[sombra][p]overlay=${m}:${m}:format=auto,format=rgba`,
          "-frames:v", "1", "-update", "1", `tmp-${tarjeta}`,
        ],
        carpeta,
      );
      fs.renameSync(path.join(carpeta, `tmp-${tarjeta}`), path.join(carpeta, tarjeta));
    });
    usados.push(tarjeta);
  }

  // ---- composición animada ----
  const entradas = ["-loop", "1", "-framerate", String(fps), "-t", String(dura + 0.5), "-i", fondo];
  const filtros = [`[0:v]fps=${fps},format=yuv420p,fade=t=in:st=0:d=0.3[cfondo]`];
  if (tarjeta) {
    entradas.push("-loop", "1", "-framerate", String(fps), "-t", String(dura + 0.5), "-i", tarjeta);
    // El producto crece de 94 a 100 % en 0,5 s (frenando al final) mientras aparece; después queda quieto.
    const Z = "(0.94+0.06*(1-pow(1-min(t/0.5,1),3)))";
    filtros.push(`[1:v]fps=${fps},format=rgba,fade=t=in:st=0:d=0.4:alpha=1,scale=w='2*trunc(iw*${Z}/2)':h='2*trunc(ih*${Z}/2)':eval=frame[cprod]`);
    filtros.push(`[cfondo][cprod]overlay=x='${centroProd.x}-w/2':y='${centroProd.y}-h/2':eval=frame:format=auto[base]`);
  } else {
    filtros.push("[cfondo]null[base]");
  }
  return {
    entradas,
    nEntradas: tarjeta ? 2 : 1,
    filtros,
    estilos,
    eventos,
    firma: ["cierre-v1", fondo, tarjeta, T, L.f, eventos, centroProd],
    zonas,
    avisos,
    usados,
    fondoDe: origen ? (origen === previa ? "escena-anterior" : "foto") : "degradado",
    fotoClara: clara,
  };
}

module.exports = { prepararCierre, textosDelCierre, medirTextos, ajustarTexto, esFondoClaro, redondeado };
