import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { computeCeoReport } from "@/lib/ceo-report";

export const runtime = "nodejs";

// Ruta liviana para el widget de la barra lateral — solo la rentabilidad
// semanal, no todo el reporte. Ceo-only.
export async function GET() {
  const profile = await requireProfile();
  if (profile.role !== "ceo") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const r = await computeCeoReport();

  return NextResponse.json({
    rentabilidadSemana: r.rentabilidadSemana,
    ingresosSemanaUsd: r.ingresosSemanaUsd,
    rentabilidadMes: r.rentabilidadMes,
    ingresosMesUsd: r.ingresosMesUsd,
  });
}
