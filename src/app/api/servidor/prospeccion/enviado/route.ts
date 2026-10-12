import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender } from "@/lib/servidor-api";
import { registrarEnviado, relojDe } from "@/lib/prospeccion-correo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// El trabajador reporta el resultado de un envío. Contrato en `pendientes-envio/route.ts`.
export async function POST(request: NextRequest) {
  return atender(request, async (cuerpo) => {
    const r = await registrarEnviado(createAdminClient(), cuerpo, relojDe(cuerpo));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado });
    revalidatePath("/prospectos", "layout");
    return NextResponse.json(r);
  });
}
