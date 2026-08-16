"use server";

import { requireProfile } from "@/lib/auth";
import { computeCeoReport, formatCeoReportText } from "@/lib/ceo-report";
import { CEO_KNOWLEDGE } from "@/lib/ceo-knowledge";
import { crearCotizacionDesdeChat } from "@/lib/chat-tools";

type ChatMsg = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `Eres el asistente de negocio privado del CEO de Reditus Consulting, una agencia
de marketing en LatAm. Solo el CEO puede verte. Respondes en español, de forma directa y ejecutiva,
sobre el estado del negocio, rentabilidad, nómina, equipo, precios y políticas internas, usando los
datos que se te dan en cada mensaje — esos datos se recalculan en vivo desde la base de datos justo
antes de responderte, así que siempre reflejan el estado actual, no una foto vieja. Si no tienes un
dato, dilo claramente en vez de inventarlo. Sé breve salvo que te pidan detalle.

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

export async function askCeoAssistant(history: ChatMsg[]) {
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

  const report = await computeCeoReport();
  const businessContext = formatCeoReportText(report);
  const system = `${SYSTEM_PROMPT}\n\nDatos actuales del negocio (calculados justo ahora):\n${businessContext}\n\nConocimiento interno de la empresa (manuales):\n${CEO_KNOWLEDGE}`;

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
}
