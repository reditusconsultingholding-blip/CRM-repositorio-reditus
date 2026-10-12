import "server-only";

// Llamada única a la IA de texto (Anthropic). La comparten el embudo de
// prospección (`prospeccion-server.ts`) y «Crear video» (`videos-server.ts`):
// misma clave, mismo modelo y mismo manejo de errores. Nunca lanza: si falta
// la clave o la IA falla devuelve `{ error }` con un texto que se le puede
// mostrar a la persona.

export const MODELO_IA = "claude-sonnet-5";

export type ResultadoIA = { texto: string } | { error: string };

export async function llamarClaude(system: string, user: string, maxTokens: number): Promise<ResultadoIA> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      error:
        "La IA no está activada: falta ANTHROPIC_API_KEY en las variables de entorno. Mientras tanto puedes escribirlo a mano.",
    };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELO_IA,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      return { error: `La IA no respondió (${res.status}). ${detalle.slice(0, 160)}`.trim() };
    }
    const data = await res.json();
    const texto = (data?.content ?? [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("\n")
      .trim();
    if (!texto) return { error: "La IA respondió vacío. Intenta de nuevo." };
    return { texto };
  } catch (err) {
    return { error: `No se pudo contactar a la IA: ${err instanceof Error ? err.message : "error de red"}` };
  }
}
