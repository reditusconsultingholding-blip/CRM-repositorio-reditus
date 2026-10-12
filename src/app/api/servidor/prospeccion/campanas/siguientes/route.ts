import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender } from "@/lib/servidor-api";
import { siguientesCampana, relojDe } from "@/lib/prospeccion-correo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Próximos correos en frío de las campañas activas. Contrato en `pendientes-envio/route.ts`.
export async function POST(request: NextRequest) {
  return atender(request, async (cuerpo) => {
    const r = await siguientesCampana(createAdminClient(), cuerpo, relojDe(cuerpo));
    return NextResponse.json({ ok: true, ...r });
  });
}
