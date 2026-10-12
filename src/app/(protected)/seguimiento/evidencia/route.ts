import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_SEGUIMIENTO, esFecha, puedeSupervisar, type Persona } from "@/lib/seguimiento";
import { carpetaEvidencias, leerDia, leerPlantillaGuardada } from "@/lib/seguimiento-server";

export const runtime = "nodejs";

// Sirve un archivo de evidencia del bucket PRIVADO: valida la sesión y el
// permiso (la dueña, su supervisora o el CEO) y redirige a una URL firmada
// que dura 10 minutos. Así ninguna captura queda con enlace público.
//   /seguimiento/evidencia?f=<AAAA-MM-DD>&u=<userId>&e=<id de la evidencia>
function negar(estado: number, mensaje: string) {
  return new NextResponse(mensaje, { status: estado, headers: { "cache-control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const fecha = q.get("f") ?? "";
  const userId = q.get("u") ?? "";
  const evidenciaId = q.get("e") ?? "";
  if (!esFecha(fecha) || !/^[0-9a-f-]{36}$/i.test(userId) || !evidenciaId) return negar(400, "Enlace de evidencia inválido.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return negar(401, "Inicia sesión para ver esta evidencia.");
  const { data: yo } = await supabase.from("users").select("id, name, role, active").eq("id", user.id).single();
  if (!yo || !yo.active) return negar(401, "Inicia sesión para ver esta evidencia.");

  const admin = createAdminClient();
  const { dia } = await leerDia(admin, fecha, userId);
  if (!dia) return negar(404, "Esa evidencia ya no existe.");
  if (yo.id !== userId) {
    const plantilla = await leerPlantillaGuardada(admin);
    const duena: Persona = { id: dia.userId, name: dia.nombre, role: dia.rol };
    if (!puedeSupervisar(plantilla, { id: yo.id, role: yo.role }, duena)) return negar(403, "No tienes permiso para ver esta evidencia.");
  }

  const evidencia = Object.values(dia.entregas)
    .flatMap((e) => e.evidencias)
    .find((e) => e.id === evidenciaId);
  // La ruta sale del archivo del día (nunca de la URL) y debe estar en la carpeta de esa persona.
  if (!evidencia?.path || !evidencia.path.startsWith(`${carpetaEvidencias(fecha, userId)}/`)) return negar(404, "Esa evidencia ya no existe.");

  const { data, error } = await admin.storage.from(BUCKET_SEGUIMIENTO).createSignedUrl(evidencia.path, 600);
  if (error || !data?.signedUrl) return negar(404, "No se pudo abrir la evidencia.");
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "cache-control": "no-store" } });
}
