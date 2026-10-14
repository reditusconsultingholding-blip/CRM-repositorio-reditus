"use strict";
// Control de cada clip para la auditoría automática del CRM (contrato: «Cambios», 20-oct):
//
//   · 3 a 5 fotogramas JPG por clip: inicio, medio, final y uno por cada tramo de `cortes` (si los hay).
//     Se suben con { tipo: "fotograma-clip", escena: n, indice } y van en `progreso.escenas[].fotogramas`.
//   · Una medida BARATA de estabilidad (solo ffmpeg, sin IA): el parecido estructural (SSIM) entre
//     cada cuadro y el siguiente, a 10 cuadros por segundo y en pequeño. Un clip de IA es una sola toma
//     continua: un bajón brusco del parecido entre dos cuadros seguidos es un salto, un parpadeo o una
//     deformación repentina («morphing»).
//
// LÍMITES de la medida (dichos también en el contrato):
//   · Mide el cuadro ENTERO, no el producto: ffmpeg no sabe dónde está el producto. Una deformación lenta
//     del producto (que cambia de forma poco a poco) casi no baja el SSIM y NO se detecta; para eso
//     están los fotogramas, que el CRM mira con su IA de visión.
//   · Los movimientos rápidos de cámara bajan el SSIM medio sin ser un defecto: por eso se marcan como
//     salto solo las caídas BRUSCAS respecto a la mediana del propio clip.
const redondo = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

/** Los segundos de los que se sacan fotogramas: inicio, medio, final y el centro de cada tramo de `cortes`. */
function momentosDelClip(dura, cortes = null, maximo = 5) {
  const base = [Math.min(0.1, dura / 10), dura / 2, Math.max(0, dura - 0.15)];
  const extra = [];
  for (const c of Array.isArray(cortes) ? cortes : []) {
    const d = Number(c && c.desde);
    const h = Math.min(Number(c && c.hasta), dura);
    if (Number.isFinite(d) && Number.isFinite(h) && h > d && d < dura) extra.push((d + h) / 2);
  }
  const todos = [...base];
  for (const s of extra) {
    if (todos.length >= Math.max(3, maximo)) break;
    if (todos.every((x) => Math.abs(x - s) >= 0.4)) todos.push(s);
  }
  return todos.sort((a, b) => a - b).map((s) => redondo(Math.max(0, Math.min(dura - 0.05, s)), 2));
}

/**
 * Estabilidad del clip: { ssimMedio, ssimMinimo, saltos: [segundos], inestable, cuadros }.
 * Devuelve null si el clip es demasiado corto para medir.
 */
async function estabilidad(ff, archivo, carpeta, base = "clip") {
  const log = `${base}-ssim.log`;
  const fs = require("fs");
  const path = require("path");
  await ff.ffmpeg(
    ["-i", archivo, "-filter_complex", `[0:v]fps=10,scale=192:-2,format=gray,split[a][b];[b]trim=start_frame=1,setpts=PTS-STARTPTS[b2];[a]setpts=PTS-STARTPTS[a2];[a2][b2]ssim=stats_file=${log}:shortest=1`, "-an", "-f", "null", "-"],
    carpeta,
  );
  const texto = fs.readFileSync(path.join(carpeta, log), "utf8");
  fs.rmSync(path.join(carpeta, log), { force: true });
  const v = [...texto.matchAll(/n:(\d+)\b.*?All:([\d.]+)/g)].map((m) => ({ n: Number(m[1]), s: Number(m[2]) })).filter((x) => Number.isFinite(x.s));
  if (v.length < 4) return null;
  const orden = v.map((x) => x.s).sort((a, b) => a - b);
  const mediana = orden[Math.floor(orden.length / 2)];
  const medio = v.reduce((a, x) => a + x.s, 0) / v.length;
  // Salto: el parecido con el cuadro siguiente cae muy por debajo de lo normal en ese clip.
  const umbral = Math.min(0.7, mediana - 0.25); // calibrado con clips reales: un gesto rápido de la mano baja a ~0,74; un salto de verdad, a ~0,3
  const saltos = [];
  for (const x of v) {
    if (x.s < umbral) {
      const t = redondo(x.n / 10, 1); // el cuadro n (desde 1) compara el segundo (n-1)/10 con n/10
      if (!saltos.length || t - saltos[saltos.length - 1] > 0.25) saltos.push(t);
    }
  }
  return { ssimMedio: redondo(medio), ssimMinimo: redondo(orden[0]), saltos: saltos.slice(0, 10), inestable: saltos.length > 0, cuadros: v.length + 1 };
}

/**
 * Saca los fotogramas del clip (JPG de 768 px en su lado mayor) y mide su estabilidad.
 * Devuelve { archivos: ["clip-02-f1.jpg", …], momentos: [s…], estabilidad }.
 */
async function controlDelClip({ ff, carpeta, archivo, n, cortes = null, maximo = 5, medir = true }) {
  const dura = await ff.duracion(archivo, carpeta);
  const momentos = momentosDelClip(dura, cortes, maximo);
  const archivos = [];
  for (const [i, s] of momentos.entries()) {
    const jpg = `clip-${String(n).padStart(2, "0")}-f${i + 1}.jpg`;
    await ff.ffmpeg(["-ss", String(s), "-i", archivo, "-frames:v", "1", "-vf", "scale='if(gt(iw,ih),768,-2)':'if(gt(iw,ih),-2,768)'", "-q:v", "4", "-update", "1", jpg], carpeta);
    archivos.push(jpg);
  }
  let est = null;
  if (medir) {
    try {
      est = await estabilidad(ff, archivo, carpeta, `clip-${n}`);
    } catch {
      est = null; // la medida es opcional
    }
  }
  return { archivos, momentos, estabilidad: est };
}

module.exports = { momentosDelClip, estabilidad, controlDelClip };
