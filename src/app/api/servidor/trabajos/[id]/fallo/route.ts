import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender, responder } from "@/lib/servidor-api";
import { reportarFallo } from "@/lib/trabajos-video-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// El trabajador no pudo: el trabajo vuelve a la cola con espera creciente o,
// al tercer intento, queda en `fallo`. Contrato en `src/lib/servidor-api.ts`.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return atender(request, async (cuerpo) => responder(await reportarFallo(createAdminClient(), id, cuerpo)));
}
