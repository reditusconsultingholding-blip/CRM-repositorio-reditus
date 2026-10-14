import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender } from "@/lib/servidor-api";
import { registrarEnviado, relojDe } from "@/lib/prospeccion-correo-server";
import { esEnvioDeRespuesta, registrarRespuestaEnviada } from "@/lib/prospeccion-auto-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// El trabajador reporta el resultado de un envío. Contrato en `pendientes-envio/route.ts`.
export async function POST(request: NextRequest) {
  return atender(request, async (cuerpo) => {
    const admin = createAdminClient();
    const r = esEnvioDeRespuesta(cuerpo.id) ? await registrarRespuestaEnviada(admin, cuerpo, relojDe(cuerpo)) : await registrarEnviado(admin, cuerpo, relojDe(cuerpo));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado });
    revalidatePath("/prospectos", "layout");
    return NextResponse.json(r);
  });
}
