// Reditus CRM — agente de ventas de WhatsApp (línea 1).
//
// El "cerebro" (esta función) ya está completo y conectado al webhook en
// src/app/api/whatsapp/webhook/route.ts. Lo único que falta es que exista
// la credencial WHATSAPP_ACCESS_TOKEN + WHATSAPP_SALES_PHONE_NUMBER_ID +
// WHATSAPP_VERIFY_TOKEN (Meta Business Manager, gestionado por Sebastian)
// — sin eso, Meta nunca llama al webhook y esta función nunca se ejecuta.
//
// Diseño (aprovecha que Calendly ya tiene la calificación a fondo resuelta
// con 5 preguntas en el evento "Llamada Estratégica de Crecimiento
// Digital" — el agente no duplica esa lógica, solo hace un filtro liviano
// antes de compartir el link):
//   1. Saludo + entender qué necesita (protocolo comercial del documento
//      maestro: portafolio, precios de referencia).
//   2. 1-2 preguntas rápidas para descartar curiosos/spam obvio.
//   3. Si hay interés real → comparte el link de Calendly. Calendly hace
//      la calificación profunda (facturación, inversión en marketing,
//      urgencia, poder de decisión) al momento de agendar.
//   4. Si es evidente que no aplica → cierra cordialmente, sin gastar cupo.
//   5. Cada conversación crea/actualiza un `prospecto` en el CRM
//      (`estado: 'nuevo' | 'calificando' | 'descartado'`); cuando agenda
//      por Calendly, el cron diario (`src/lib/calendly.ts`) lo pasa a
//      `'agendado'` automáticamente.
//
// La base de conocimiento (misión, instrucciones, personalidad, contexto
// del negocio) vive en bot_knowledge_sections y la edita el CEO desde
// /whatsapp (dentro de la tarjeta "Línea de ventas") — este archivo solo
// trae el "cómo comportarse", el contenido real llega vía
// getBotKnowledgeForAgent().

import { getBotKnowledgeForAgent } from "@/lib/bot-knowledge";

function buildSystemPrompt(knowledge: string) {
  return `Eres el primer punto de contacto por WhatsApp de Reditus Consulting,
una agencia de marketing digital (landing pages y videos creativos) en LatAm. Respondes en español, cálido
pero directo, siguiendo este protocolo:

1. Saluda de forma personalizada y pregunta en qué puedes ayudar.
2. Si piden ejemplos o precios, comparte referencias generales usando la base de conocimiento de abajo
   (no inventes precios que no estén ahí — para el detalle exacto, eso se confirma en la llamada).
3. Haz 1-2 preguntas para entender si el negocio es real y tiene sentido para nosotros (¿tiene un
   negocio o marca activa? ¿qué está buscando lograr?). No hagas un interrogatorio largo — Calendly ya
   recoge el detalle fino al agendar.
4. Si hay interés genuino, comparte el link de agendamiento:
   https://calendly.com/reditusconsultingholding/15min — explica que es una sesión de diagnóstico
   estratégico gratuita de 15 minutos.
5. Si es claramente spam, broma, o no tiene nada que ver con nuestros servicios, despídete cordialmente
   sin insistir.

Nunca inventes precios exactos ni fechas de entrega que no estén respaldados por la base de conocimiento
— eso se confirma en la llamada o con el equipo comercial. Sé breve: mensajes de WhatsApp, no párrafos
largos.

=== BASE DE CONOCIMIENTO (precios, protocolo, información a recolectar) ===
${knowledge}`;
}

export type SalesAgentResult = {
  reply: string;
  prospectoEstado: "calificando" | "agendado" | "descartado";
};

/** Un turno del agente de ventas: recibe el mensaje entrante + el
 * histórico de la conversación, y devuelve la respuesta a enviar más el
 * nuevo estado del prospecto (heurística simple por palabras clave —
 * "agendado" real lo confirma igual el cron de Calendly cuando la
 * reunión efectivamente se agenda). */
export async function runSalesAgentTurn(params: {
  fromWhatsappNumber: string;
  incomingMessage: string;
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<SalesAgentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      reply:
        "Gracias por escribir a Reditus Consulting. En breve te atiende un asesor — mientras tanto puedes agendar directo aquí: https://calendly.com/reditusconsultingholding/15min",
      prospectoEstado: "calificando",
    };
  }

  const messages = [
    ...params.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: params.incomingMessage },
  ];

  const knowledge = await getBotKnowledgeForAgent();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 400,
      system: buildSystemPrompt(knowledge),
      messages,
    }),
  });

  if (!res.ok) {
    return {
      reply: "Gracias por tu mensaje, en breve te responde nuestro equipo.",
      prospectoEstado: "calificando",
    };
  }

  const data = await res.json();
  const reply: string =
    data?.content?.find((c: { type: string }) => c.type === "text")?.text ??
    "Gracias por tu mensaje, en breve te responde nuestro equipo.";

  // "agendado" real lo confirma el cron de Calendly cuando la reunión se
  // agenda de verdad — aquí solo distinguimos "calificando" (sigue en la
  // conversación, con o sin el link ya compartido) de "descartado" (el
  // propio agente cerró la conversación por no aplicar).
  const lower = reply.toLowerCase();
  const prospectoEstado: SalesAgentResult["prospectoEstado"] = /no (aplica|encajamos|es para (ti|ustedes))|no somos la mejor opción/.test(
    lower,
  )
    ? "descartado"
    : "calificando";

  return { reply, prospectoEstado };
}
