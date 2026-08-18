import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CEO_KNOWLEDGE } from "@/lib/ceo-knowledge";

// Contenido inicial de la base de conocimiento del agente de ventas de
// WhatsApp — combina el documento maestro comercial/operativo (ya
// extraído en ceo-knowledge.ts) con los dos formularios de recepción de
// información que Sebastián compartió. Esta es solo la semilla: la fila
// real vive en bot_knowledge_base y el CEO la edita libremente desde
// /whatsapp — sirve de contexto para que el agente pueda cotizar,
// resolver objeciones y pedir la información correcta a un prospecto.
export const BOT_KNOWLEDGE_SEED = `
${CEO_KNOWLEDGE}

=== PREGUNTAS CLAVE PARA UN EXCELENTE AGENDAMIENTO ===
(Se le piden al cliente una vez confirma que quiere avanzar, antes o durante el agendamiento)

- Nombre comercial del producto.
- Recomendaciones de ángulos de venta.
- Precios del producto (valor x1 - x2 - x3). Si tiene obsequios, incluirlos.
- Si cuenta con alguna oferta (2x1, envío contra entrega, envío gratis, obsequios incluidos).
- Métodos de pago vigentes actualmente.
- Identidad gráfica o redes sociales.

=== ESTRUCTURA TÉCNICA — INFORMACIÓN A RECOLECTAR DEL CLIENTE ===

Información del producto/servicio:
- ¿Qué producto o servicio vende? Descripción breve.
- ¿Qué presentaciones, versiones o planes ofrece (y precio de cada uno)?
- ¿Qué incluye cada presentación/plan (envío, bonos, extras)?
- ¿Cuáles son los beneficios o características principales?
- ¿Tiene algún respaldo, certificación o registro oficial (ej. INVIMA, ISO, garantías legales)?

Uso / experiencia del cliente:
- ¿Cómo se usa, se aplica o se consume?
- ¿Para quién es (y para quién NO es)?
- ¿Hay alguna condición, restricción o cuidado especial que el cliente deba conocer antes de comprar?
- ¿Con qué frecuencia se usa o se repite la compra?

Logística:
- Políticas de envío (cobertura, tiempos, costos).
- Cómo se conserva, almacena o mantiene el producto (si aplica).
- Política de garantía, cambios o devoluciones.

Preguntas frecuentes y objeciones:
- Las 5-10 preguntas que más hacen los clientes antes de comprar.
- Objeciones o dudas más comunes que frenan la compra (precio, confianza, comparación con competencia).
- Comparaciones que hacen los clientes con otras marcas o alternativas del mercado.

=== INFORMACIÓN DE VENTAS ADICIONAL ===
(El CEO puede seguir agregando aquí — ejemplos de portafolio, guiones que funcionan, objeciones
específicas por nicho, casos de éxito, etc.)
`.trim();

export async function getBotKnowledge(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("bot_knowledge_base")
      .select("contenido")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.contenido) return data.contenido;
  } catch {
    // Tabla todavía no migrada en producción — cae al contenido semilla.
  }
  return BOT_KNOWLEDGE_SEED;
}
