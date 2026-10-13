import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender } from "@/lib/servidor-api";
import { paraTrabajador } from "@/lib/trabajos-video";
import { tomarTrabajo } from "@/lib/trabajos-video-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Entrega el siguiente video pendiente al servidor externo y lo deja tomado.
// Contrato completo en `src/lib/servidor-api.ts`.
export async function POST(request: NextRequest) {
  return atender(request, async (cuerpo) => {
    const trabajador = typeof cuerpo.trabajador === "string" ? cuerpo.trabajador : "servidor";
    const r = await tomarTrabajo(createAdminClient(), trabajador);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado });
    return NextResponse.json({ ok: true, trabajo: r.dato ? paraTrabajador(r.dato) : null });
  });
}
