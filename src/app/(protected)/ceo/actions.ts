"use server";

import { requireProfile } from "@/lib/auth";

type ChatMsg = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `Eres el asistente de negocio privado del CEO de Reditus Consulting, una agencia
de marketing en LatAm. Solo el CEO puede verte. Respondes en español, de forma directa y ejecutiva,
sobre el estado del negocio, rentabilidad, nómina y equipo, usando los datos que se te dan en cada
mensaje. Si no tienes un dato, dilo claramente en vez de inventarlo. Sé breve salvo que te pidan detalle.`;

export async function askCeoAssistant(history: ChatMsg[], businessContext: string) {
  const profile = await requireProfile();
  if (profile.role !== "ceo") {
    throw new Error("Solo el CEO puede usar este asistente.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      role: "assistant" as const,
      content:
        "El asistente todavía no está activado: falta configurar ANTHROPIC_API_KEY en las variables de entorno de Vercel. Avísame cuando la agregues y quedará funcionando.",
    };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: `${SYSTEM_PROMPT}\n\nDatos actuales del negocio:\n${businessContext}`,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`El asistente no respondió (${res.status}). ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text ?? "No obtuve respuesta.";
  return { role: "assistant" as const, content: text };
}
