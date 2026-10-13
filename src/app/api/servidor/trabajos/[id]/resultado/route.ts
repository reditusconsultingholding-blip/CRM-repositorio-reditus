import { revalidatePath } from "next/cache";
import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender, responder } from "@/lib/servidor-api";
import { avanzarGuion } from "@/lib/proyecto-video-server";
import { recibirResultado } from "@/lib/trabajos-video-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Paso 1: entrega una URL firmada para subir el MP4. Paso 2: recibe la ruta
// del video ya subido, lo liga a su versión del guion («Por aprobar») y avisa.
// Contrato completo en `src/lib/servidor-api.ts`.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return atender(request, async (cuerpo) => {
    const admin = createAdminClient();
    const r = await recibirResultado(admin, id, cuerpo);
    if (r.ok && "estado" in r.dato) {
      // Modo directo: al cerrar una etapa, el proyecto pasa solo a la siguiente (revisión con IA, clips, armado).
      if (r.dato.etapa && r.dato.etapa !== "analisis") await avanzarGuion(admin, r.dato.guionId);
      revalidatePath("/videos");
    }
    return responder(r);
  });
}
