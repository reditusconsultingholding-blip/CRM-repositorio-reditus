"use server";

import { createClient } from "@supabase/supabase-js";
import { notify } from "@/lib/notify";

type ActionResult = { error?: string } | undefined;

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** El cliente responde sin sesión — por eso usa el cliente admin (service
 * role) en vez del de sesión normal, igual que el webhook de WhatsApp. */
export async function submitEncuesta(
  token: string,
  puntuacion: number,
  comentario: string,
  quiereTestimonio: boolean,
): Promise<ActionResult> {
  try {
    if (puntuacion < 1 || puntuacion > 5) return { error: "Selecciona una puntuación." };

    const admin = adminClient();
    const { data: encuesta } = await admin
      .from("encuestas_calidad")
      .select("id, ingreso_id, respondido_at, ingreso:ingresos(tracking_id), client:clients(name)")
      .eq("token", token)
      .maybeSingle<{
        id: string;
        ingreso_id: string;
        respondido_at: string | null;
        ingreso: { tracking_id: string } | { tracking_id: string }[] | null;
        client: { name: string } | { name: string }[] | null;
      }>();

    if (!encuesta) return { error: "Este link no es válido." };
    if (encuesta.respondido_at) return { error: "Ya se respondió esta encuesta." };

    const { error } = await admin
      .from("encuestas_calidad")
      .update({
        puntuacion,
        comentario: comentario.trim() || null,
        quiere_testimonio: quiereTestimonio,
        respondido_at: new Date().toISOString(),
      })
      .eq("id", encuesta.id);
    if (error) return { error: error.message };

    const clientName = Array.isArray(encuesta.client) ? encuesta.client[0]?.name : encuesta.client?.name;
    const trackingId = Array.isArray(encuesta.ingreso) ? encuesta.ingreso[0]?.tracking_id : encuesta.ingreso?.tracking_id;
    const enCrisis = puntuacion <= 2;

    const { data: comerciales } = await admin
      .from("users")
      .select("id")
      .in("role", ["ceo", "gerente_comercial"])
      .eq("active", true);

    for (const u of comerciales ?? []) {
      await notify(
        admin,
        u.id,
        "encuesta_respondida",
        `${enCrisis ? "⚠️ EN CRISIS — " : ""}${clientName ?? "Cliente"} calificó ${trackingId ?? ""} con ${puntuacion}/5${quiereTestimonio ? " — quiere dar testimonio en video" : ""}`,
        "/ingresos",
      );
    }

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo enviar." };
  }
}
