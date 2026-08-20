import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";

export type NotificationType =
  | "nuevo_pedido"
  | "asignado"
  | "correccion"
  | "mencion"
  | "terminado"
  | "mensaje_directo"
  | "recordatorio_costos"
  | "nomina_lista"
  | "recomendacion_ceo"
  | "encuesta_respondida"
  | "recordatorio_ingreso";

/** Punto único para crear notificaciones: guarda en la tabla `notifications`
 * (la campana de la app) Y manda un push al celular si el usuario tiene la
 * PWA instalada con notificaciones activadas. El push es "mejor esfuerzo" —
 * si falla, no rompe la acción que la disparó. */
export async function notify(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  type: NotificationType,
  title: string,
  link?: string,
) {
  await supabase.from("notifications").insert({ user_id: userId, type, title, link: link ?? null });
  sendPushToUser(userId, { title, url: link }).catch(() => {});
}
