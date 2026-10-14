import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender } from "@/lib/servidor-api";
import { leerConfig, relojDe } from "@/lib/prospeccion-correo-server";
import { sincronizarHoja } from "@/lib/prospeccion-auto-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Sincroniza la hoja de prospectos con el CRM (lo pide el trabajador cada 15 min). Contrato en `../latido/route.ts`.
export async function POST(request: NextRequest) {
  return atender(request, async (cuerpo) => {
    const config = await leerConfig();
    if (!config.auto.hoja.activa || !config.auto.hoja.id) return NextResponse.json({ ok: true, omitida: "la hoja no está conectada en el panel" });
    const r = await sincronizarHoja(createAdminClient(), relojDe(cuerpo));
    revalidatePath("/prospectos", "layout");
    return NextResponse.json({ ok: true, ...r });
  });
}
