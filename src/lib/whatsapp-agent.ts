// Reditus CRM — diseño del agente de ventas de WhatsApp (línea 1).
//
// TODAVÍA NO ESTÁ CONECTADO A NADA — no hay webhook de WhatsApp que lo
// invoque, porque falta el acceso a la WhatsApp Business API (Meta
// Business Manager o un proveedor como Twilio/360dialog, gestionado por
// Sebastian). Este archivo deja listo el "cerebro" del agente para cuando
// exista ese webhook: solo hay que llamar a `runSalesAgentTurn()` con cada
// mensaje entrante.
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

export const SALES_AGENT_SYSTEM_PROMPT = `Eres el primer punto de contacto por WhatsApp de Reditus Consulting,
una agencia de marketing digital (landing pages y videos creativos) en LatAm. Respondes en español, cálido
pero directo, siguiendo este protocolo:

1. Saluda de forma personalizada y pregunta en qué puedes ayudar.
2. Si piden ejemplos o precios, comparte referencias generales (no cotices con precisión por chat — eso
   se define en la llamada).
3. Haz 1-2 preguntas para entender si el negocio es real y tiene sentido para nosotros (¿tiene un
   negocio o marca activa? ¿qué está buscando lograr?). No hagas un interrogatorio largo — Calendly ya
   recoge el detalle fino al agendar.
4. Si hay interés genuino, comparte el link de agendamiento:
   https://calendly.com/reditusconsultingholding/15min — explica que es una sesión de diagnóstico
   estratégico gratuita de 15 minutos.
5. Si es claramente spam, broma, o no tiene nada que ver con nuestros servicios, despídete cordialmente
   sin insistir.

Nunca inventes precios exactos ni fechas de entrega — eso se confirma en la llamada o con el equipo
comercial. Sé breve: mensajes de WhatsApp, no párrafos largos.`;

export type SalesAgentResult = {
  reply: string;
  prospectoEstado: "calificando" | "agendado" | "descartado";
};

// Placeholder de la función que se conectará al webhook de WhatsApp una vez
// exista. La firma ya refleja lo que va a necesitar: el mensaje entrante,
// el histórico de la conversación, y el número del remitente para
// crear/actualizar su prospecto en la base de datos.
export async function runSalesAgentTurn(params: {
  fromWhatsappNumber: string;
  incomingMessage: string;
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<SalesAgentResult> {
  throw new Error(
    `runSalesAgentTurn: pendiente de conectar (webhook de WhatsApp) — mensaje recibido de ${params.fromWhatsappNumber} sin procesar.`,
  );
}
