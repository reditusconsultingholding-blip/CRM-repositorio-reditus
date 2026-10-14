import { NextResponse, type NextRequest } from "next/server";
import { atender } from "@/lib/servidor-api";
import { dominiosNuevos } from "@/lib/prospeccion-auto-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// De una lista de dominios, los que el CRM todavía no conoce. Contrato en `../../latido/route.ts`.
export async function POST(request: NextRequest) {
  return atender(request, async (cuerpo) => NextResponse.json({ ok: true, ...(await dominiosNuevos(cuerpo)) }));
}
