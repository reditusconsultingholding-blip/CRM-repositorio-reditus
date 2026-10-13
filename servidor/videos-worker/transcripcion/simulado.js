"use strict";
// Transcripción de PRUEBA: no llama a nadie ni escucha nada. Devuelve un texto fijo repartido
// sobre la duración del audio, para probar el recorrido del análisis. No usar en producción.
const { spawnSync } = require("child_process");

module.exports = {
  nombre: "simulado",
  comprobar() {
    return null;
  },
  async transcribir({ cfg, archivo, idioma }) {
    const r = spawnSync(cfg.ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", archivo], { windowsHide: true });
    const dura = Number(String(r.stdout || "").trim()) || 4;
    const frases = ["Frase de prueba uno.", "Frase de prueba dos."];
    return {
      idioma: idioma || "es",
      texto: frases.join(" "),
      segmentos: frases.map((texto, i) => ({ desde: (dura / frases.length) * i, hasta: (dura / frases.length) * (i + 1), texto })),
    };
  },
};
