import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender } from "@/lib/servidor-api";
import { registrarRespuesta, relojDe } from "@/lib/prospeccion-correo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Una respuesta que llegó a la bandeja. Contrato en `pendientes-envio/route.ts`.
export async function POST(request: NextRequest) {
  return atender(request, async (cuerpo) => {
    const r = await registrarRespuesta(createAdminClient(), cuerpo, relojDe(cuerpo));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado });
    revalidatePath("/prospectos", "layout");
    return NextResponse.json(r);
  });
}
