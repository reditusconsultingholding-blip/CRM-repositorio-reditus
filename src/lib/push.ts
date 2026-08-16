import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails("mailto:reditusconsultingholding@gmail.com", publicKey, privateKey);
  configured = true;
  return true;
}

/** Envía una notificación push a TODAS las suscripciones activas de un
 * usuario (puede tener varios dispositivos). Nunca lanza — una notificación
 * push es "mejor esfuerzo", no debe tumbar la acción que la dispara. Usa el
 * cliente admin porque casi siempre se notifica a OTRO usuario, no al que
 * está haciendo la petición (RLS de push_subscriptions es por dueño). */
export async function sendPushToUser(userId: string, payload: { title: string; body?: string; url?: string }) {
  if (!ensureConfigured()) return;

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs?.length) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Suscripción vencida/revocada — se limpia sola.
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }),
  );
}
