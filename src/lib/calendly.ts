import "server-only";
import { createClient } from "@supabase/supabase-js";
import { notify } from "@/lib/notify";

// URI estable de la cuenta de Calendly de Reditus (confirmado por API,
// no cambia salvo que se recree la cuenta).
const CALENDLY_USER_URI = "https://api.calendly.com/users/097c6e5f-d2c7-4226-8300-f006eba93587";
const CALENDLY_API = "https://api.calendly.com";

type CalendlyInvitee = {
  uri: string;
  name: string;
  email: string;
  questions_and_answers: { question: string; answer: string; position: number }[];
  event: string;
};

async function calendlyFetch(path: string, token: string) {
  const res = await fetch(`${CALENDLY_API}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Calendly API ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Revisa las reuniones agendadas en Calendly recientemente y crea/actualiza
 * un prospecto por cada una — así cada vez que alguien agenda la "Llamada
 * Estratégica" aparece solo en el CRM, con las respuestas de calificación
 * que ya recoge el formulario de Calendly. Se llama desde el cron diario.
 * No hace nada (ni falla) si CALENDLY_API_TOKEN no está configurado. */
export async function syncCalendlyBookings(): Promise<{ synced: number } | null> {
  const token = process.env.CALENDLY_API_TOKEN;
  if (!token) return null;

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Últimas 48h de actividad de agendamiento — suficiente margen con un
  // cron diario sin duplicar trabajo (upsert por calendly_event_uri).
  const minStart = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const eventsRes = await calendlyFetch(
    `/scheduled_events?user=${encodeURIComponent(CALENDLY_USER_URI)}&min_start_time=${minStart}&status=active&count=50`,
    token,
  );

  let synced = 0;

  for (const event of eventsRes.collection ?? []) {
    const { data: existing } = await admin
      .from("prospectos")
      .select("id")
      .eq("calendly_event_uri", event.uri)
      .maybeSingle();
    if (existing) continue;

    const inviteesRes = await calendlyFetch(`/scheduled_events/${event.uri.split("/").pop()}/invitees`, token);
    const invitee = inviteesRes.collection?.[0] as CalendlyInvitee | undefined;
    if (!invitee) continue;

    const { data: prospecto, error } = await admin
      .from("prospectos")
      .insert({
        nombre: invitee.name,
        email: invitee.email,
        estado: "agendado",
        origen: "calendly",
        respuestas_calificacion: invitee.questions_and_answers ?? [],
        fecha_reunion: event.start_time,
        link_reunion: event.location?.join_url ?? null,
        calendly_event_uri: event.uri,
      })
      .select("id")
      .single();

    if (error) continue;
    synced++;

    const { data: destinatarios } = await admin
      .from("users")
      .select("id")
      .in("role", ["ceo", "gerente_comercial"])
      .eq("active", true);

    for (const d of destinatarios ?? []) {
      await notify(
        admin,
        d.id,
        "nuevo_pedido",
        `Nueva llamada agendada: ${invitee.name} — ${new Date(event.start_time).toLocaleString("es-CO")}`,
        "/prospectos",
      );
    }

    void prospecto;
  }

  return { synced };
}
