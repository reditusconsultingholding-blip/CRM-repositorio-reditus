import { revalidatePath } from "next/cache";
import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender, responder } from "@/lib/servidor-api";
import { recibirResultado } from "@/lib/trabajos-video-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Paso 1: entrega una URL firmada para subir el MP4. Paso 2: recibe la ruta
// del video ya subido, lo liga a su versión del guion («Por aprobar») y avisa.
// Contrato completo en `src/lib/servidor-api.ts`.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return atender(request, async (cuerpo) => {
    const r = await recibirResultado(createAdminClient(), id, cuerpo);
    if (r.ok && "estado" in r.dato) revalidatePath("/videos");
    return responder(r);
  });
}
