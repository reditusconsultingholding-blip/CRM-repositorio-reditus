import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender } from "@/lib/servidor-api";
import { relojDe } from "@/lib/prospeccion-correo-server";
import { permisoDeBusqueda } from "@/lib/prospeccion-auto-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ¿Toca buscar ahora y con cuánto presupuesto? Contrato en `../../latido/route.ts`.
export async function POST(request: NextRequest) {
  return atender(request, async (cuerpo) => NextResponse.json({ ok: true, ...(await permisoDeBusqueda(createAdminClient(), relojDe(cuerpo))) }));
}
