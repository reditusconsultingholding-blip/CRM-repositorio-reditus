import "server-only";
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notify } from "@/lib/notify";

const TERMINADOS = ["Terminado", "ENTREGADO", "SUBIDA"];

function generateToken() {
  return randomBytes(16).toString("hex");
}

/** Se llama cada vez que un requerimiento cambia de estado. Si con este
 * cambio TODOS los requerimientos de su ingreso ya están terminados, y
 * todavía no existe la encuesta de calidad de ese ingreso, la crea y
 * avisa a Gerente Comercial + CEO con el link para copiar y enviar. Es
 * a prueba de llamadas repetidas — solo crea la encuesta una vez. */
export async function maybeGenerarEncuestaCalidad(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  requerimientoId: string,
) {
  const { data: req } = await supabase
    .from("requerimientos")
    .select("ingreso_id")
    .eq("id", requerimientoId)
    .single();

  const ingresoId = req?.ingreso_id;
  if (!ingresoId) return; // requerimiento sin ingreso de origen (creado a mano)

  const { data: hermanos } = await supabase
    .from("requerimientos")
    .select("estado")
    .eq("ingreso_id", ingresoId);

  const todosTerminados = (hermanos ?? []).length > 0 && (hermanos ?? []).every((h) => TERMINADOS.includes(h.estado));
  if (!todosTerminados) return;

  const { data: existing } = await supabase
    .from("encuestas_calidad")
    .select("id")
    .eq("ingreso_id", ingresoId)
    .maybeSingle();
  if (existing) return;

  const { data: ingreso } = await supabase
    .from("ingresos")
    .select("client_id, tracking_id, client:clients(name)")
    .eq("id", ingresoId)
    .single<{
      client_id: string;
      tracking_id: string;
      client: { name: string } | { name: string }[] | null;
    }>();
  if (!ingreso?.client_id) return;

  const token = generateToken();
  const { error } = await supabase
    .from("encuestas_calidad")
    .insert({ ingreso_id: ingresoId, client_id: ingreso.client_id, token });
  if (error) return; // ya existe (condición de carrera) o falló — no rompe el flujo principal

  const clientName = Array.isArray(ingreso.client) ? ingreso.client[0]?.name : ingreso.client?.name;

  const { data: comerciales } = await supabase
    .from("users")
    .select("id")
    .in("role", ["ceo", "gerente_comercial"])
    .eq("active", true);

  for (const u of comerciales ?? []) {
    await notify(
      supabase,
      u.id,
      "encuesta_respondida",
      `${ingreso.tracking_id}: ${clientName ?? "cliente"} — pedido terminado, envía la encuesta de calidad`,
      `/ingresos`,
    );
  }
}
