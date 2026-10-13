import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cuerpoJson } from "@/lib/servidor-api";
import { atenderPulso, dejarPaginas, responderPulso } from "@/lib/pulso-robot-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// El tablero deja la lista completa de páginas extra (firma corta con
// PULSO_SECRETO); el robot la aplica en su siguiente latido.
export async function POST(request: NextRequest) {
  return atenderPulso(request, async () => {
    const cuerpo = await cuerpoJson(request);
    return responderPulso(await dejarPaginas(createAdminClient(), cuerpo.paginas));
  });
}
