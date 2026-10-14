import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender } from "@/lib/servidor-api";
import { MODO_PRUEBA, guardarConfig, leerConfig, relojDe } from "@/lib/prospeccion-correo-server";
import { leerConfigAuto } from "@/lib/prospeccion-auto";
import { leerCola, panelAuto, resolverCola, sincronizarHoja, type AccionCola } from "@/lib/prospeccion-auto-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// SOLO PARA PRUEBAS LOCALES (`next dev`): hace por la simulación lo que en la
// vida real hace una persona con sesión (encender interruptores, aprobar un
// borrador). En producción no existe: responde 404.
export async function POST(request: NextRequest) {
  if (!MODO_PRUEBA) return NextResponse.json({ error: "No existe." }, { status: 404 });
  return atender(request, async (cuerpo) => {
    const admin = createAdminClient();
    const ahora = relojDe(cuerpo);
    const quien = { id: "00000000-0000-4000-8000-000000000001", nombre: "Persona de prueba" };
    if (cuerpo.accion === "config") {
      const actual = await leerConfig();
      const auto = leerConfigAuto({ ...actual.auto, ...(cuerpo.auto as object) });
      return NextResponse.json({ ok: true, config: await guardarConfig(admin, { auto, ...(typeof cuerpo.pausaGeneral === "boolean" ? { pausaGeneral: cuerpo.pausaGeneral } : {}) }) });
    }
    if (cuerpo.accion === "cola") return NextResponse.json({ ok: true, cola: await leerCola(admin, "pendientes") });
    if (cuerpo.accion === "resolver") return NextResponse.json({ ok: true, ...(await resolverCola(admin, String(cuerpo.id), cuerpo.decision as AccionCola, quien, ahora)) });
    if (cuerpo.accion === "hoja") return NextResponse.json({ ok: true, ...(await sincronizarHoja(admin, ahora)) });
    if (cuerpo.accion === "panel") return NextResponse.json({ ok: true, panel: await panelAuto(admin, await leerConfig(), ahora) });
    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  });
}
