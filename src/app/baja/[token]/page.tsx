import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { correoDeTokenBaja } from "@/lib/prospeccion-correo-server";
import { BotonBaja } from "./boton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Darse de baja · Reditus Consulting", robots: { index: false, follow: false } };

// Página pública del enlace «date de baja en un clic» que va al pie de cada
// correo de prospección. No pide sesión ni datos: el token ya trae la
// dirección, firmada por el CRM.
export default async function BajaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let correo: string | null = null;
  try {
    correo = await correoDeTokenBaja(createAdminClient(), decodeURIComponent(token));
  } catch {
    correo = null;
  }
  const visible = correo ? correo.replace(/^(.{2}).*(@.*)$/, "$1…$2") : "";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-sm">
        <p className="mb-4 text-center font-heading text-lg font-semibold">Reditus Consulting</p>
        {correo ? (
          <BotonBaja token={decodeURIComponent(token)} correo={visible} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Este enlace no es válido. Si quieres dejar de recibir nuestros correos, responde «no» a cualquiera de ellos y no te volvemos a escribir.
          </p>
        )}
      </div>
    </div>
  );
}
