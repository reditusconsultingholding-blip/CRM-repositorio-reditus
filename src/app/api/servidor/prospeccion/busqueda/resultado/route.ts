import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender } from "@/lib/servidor-api";
import { relojDe } from "@/lib/prospeccion-correo-server";
import { recibirHallazgos } from "@/lib/prospeccion-auto-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Lo que encontró una corrida de búsqueda. Contrato en `../../latido/route.ts`.
export async function POST(request: NextRequest) {
  return atender(request, async (cuerpo) => {
    const r = await recibirHallazgos(createAdminClient(), cuerpo, relojDe(cuerpo));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado });
    revalidatePath("/prospectos", "layout");
    return NextResponse.json(r);
  });
}
