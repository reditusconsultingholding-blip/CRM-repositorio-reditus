import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { CEO_KNOWLEDGE } from "@/lib/ceo-knowledge";

export type BotKnowledgeSection = { id: string; titulo: string; contenido: string; orden: number };

const PREGUNTAS_AGENDAMIENTO = `Nombre comercial del producto:
Recomendaciones de ángulos de venta:
Precios del producto (Valor x1 - Valor x2 - Valor x3). Si tiene obsequios, añadirlos.
Si cuenta con alguna oferta (2x1, envío contra entrega, envío gratis u obsequios que incluya el pedido):
Métodos de pago vigentes actualmente:
Identidad Gráfica o redes sociales:`;

const ESTRUCTURA_TECNICA = `Información del producto/servicio: qué vende, presentaciones/planes y precios, qué incluye
cada uno, beneficios/características principales, respaldo o certificación si tiene.
Uso/experiencia: cómo se usa, para quién es (y para quién no), condiciones o cuidados especiales,
frecuencia de recompra.
Logística: políticas de envío, cómo se conserva el producto, garantía/cambios/devoluciones.
Preguntas frecuentes y objeciones: las 5-10 preguntas más comunes antes de comprar, las objeciones
más frecuentes (precio, confianza, comparación con competencia), con qué otras marcas comparan.`;

// Semilla inicial — 4 secciones que cualquier CEO puede seguir editando o
// ampliando desde /whatsapp. Solo se usa la primera vez (tabla vacía).
const DEFAULT_SECTIONS: { titulo: string; contenido: string; orden: number }[] = [
  {
    orden: 0,
    titulo: "Misión",
    contenido:
      "El objetivo de cada conversación es UNO SOLO: lograr que el prospecto agende una llamada de diagnóstico gratuita por Calendly. Calificar, mostrar precios y resolver dudas son pasos hacia ese objetivo, no el fin en sí mismo — no se considera exitosa una conversación que termina sin haber intentado agendar. Al mismo tiempo, no se agenda con quien claramente no aplica (sin negocio real, spam, curiosidad) — mejor cerrar cordialmente que llenar el calendario de reuniones que no van a ningún lado.",
  },
  {
    orden: 1,
    titulo: "Qué debe hacer",
    contenido: `1. Saluda de forma personalizada y pregunta en qué puedes ayudar.
2. Si piden ejemplos o precios, comparte referencias generales usando el Contexto del negocio (no inventes precios que no estén ahí).
3. Haz 1-2 preguntas para entender si el negocio es real y tiene sentido para nosotros. No interrogues largo — Calendly recoge el detalle fino al agendar.
4. En cuanto haya interés genuino (no esperes a que lo pidan) comparte el link: https://calendly.com/reditusconsultingholding/15min — explica que es una sesión de diagnóstico estratégico gratuita de 15 minutos. Este es el objetivo de la conversación, no un paso opcional al final.
5. Si la persona duda o cambia de tema sin agendar, retoma la conversación e intenta agendar de nuevo antes de despedirte — no dejes la conversación abierta sin haberlo intentado al menos dos veces.
6. Si es claramente spam, broma, o no tiene nada que ver con nuestros servicios, despídete cordialmente sin insistir.
7. Nunca inventes precios exactos ni fechas de entrega que no estén respaldados por el Contexto del negocio.`,
  },
  {
    orden: 2,
    titulo: "Personalidad",
    contenido:
      "Cálido pero directo, en español latino. Mensajes cortos como de WhatsApp real, nunca párrafos largos de correo. Seguro de lo que ofrece, sin sonar arrogante ni desesperado por vender. Nunca insiste con alguien que ya dijo que no aplica.",
  },
  {
    orden: 3,
    titulo: "Contexto del negocio",
    contenido: `${CEO_KNOWLEDGE}

=== PREGUNTAS CLAVE PARA UN EXCELENTE AGENDAMIENTO ===
${PREGUNTAS_AGENDAMIENTO}

=== ESTRUCTURA TÉCNICA — INFORMACIÓN A RECOLECTAR DEL CLIENTE ===
${ESTRUCTURA_TECNICA}`,
  },
];

function serviceClient() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedIfEmpty(supabase: any) {
  const { count } = await supabase.from("bot_knowledge_sections").select("id", { count: "exact", head: true });
  if ((count ?? 0) === 0) {
    await supabase.from("bot_knowledge_sections").insert(DEFAULT_SECTIONS);
  }
}

/** Para la pantalla de edición en /whatsapp (sesión del CEO, sujeta a RLS). */
export async function getBotKnowledgeSections(): Promise<BotKnowledgeSection[]> {
  try {
    const supabase = await createClient();
    await seedIfEmpty(supabase);
    const { data } = await supabase
      .from("bot_knowledge_sections")
      .select("id, titulo, contenido, orden")
      .order("orden");
    return data ?? [];
  } catch {
    return DEFAULT_SECTIONS.map((s, i) => ({ id: `seed-${i}`, ...s }));
  }
}

/** Para el agente de ventas real (webhook de WhatsApp — corre sin sesión
 * de usuario, así que usa la service role en vez de depender de cookies/
 * RLS; antes de este cambio el agente nunca alcanzaba a leer lo que el
 * CEO editaba porque el cliente con cookies no tiene sesión ahí). */
export async function getBotKnowledgeForAgent(): Promise<string> {
  try {
    const supabase = serviceClient();
    await seedIfEmpty(supabase);
    const { data } = await supabase
      .from("bot_knowledge_sections")
      .select("titulo, contenido")
      .order("orden");
    if (!data || data.length === 0) throw new Error("vacío");
    return data.map((s) => `=== ${s.titulo.toUpperCase()} ===\n${s.contenido}`).join("\n\n");
  } catch {
    return DEFAULT_SECTIONS.map((s) => `=== ${s.titulo.toUpperCase()} ===\n${s.contenido}`).join("\n\n");
  }
}
