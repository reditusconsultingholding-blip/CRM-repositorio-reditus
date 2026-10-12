import { redirect } from "next/navigation";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLES_ACTIVAN_ENVIO, type ConfigCorreo, type ResumenCampana, type UsoCuenta } from "@/lib/prospeccion-correo";
import { leerConfig, resumenCampanas, usoCuentas } from "@/lib/prospeccion-correo-server";
import { PestanasProspectos } from "@/components/prospectos/pestanas";
import { Campanas } from "@/components/prospectos/campanas";

export const dynamic = "force-dynamic";

// Campañas de correo en frío: listas de leads a los que se les ofrece la
// muestra gratis. Aquí se importan, se edita la plantilla, se activan (solo
// CEO o gerente comercial) y se ve el avance. Enviar y leer la bandeja lo
// hace el trabajador del servidor.
export default async function CampanasPage() {
  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) redirect("/dashboard");

  let config: ConfigCorreo = { pausaGeneral: false, exclusiones: [], inicio: { video: null, landing: null } };
  let uso: UsoCuenta[] = [];
  let campanas: ResumenCampana[] = [];
  let error: string | null = null;
  try {
    const ahora = new Date();
    config = await leerConfig();
    [uso, campanas] = await Promise.all([usoCuentas(config, ahora), resumenCampanas(createAdminClient(), ahora)]);
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo leer el almacenamiento.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Prospectos</h1>
        <p className="text-sm text-muted-foreground">
          Campañas de correo en frío: a cada lead se le ofrece la muestra gratis. Quien responde que sí pasa solo al embudo.
        </p>
      </div>
      <PestanasProspectos activa="campanas" />
      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
      ) : (
        <Campanas
          config={config}
          uso={uso}
          campanas={campanas}
          puedeAutorizar={ROLES_ACTIVAN_ENVIO.includes(profile.role)}
          servidorActivo={!!process.env.SERVIDOR_SECRET?.trim()}
        />
      )}
    </div>
  );
}
