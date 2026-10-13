import "server-only";
import { dobleDeIA } from "@/lib/ia-doble";

// Llamada única a la IA de texto (Anthropic). La comparten el embudo de
// prospección (`prospeccion-server.ts`) y «Crear video» (`videos-server.ts`):
// misma clave, mismo modelo y mismo manejo de errores. Nunca lanza: si falta
// la clave o la IA falla devuelve `{ error }` con un texto que se le puede
// mostrar a la persona.

export const MODELO_IA = "claude-sonnet-5";

const MARGEN_PENSAR = 8000;

export type ResultadoIA = { texto: string } | { error: string };

/**
 * Igual que `llamarClaude`, pero la persona manda además imágenes. Van como
 * bloques `image` con `source: { type: "url" }` de la API de mensajes: solo
 * enlaces https públicos (los descarga Anthropic, no este servidor).
 */
export async function llamarClaudeConImagenes(system: string, user: string, imagenes: string[], maxTokens: number, maxImagenes = 4): Promise<ResultadoIA> {
  const urls = imagenes.filter((u) => /^https:\/\//i.test(u)).slice(0, maxImagenes);
  if (!urls.length) return { error: "No hay fotos con enlace https para analizar." };
  return llamarClaude(system, [...urls.map((url) => ({ type: "image" as const, source: { type: "url" as const, url } })), { type: "text" as const, text: user }], maxTokens);
}

type BloqueIA = { type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } };

export async function llamarClaude(system: string, user: string | BloqueIA[], maxTokens: number, opciones: { sinPensar?: boolean } = {}): Promise<ResultadoIA> {
  // Doble de prueba: SOLO con la cola de prueba y pedido a propósito (IA_DOBLE=1). Nunca en producción.
  const doble = dobleDeIA(system, user);
  if (doble) return doble;
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
        // El modelo piensa antes de escribir y ese razonamiento gasta del mismo tope:
        // con topes cortos (400–1700) la respuesta salía vacía. Se deja margen para pensar.
        // `sinPensar`: para salidas largas y mecánicas (el plan en JSON), donde el razonamiento se comía todo el tope.
        ...(opciones.sinPensar ? { max_tokens: maxTokens, thinking: { type: "disabled" } } : { max_tokens: maxTokens + MARGEN_PENSAR, output_config: { effort: "medium" } }),
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
    if (!texto) return { error: `La IA respondió vacío (${data?.stop_reason ?? "sin motivo"}). Intenta de nuevo.` };
    return { texto };
  } catch (err) {
    return { error: `No se pudo contactar a la IA: ${err instanceof Error ? err.message : "error de red"}` };
  }
}
