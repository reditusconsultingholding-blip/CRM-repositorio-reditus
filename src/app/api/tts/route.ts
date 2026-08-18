import { NextResponse, type NextRequest } from "next/server";
import { requireProfile } from "@/lib/auth";
import { markdownToSpeechText } from "@/lib/speech-text";

export const runtime = "nodejs";

/** Convierte texto a voz con ElevenLabs para el Asistente CEO — solo el
 * CEO puede usarlo. Si no hay API key configurada, responde 501 para que
 * el cliente caiga de vuelta a la voz nativa del navegador. */
export async function POST(request: NextRequest) {
  const profile = await requireProfile();
  if (profile.role !== "ceo") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    return NextResponse.json({ error: "ElevenLabs no está configurado." }, { status: 501 });
  }

  const { text } = await request.json();
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Falta el texto." }, { status: 400 });
  }

  const clean = markdownToSpeechText(text).slice(0, 2000);

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "audio/mpeg",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text: clean,
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ error: `ElevenLabs falló (${res.status}): ${detail.slice(0, 200)}` }, { status: 502 });
  }

  const audio = await res.arrayBuffer();
  return new NextResponse(audio, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
