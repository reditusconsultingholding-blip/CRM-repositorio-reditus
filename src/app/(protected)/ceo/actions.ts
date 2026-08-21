"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeCeoReport, formatCeoReportText } from "@/lib/ceo-report";
import { buildExtendedBusinessContext } from "@/lib/ceo-context";
import { CEO_KNOWLEDGE } from "@/lib/ceo-knowledge";
import { crearCotizacionDesdeChat } from "@/lib/chat-tools";

type ChatMsg = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `Eres el asesor de negocio privado y de confianza del CEO de Reditus Consulting
(agencia de marketing digital en LatAm: landing pages y videos creativos). Solo el CEO te ve. No eres
un simple lector de reportes — eres un experto estratégico que conoce el negocio a fondo (rentabilidad,
nómina, clientes, prospectos, equipo, y la estrategia propia de la empresa descrita más abajo) y da
consejo concreto y accionable, no genérico. Cuando algo amerite preocupación u oportunidad, dilo
directamente y con una recomendación clara — actúas como un buen asesor, no como un buzón de datos.

Responde en español, con seguridad y calidez — como un amigo de confianza que quiere que el negocio
crezca, no como un robot que recita cifras. Habla EN CONVERSACIÓN: reacciona a lo que te dice el CEO,
haz preguntas de vuelta cuando ayude a entender mejor la situación, y da tu opinión sin rodeos cuando
la tengas. Nunca respondas con solo un volcado de datos — cada respuesta debe sonar a que estás
pensando CON él, no escupiéndole un reporte. Los datos de negocio que se te dan en cada mensaje se
recalculan en vivo desde la base de datos justo antes de responder — siempre reflejan el estado actual.
Si no tienes un dato, dilo en vez de inventarlo.

Formato de respuesta: usa Markdown con criterio para que la información se entienda de un vistazo —
tablas para comparar cifras, listas para pasos o prioridades, **negritas** para lo importante. Cuando
un diagrama ayude más que texto (un flujo, un mapa mental de opciones, una jerarquía de prioridades),
inclúyelo como un bloque de código con lenguaje "mermaid" (sintaxis Mermaid: flowchart, mindmap, etc.)
— se renderiza como diagrama real. No lo uses si el texto solo ya es suficientemente claro; resérvalo
para cuando de verdad aclare algo.

Tienes una herramienta "crear_cotizacion" para generar cotizaciones reales en PDF (mismo formato que
la plantilla de Canva de la empresa) directamente desde esta conversación. Al usarla, ANTES de
llamarla confirma con el CEO los datos del pedido (cliente, WhatsApp, servicios, cantidades y precio si
no es el de tabla) — solo llama la herramienta cuando el CEO ya confirmó que quiere generarla. Esto
crea un ingreso REAL en el sistema (afecta el dashboard y la rentabilidad), no es un borrador.

No es posible generar cotizaciones directamente en Canva (la cuenta conectada no tiene el plan pago
que Canva exige para eso) — el PDF generado replica visualmente esa plantilla, es el sustituto ya
acordado con el CEO. Las cuentas de cobro/facturas se generan automáticamente cuando un ingreso se
marca como "Pagado" en /ingresos — no hay que crearlas por separado.`;

const TOOLS = [
  {
    name: "crear_cotizacion",
    description:
      "Crea una cotización real (PDF descargable) para un cliente, con una o varias líneas de servicio. Si no se da precio_unitario_usd para un ítem, se calcula automáticamente con la tabla de precios oficial de Reditus (landing pages y videos, con descuento por volumen).",
    input_schema: {
      type: "object" as const,
      properties: {
        cliente_nombre: { type: "string" as const },
        cliente_whatsapp: { type: "string" as const, description: "Número de WhatsApp del cliente (identificador único)." },
        cliente_pais: { type: "string" as const },
        cliente_tax_id: { type: "string" as const, description: "NIT o cédula, opcional." },
        items: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              servicio: { type: "string" as const },
              producto: { type: "string" as const },
              cantidad: { type: "integer" as const },
              precio_unitario_usd: { type: "number" as const },
            },
            required: ["producto", "cantidad"],
          },
        },
      },
      required: ["cliente_nombre", "cliente_whatsapp", "items"],
    },
  },
];

async function executeTool(name: string, input: Record<string, unknown>) {
  if (name === "crear_cotizacion") {
    const result = await crearCotizacionDesdeChat({
      cliente_nombre: String(input.cliente_nombre ?? ""),
      cliente_whatsapp: String(input.cliente_whatsapp ?? ""),
      cliente_pais: input.cliente_pais ? String(input.cliente_pais) : undefined,
      cliente_tax_id: input.cliente_tax_id ? String(input.cliente_tax_id) : undefined,
      items: (input.items as CrearCotizacionItemRaw[]) ?? [],
    });
    return {
      ok: true,
      tracking_id: result.trackingId,
      cotizacion_numero: result.cotizacionNumero,
      total_usd: result.totalUsd,
      cliente_es_nuevo: result.clienteEsNuevo,
      pdf_url: result.pdfUrl,
    };
  }
  return { ok: false, error: `Herramienta desconocida: ${name}` };
}

type CrearCotizacionItemRaw = {
  servicio?: string;
  producto: string;
  cantidad: number;
  precio_unitario_usd?: number;
};

async function callAnthropic(apiKey: string, system: string, messages: unknown[]) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1536,
      system,
      tools: TOOLS,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`El asistente no respondió (${res.status}). ${errText.slice(0, 200)}`);
  }

  return res.json();
}

// Nota: esta acción nunca lanza (throw) — cualquier falla se devuelve como
// un mensaje normal del asistente. Next.js oculta el mensaje real de un
// throw en una Server Action en producción, así que lanzar aquí terminaría
// mostrando el genérico "Minified React error #441" en vez de algo útil.
export async function askCeoAssistant(history: ChatMsg[]) {
  const profile = await requireProfile();
  if (profile.role !== "ceo") {
    return { role: "assistant" as const, content: "Solo el CEO puede usar este asistente." };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      role: "assistant" as const,
      content:
        "El asistente todavía no está activado: falta configurar ANTHROPIC_API_KEY en las variables de entorno de Vercel. Avísame cuando la agregues y quedará funcionando.",
    };
  }

  try {
    const [report, extendedContext] = await Promise.all([computeCeoReport(), buildExtendedBusinessContext()]);
    const businessContext = formatCeoReportText(report);
    const system = `${SYSTEM_PROMPT}\n\nDatos actuales del negocio (calculados justo ahora):\n${businessContext}\n\nContexto adicional (clientes, prospectos, equipo):\n${extendedContext}\n\nConocimiento interno de la empresa (manuales):\n${CEO_KNOWLEDGE}`;

    const messages: unknown[] = history.map((m) => ({ role: m.role, content: m.content }));

    // Loop de tool-use: hasta 3 rondas para evitar costos descontrolados si
    // el modelo encadena llamadas.
    for (let round = 0; round < 3; round++) {
      const data = await callAnthropic(apiKey, system, messages);

      if (data.stop_reason !== "tool_use") {
        const text = data?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "No obtuve respuesta.";
        return { role: "assistant" as const, content: text };
      }

      messages.push({ role: "assistant", content: data.content });

      const toolResults = [];
      for (const block of data.content) {
        if (block.type !== "tool_use") continue;
        let result;
        try {
          result = await executeTool(block.name, block.input);
        } catch (e) {
          result = { ok: false, error: e instanceof Error ? e.message : "Error ejecutando la herramienta." };
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return {
      role: "assistant" as const,
      content: "Se me acabaron los intentos usando herramientas — intenta reformular la pregunta.",
    };
  } catch (err) {
    return {
      role: "assistant" as const,
      content: `Tuve un problema respondiendo: ${err instanceof Error ? err.message : "error desconocido"}.`,
    };
  }
}

/** Historial persistente del Asistente CEO — antes vivía solo en memoria
 * del navegador y se perdía al salir de /ceo o recargar. */
export async function getCeoConversacion(): Promise<ChatMsg[]> {
  const profile = await requireProfile();
  if (profile.role !== "ceo") return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("ceo_asistente_mensajes")
    .select("role, content")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []) as ChatMsg[];
}

export async function guardarCeoMensajes(mensajes: ChatMsg[]): Promise<void> {
  const profile = await requireProfile();
  if (profile.role !== "ceo" || mensajes.length === 0) return;
  const supabase = await createClient();
  await supabase
    .from("ceo_asistente_mensajes")
    .insert(mensajes.map((m) => ({ user_id: profile.id, role: m.role, content: m.content })));
}

export async function limpiarCeoConversacion(): Promise<void> {
  const profile = await requireProfile();
  if (profile.role !== "ceo") return;
  const supabase = await createClient();
  await supabase.from("ceo_asistente_mensajes").delete().eq("user_id", profile.id);
}
