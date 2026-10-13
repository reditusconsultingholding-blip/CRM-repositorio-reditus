import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender } from "@/lib/servidor-api";
import { paraTrabajador } from "@/lib/trabajos-video";
import { retomarRezagados } from "@/lib/proyecto-video-server";
import { tomarTrabajo } from "@/lib/trabajos-video-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Entrega el siguiente video pendiente al servidor externo y lo deja tomado.
// Contrato completo en `src/lib/servidor-api.ts`.
export async function POST(request: NextRequest) {
  return atender(request, async (cuerpo) => {
    const trabajador = typeof cuerpo.trabajador === "string" ? cuerpo.trabajador : "servidor";
    const admin = createAdminClient();
    let r = await tomarTrabajo(admin, trabajador);
    if (r.ok && !r.dato) {
      // Cola vacía: se aprovecha el latido para retomar proyectos en modo directo que se quedaron a medias.
      await retomarRezagados(admin);
      r = await tomarTrabajo(admin, trabajador);
    }
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado });
    return NextResponse.json({ ok: true, trabajo: r.dato ? paraTrabajador(r.dato) : null });
  });
}
