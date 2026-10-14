import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { correoDeTokenBaja, registrarBaja } from "@/lib/prospeccion-correo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Baja en un clic (RFC 8058). Es la dirección que va en la cabecera
// `List-Unsubscribe` de cada correo: el programa de correo de quien recibe
// hace un POST aquí cuando la persona pulsa «Cancelar suscripción». Es pública
// a propósito; lo único que puede hacer es dar de baja la dirección que viene
// firmada dentro del token.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const admin = createAdminClient();
    const correo = await correoDeTokenBaja(admin, token);
    if (!correo) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
    await registrarBaja(admin, { correo, motivo: "Se dio de baja con el botón de su correo" }, new Date());
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo procesar. Responde «no» al correo y no te volvemos a escribir." }, { status: 500 });
  }
}

// Quien abre la dirección en el navegador va a la página con el botón.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/baja/${encodeURIComponent(token)}`, request.url));
}
