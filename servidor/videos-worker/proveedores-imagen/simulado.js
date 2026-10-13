"use strict";
// Proveedor de imagen de prueba: no llama a nadie ni gasta. Hace la imagen con
// ffmpeg (un fondo de color + el número de la escena y el inicio de su prompt),
// para probar el recorrido completo: generar → subir → aprobar → clips → armado.
//
// Para probar que el fallo de una escena no tumba a las demás: un prompt que
// contenga «FALLA-IMAGEN» hace fallar esa escena a propósito.
const fs = require("fs");
const path = require("path");
const { esperar } = require("../lib/red");

const COLORES = ["0x27496D", "0x6D2749", "0x276D49", "0x6D5A27", "0x49276D", "0x276D6D", "0x6D2727"];

const sinLlaves = (t) => String(t).replace(/[{}\\\r\n]/g, " ").replace(/\s+/g, " ").trim();

/** Parte un texto en renglones de hasta `max` letras (para que quepa en la imagen). */
function renglones(texto, max, tope) {
  const salida = [];
  let actual = "";
  for (const p of sinLlaves(texto).split(" ")) {
    if (actual && (actual + " " + p).length > max) {
      salida.push(actual);
      actual = p;
    } else {
      actual = actual ? `${actual} ${p}` : p;
    }
  }
  if (actual) salida.push(actual);
  return salida.slice(0, tope);
}

module.exports = {
  nombre: "simulado",

  comprobar() {
    return null;
  },

  async generarImagen(ctx) {
    const { escena, carpeta, base, ff, cfg } = ctx;
    if (/FALLA-IMAGEN/.test(ctx.prompt || "")) throw new Error("Fallo simulado de esta imagen (el prompt trae «FALLA-IMAGEN»).");
    const demora = (cfg.config.simulado || {}).demoraSegundos || 0;
    for (let i = 0; i < demora; i++) await esperar(1000);
    if (demora) await ctx.latir(`Escena ${escena.n}: imagen simulada`);

    const ancho = ctx.ancho >= ctx.alto ? 1280 : 720;
    const alto = ctx.ancho >= ctx.alto ? 720 : Math.round((720 * ctx.alto) / ctx.ancho / 2) * 2;
    const tam = Math.round(Math.min(ancho, alto) * 0.06);
    const rotulo = `${base}.ass`;
    const texto = renglones(ctx.prompt || "(sin prompt)", 30, 6).join("\\N");
    fs.writeFileSync(
      path.join(carpeta, rotulo),
      [
        "[Script Info]",
        "ScriptType: v4.00+",
        `PlayResX: ${ancho}`,
        `PlayResY: ${alto}`,
        "WrapStyle: 2",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        `Style: Sim,Arial,${tam},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,5,30,30,30,1`,
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        `Dialogue: 0,0:00:00.00,0:00:10.00,Sim,,0,0,0,,{\\fs${tam * 2}}ESCENA ${escena.n}{\\fs${Math.round(tam * 0.8)}}\\NIMAGEN BASE SIMULADA · ${ctx.relacion}${ctx.referencias.length ? ` · ${ctx.referencias.length} foto(s) de referencia` : ""}\\N\\N{\\fs${tam}}${texto}`,
        "",
      ].join("\n"),
    );
    const archivo = `${base}.jpg`;
    const color = COLORES[(escena.n - 1) % COLORES.length];
    try {
      await ff.ffmpeg(
        [
          "-f", "lavfi", "-i", `color=c=${color}:s=${ancho}x${alto}:r=1:d=1`,
          "-f", "lavfi", "-i", `testsrc2=s=${Math.round(ancho / 3 / 2) * 2}x${Math.round(alto / 8 / 2) * 2}:r=1:d=1`,
          "-filter_complex", `[0:v][1:v]overlay=x=(W-w)/2:y=H*0.8[f];[f]ass=${rotulo}[v]`,
          "-map", "[v]", "-frames:v", "1", "-q:v", "3", "-update", "1", archivo,
        ],
        carpeta,
      );
    } finally {
      fs.rmSync(path.join(carpeta, rotulo), { force: true });
    }
    return { archivo, modelo: "simulado", creditos: 0, costoUsd: 0 };
  },
};
