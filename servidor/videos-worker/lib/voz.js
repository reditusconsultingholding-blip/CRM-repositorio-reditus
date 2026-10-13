"use strict";
// Voz con ElevenLabs (opcional). Mismos nombres de variable que usa el CRM:
// ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID. Sin clave no hay voz: el video
// sale mudo (con subtítulos) y el trabajador lo reporta.
//
// Contrato usado (el mismo que ya usa el CRM en /api/tts):
//   POST https://api.elevenlabs.io/v1/text-to-speech/<voice_id>
//   cabeceras: xi-api-key, content-type: application/json, accept: audio/mpeg
//   cuerpo: { text, model_id, voice_settings }   →   audio/mpeg
const fs = require("fs");
const { esperar } = require("./red");

function disponible(cfg) {
  return !!(cfg.elevenKey && cfg.elevenVoz);
}

/** Genera el audio de un texto y lo guarda en `destino` (.mp3). */
async function generar(cfg, texto, destino) {
  const opciones = cfg.config.voz || {};
  let ultimo;
  for (const espera of [0, 3000, 12000]) {
    if (espera) await esperar(espera);
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cfg.elevenVoz)}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "audio/mpeg", "xi-api-key": cfg.elevenKey },
        body: JSON.stringify({
          text: texto.slice(0, 2500),
          model_id: opciones.modelo || "eleven_turbo_v2_5",
          voice_settings: { stability: opciones.estabilidad ?? 0.5, similarity_boost: opciones.similitud ?? 0.75 },
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        const detalle = (await res.text().catch(() => "")).slice(0, 200);
        const error = new Error(`ElevenLabs respondió ${res.status}: ${detalle}`);
        // Clave mala o sin saldo: reintentar no lo arregla.
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          error.sinRemedio = true;
          throw error;
        }
        throw error;
      }
      fs.writeFileSync(destino, Buffer.from(await res.arrayBuffer()));
      if (fs.statSync(destino).size < 500) throw new Error("ElevenLabs devolvió un audio vacío");
      return destino;
    } catch (e) {
      ultimo = e;
      if (e.sinRemedio) break;
    }
  }
  throw ultimo;
}

module.exports = { disponible, generar };
