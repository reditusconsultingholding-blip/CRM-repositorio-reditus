"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";

async function requireComercial() {
  const profile = await requireProfile();
  if (!["ceo", "gerente_comercial"].includes(profile.role)) {
    throw new Error("Solo Gerente Comercial o el CEO pueden hacer esto.");
  }
  return profile;
}

/** Genera (con IA) un mensaje corto de recompra, personalizado con el
 * cliente y el servicio que acaba de recibir, ofreciendo valor adicional
 * — para que Gerente Comercial lo copie y lo mande por WhatsApp. No se
 * guarda hasta que ella confirme que lo envió. */
export async function generarMensajeRecompra(
  ingresoId: string,
): Promise<{ mensaje?: string; error?: string }> {
  try {
    await requireComercial();
    const supabase = await createClient();

    const { data: ingreso } = await supabase
      .from("ingresos")
      .select("producto, client:clients!ingresos_client_id_fkey(name)")
      .eq("id", ingresoId)
      .single<{ producto: string | null; client: { name: string } | { name: string }[] | null }>();
    if (!ingreso) return { error: "Ingreso no encontrado." };

    const clientName = Array.isArray(ingreso.client) ? ingreso.client[0]?.name : ingreso.client?.name;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        mensaje: `¡Hola ${clientName ?? ""}! 👋 Vimos que quedaste feliz con tu ${ingreso.producto ?? "servicio"} — nos encantaría seguir ayudándote a crecer. Como cliente frecuente tenemos una condición especial para tu próximo proyecto, ¿te cuento?`,
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
        max_tokens: 250,
        system:
          "Eres el redactor comercial de Reditus Consulting, agencia de marketing digital (landing pages y " +
          "videos creativos) en LatAm. Escribe UN mensaje corto de WhatsApp (máximo 4-5 líneas, cálido, directo, " +
          "sin sonar a plantilla genérica) para reenganchar a un cliente que ACABA de recibir un servicio y " +
          "quedó satisfecho. El objetivo es motivar una recompra ofreciendo valor real (no un descuento " +
          "genérico) — ideas: un diagnóstico gratis de su próxima campaña, una consultoría corta, una mejora " +
          "de lo que ya tiene. Usa emojis con moderación. No inventes descuentos específicos ni precios. " +
          "Responde solo con el mensaje, listo para copiar y pegar — sin comillas, sin explicación.",
        messages: [
          {
            role: "user",
            content: `Cliente: ${clientName ?? "el cliente"}. Servicio recién entregado: ${ingreso.producto ?? "servicio de marketing"}.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return {
        mensaje: `¡Hola ${clientName ?? ""}! 👋 Nos encantó trabajar en tu ${ingreso.producto ?? "proyecto"} — ¿seguimos potenciando tu marca? Cuéntame qué tienes en mente para tu próximo paso.`,
      };
    }

    const data = await res.json();
    const mensaje = data?.content?.find((c: { type: string }) => c.type === "text")?.text;
    return { mensaje: mensaje ?? "No se pudo generar el mensaje, intenta de nuevo." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo generar el mensaje." };
  }
}

/** Gerente Comercial confirma que ya mandó el mensaje de recompra —
 * cierra el ciclo completo del servicio. */
export async function confirmarRecompraEnviada(ingresoId: string): Promise<{ error?: string } | undefined> {
  try {
    const profile = await requireComercial();
    const supabase = await createClient();

    const { error } = await supabase
      .from("ingresos")
      .update({ recompra_enviado_at: new Date().toISOString(), ciclo_cerrado: true })
      .eq("id", ingresoId);
    if (error) return { error: error.message };

    const { data: ceos } = await supabase.from("users").select("id").eq("role", "ceo").eq("active", true);
    for (const c of ceos ?? []) {
      await notify(supabase, c.id, "terminado", `${profile.name} cerró el ciclo completo de un servicio (recompra enviada)`, "/ingresos");
    }

    revalidatePath("/requerimientos");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo confirmar." };
  }
}
