import { redirect } from "next/navigation";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLES_ACTIVAN_ENVIO, type UsoCuenta } from "@/lib/prospeccion-correo";
import type { PanelAuto } from "@/lib/prospeccion-auto";
import { leerConfig, usoCuentas } from "@/lib/prospeccion-correo-server";
import { panelAuto } from "@/lib/prospeccion-auto-server";
import { PestanasProspectos } from "@/components/prospectos/pestanas";
import { PanelControl } from "@/components/prospectos/panel-control";

export const dynamic = "force-dynamic";
// Conectar la hoja la lee completa la primera vez.
export const maxDuration = 300;

// Panel de control de la prospección automática: embudo del día,
// interruptores, topes, pausa total, cola de respuestas y la hoja.
export default async function ControlPage() {
  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) redirect("/dashboard");

  let datos: { panel: PanelAuto; uso: UsoCuenta[]; config: Awaited<ReturnType<typeof leerConfig>> } | null = null;
  let error: string | null = null;
  try {
    const ahora = new Date();
    const config = await leerConfig();
    const [panel, uso] = await Promise.all([panelAuto(createAdminClient(), config, ahora), usoCuentas(config, ahora)]);
    datos = { panel, uso, config };
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo leer el almacenamiento.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Prospectos</h1>
        <p className="text-sm text-muted-foreground">
          Prospección automática: el servidor busca tiendas, les escribe, lee las respuestas y entrega el video cuando una persona lo aprueba.
        </p>
      </div>
      <PestanasProspectos activa="control" />
      {error || !datos ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
      ) : (
        <PanelControl
          key={`${datos.panel.latido?.fecha ?? ""}-${datos.panel.cola.length}-${datos.panel.hoja.ultima ?? ""}`}
          panel={datos.panel}
          config={datos.config}
          uso={datos.uso}
          esCeo={profile.role === "ceo"}
          puedeAprobar={ROLES_ACTIVAN_ENVIO.includes(profile.role)}
        />
      )}
    </div>
  );
}
