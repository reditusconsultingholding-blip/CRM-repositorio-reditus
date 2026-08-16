import "server-only";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";

/** Notifica a CEO y Gerente Comercial cuánto se ganó y qué se vendió cada
 * vez que se crea un ingreso (desde el formulario o desde el chat del
 * asistente) — la fecha de entrega no se incluye porque se define después,
 * al crear el Requerimiento asociado. */
export async function notifyNewIngreso(params: { producto: string; totalUsd: number; clienteNombre: string }) {
  const supabase = await createClient();

  const { data: destinatarios } = await supabase
    .from("users")
    .select("id")
    .in("role", ["ceo", "gerente_comercial"])
    .eq("active", true);

  const monto = params.totalUsd.toLocaleString("es-CO", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

  const title = `Nuevo ingreso: ${params.producto || "servicio"} — ${monto} — ${params.clienteNombre}`;

  for (const d of destinatarios ?? []) {
    await notify(supabase, d.id, "nuevo_pedido", title, "/ingresos");
  }
}
