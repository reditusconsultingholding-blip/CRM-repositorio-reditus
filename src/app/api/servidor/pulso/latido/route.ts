import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender } from "@/lib/servidor-api";
import { recibirLatido, responderPulso } from "@/lib/pulso-robot-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// El robot de Pulso reporta su estado cada 20 s (Bearer SERVIDOR_SECRET) y se
// lleva lo pendiente: `{ ok, pedir, paginas? }`. Contrato en `src/lib/pulso-robot-server.ts`.
export async function POST(request: NextRequest) {
  return atender(request, async (cuerpo) => responderPulso(await recibirLatido(createAdminClient(), cuerpo)));
}
