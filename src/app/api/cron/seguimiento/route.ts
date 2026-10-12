import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyBogota, lunesDe } from "@/lib/seguimiento";
import { avisarPendientes, resumenSemanalCeo } from "@/lib/seguimiento-server";

export const runtime = "nodejs";

// Recordatorios de «Seguimiento diario» a una hora exacta.
//
// El cron que ya existe (/api/cron/keepalive) corre una vez al día a las
// 12:00 UTC = 7:00 a. m. de Bogotá, y ahí solo cabe el recordatorio «ayer te
// quedó…» y el resumen del lunes. Esta ruta es para dispararlos cuando toca:
//
//   GET /api/cron/seguimiento?tarea=tarde    → a quien le falten tareas de HOY
//   GET /api/cron/seguimiento?tarea=semana   → resumen de la semana al CEO
//   (sin `tarea`: «tarde» y, si es sábado, también «semana»)
//
// Cómo llamarla: con el encabezado  Authorization: Bearer <CRON_SECRET>
//  · Vercel: agregar a vercel.json  { "path": "/api/cron/seguimiento", "schedule": "0 22 * * 1-6" }
//    (22:00 UTC = 5:00 p. m. Bogotá, lunes a sábado). Revisar antes que el
//    plan de Vercel admita un segundo cron; NO se agregó para no tocarlo a ciegas.
//  · O desde cualquier programador externo (cron-job.org, GitHub Actions) con ese encabezado.
// Cada aviso se manda una sola vez por día aunque la ruta se llame varias veces.
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  // Sin secreto configurado no se ejecuta: esta ruta manda avisos a personas.
  if (!secreto) return NextResponse.json({ error: "Falta CRON_SECRET." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const hoy = hoyBogota();
  const tarea = request.nextUrl.searchParams.get("tarea");
  const esSabado = new Date(`${hoy}T12:00:00Z`).getUTCDay() === 6;
  const resultado: Record<string, unknown> = { ok: true, hoy };
  try {
    if (!tarea || tarea === "tarde") resultado.tarde = await avisarPendientes(admin, hoy, "tarde");
    if (tarea === "semana" || (!tarea && esSabado)) resultado.semana = await resumenSemanalCeo(admin, lunesDe(hoy));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
  return NextResponse.json(resultado);
}
