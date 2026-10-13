import type { NextRequest } from "next/server";
import { atenderPulso, estadoPulso, responderPulso } from "@/lib/pulso-robot-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Último latido del robot, si hay una actualización pedida sin tomar y la lista
// de páginas vigente (firma corta con PULSO_SECRETO).
export async function GET(request: NextRequest) {
  return atenderPulso(request, async () => responderPulso(await estadoPulso()));
}
