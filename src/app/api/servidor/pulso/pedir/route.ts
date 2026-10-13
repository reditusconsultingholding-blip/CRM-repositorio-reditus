import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atenderPulso, pedirActualizacion, responderPulso } from "@/lib/pulso-robot-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// El tablero pide «Actualizar ahora» (firma corta con PULSO_SECRETO). El robot
// lo toma en su siguiente latido. Responde el estado, para que el tablero sepa
// desde qué `ultimaOk` esperar el cambio.
export async function POST(request: NextRequest) {
  return atenderPulso(request, async () => responderPulso(await pedirActualizacion(createAdminClient())));
}
