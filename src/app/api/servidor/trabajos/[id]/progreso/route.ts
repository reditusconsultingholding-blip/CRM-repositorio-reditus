import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender, responder } from "@/lib/servidor-api";
import { reportarProgreso } from "@/lib/trabajos-video-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Un reporte espera su turno (candado del trabajo) hasta ~25 s antes de responder 503.
export const maxDuration = 60;

// El trabajador avisa en qué va (y de paso demuestra que sigue vivo).
// Contrato completo en `src/lib/servidor-api.ts`.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return atender(request, async (cuerpo) => responder(await reportarProgreso(createAdminClient(), id, cuerpo)));
}
