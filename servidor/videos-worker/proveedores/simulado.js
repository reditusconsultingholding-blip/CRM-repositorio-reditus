"use strict";
// Proveedor de prueba: no llama a nadie ni gasta. Hace cada clip con ffmpeg
// (un fondo de color que se mueve + el número y el nombre de la escena), para
// probar TODO el recorrido: tomar, generar, montar, subtítulos, subir, aprobar.
const fs = require("fs");
const path = require("path");
const { esperar } = require("../lib/red");

const COLORES = ["0x1E3A5F", "0x5F1E3A", "0x1E5F3A", "0x5F4A1E", "0x3A1E5F", "0x1E5F5F", "0x5F1E1E"];

const sinLlaves = (t) => String(t).replace(/[{}\\\r\n]/g, " ").trim();

module.exports = {
  nombre: "simulado",

  comprobar() {
    return null;
  },

  async generarEscena(ctx) {
    const { escena, carpeta, salida, ff, cfg } = ctx;
    const opciones = (cfg.config.simulado || {});
    const segundos = Math.max(2, Math.ceil(escena.duracion));
    // Tamaño chico a propósito: el montaje lo lleva al tamaño final, como hará con los clips reales.
    const ancho = ctx.ancho >= ctx.alto ? 1280 : 720;
    const alto = ctx.ancho >= ctx.alto ? 720 : Math.round((720 * ctx.alto) / ctx.ancho / 2) * 2;

    // El texto va en un .ass (se nombra sin ruta: ffmpeg corre dentro de la carpeta).
    const rotulo = `sim-${escena.n}.ass`;
    const tam = Math.round(Math.min(ancho, alto) * 0.07);
    fs.writeFileSync(
      path.join(carpeta, rotulo),
      [
        "[Script Info]",
        "ScriptType: v4.00+",
        `PlayResX: ${ancho}`,
        `PlayResY: ${alto}`,
        "WrapStyle: 0",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        `Style: Sim,Arial,${tam},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,8,40,40,${Math.round(alto * 0.12)},1`,
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        `Dialogue: 0,0:00:00.00,0:10:00.00,Sim,,0,0,0,,{\\fs${tam * 2}}ESCENA ${escena.n}{\\fs${tam}}\\N${sinLlaves(escena.nombre).slice(0, 60)}\\N{\\fs${Math.round(tam * 0.7)}}CLIP SIMULADO · ${segundos} s${escena.usaImagenProducto ? " · con foto del producto" : ""}`,
        "",
      ].join("\n"),
    );

    if (opciones.demoraSegundos) {
      // Imita la espera de un proveedor real (y deja ver el estado «Generando» en el CRM).
      for (let i = 0; i < opciones.demoraSegundos; i++) await esperar(1000);
      await ctx.latir(`Escena ${escena.n}: clip simulado`);
    }

    const color = COLORES[(escena.n - 1) % COLORES.length];
    await ff.ffmpeg(
      [
        "-f", "lavfi", "-i", `color=c=${color}:s=${ancho}x${alto}:r=30:d=${segundos}`,
        "-f", "lavfi", "-i", `testsrc2=s=${Math.round(ancho / 3 / 2) * 2}x${Math.round(alto / 6 / 2) * 2}:r=30:d=${segundos}`,
        "-filter_complex", `[0:v][1:v]overlay=x='(W-w)/2+sin(t*1.5)*W/6':y='H*0.36'[f];[f]ass=${rotulo}[v]`,
        "-map", "[v]", "-t", String(segundos), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-an",
        salida,
      ],
      carpeta,
    );
    fs.rmSync(path.join(carpeta, rotulo), { force: true });
    return { segundos, modelo: "simulado", costoUsd: 0 };
  },
};
