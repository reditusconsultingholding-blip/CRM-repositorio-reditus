"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireProfile, INGRESOS_ROLES, type Profile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SERVICIOS, type Servicio } from "@/lib/prospeccion";
import { ROLES_ACTIVAN_ENVIO, leerExclusiones, type EstadoCampana } from "@/lib/prospeccion-correo";
import {
  aprobarEnvio,
  cambiarEstadoCampana,
  crearCampana,
  detenerSeguimientos,
  devolverSinConfirmar,
  editarCampana,
  guardarConfig,
  prospectoDesdeLead,
  reanudarSeguimientos,
  retirarAprobacion,
  soltarEnvio,
} from "@/lib/prospeccion-correo-server";

// Acciones de la prospección por correo: campañas en frío (/prospectos/campanas)
// y el bloque «Correos» de la ficha del prospecto.
//
// Permisos: ver y preparar, los roles de Ingresos. ACTIVAR una campaña,
// quitar la pausa general y APROBAR el envío de un video: solo CEO y gerente
// comercial. Pausar y detener puede cualquiera de Ingresos (frenar nunca
// hace daño). Ninguna lanza errores esperados: devuelven `{ error }`.

type Resultado = { error?: string; aviso?: string; id?: string };

async function seguro(modo: "ingresos" | "envio", fn: (profile: Profile, admin: ReturnType<typeof createAdminClient>) => Promise<Resultado>): Promise<Resultado> {
  try {
    const profile = await requireProfile();
    if (!(INGRESOS_ROLES as string[]).includes(profile.role)) return { error: "No tienes permiso para hacer esto." };
    if (modo === "envio" && !ROLES_ACTIVAN_ENVIO.includes(profile.role)) {
      return { error: "Solo el CEO o el gerente comercial pueden autorizar envíos." };
    }
    const r = await fn(profile, createAdminClient());
    revalidatePath("/prospectos", "layout");
    return r;
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

function resumenImporte(i?: { agregados: number; descartados: number }): string | undefined {
  if (!i) return undefined;
  return `${i.agregados} leads agregados${i.descartados ? ` · ${i.descartados} descartados (mira el motivo abajo)` : ""}.`;
}

export async function crearCampanaAccion(formData: FormData): Promise<Resultado> {
  return seguro("ingresos", async (profile, admin) => {
    const linea = String(formData.get("linea") ?? "");
    if (!(SERVICIOS as readonly string[]).includes(linea)) return { error: "Elige la línea." };
    const r = await crearCampana(
      admin,
      {
        nombre: String(formData.get("nombre") ?? ""),
        linea: linea as Servicio,
        plantilla: String(formData.get("plantilla") ?? ""),
        usarIA: formData.get("usarIA") === "on",
        leads: String(formData.get("leads") ?? "").slice(0, 600_000),
      },
      profile.name,
    );
    if ("error" in r) return r;
    return { id: r.id, aviso: resumenImporte(r.importe) };
  });
}

export async function editarCampanaAccion(id: string, cambio: { plantilla?: string; usarIA?: boolean; leads?: string }): Promise<Resultado> {
  return seguro("ingresos", async (profile, admin) => {
    const r = await editarCampana(
      admin,
      String(id),
      {
        plantilla: typeof cambio?.plantilla === "string" ? cambio.plantilla : undefined,
        usarIA: typeof cambio?.usarIA === "boolean" ? cambio.usarIA : undefined,
        leads: typeof cambio?.leads === "string" ? cambio.leads.slice(0, 600_000) : undefined,
      },
      profile.name,
    );
    if ("error" in r) return r;
    return { aviso: resumenImporte(r.importe) };
  });
}

export async function estadoCampanaAccion(id: string, estado: EstadoCampana): Promise<Resultado> {
  // Activar o reanudar es autorizar envíos; pausar lo puede hacer cualquiera de Ingresos.
  return seguro(estado === "activa" ? "envio" : "ingresos", async (profile, admin) => {
    if (estado !== "activa" && estado !== "pausada") return { error: "Estado inválido." };
    return cambiarEstadoCampana(admin, String(id), estado, { id: profile.id, nombre: profile.name });
  });
}

export async function pausaGeneralAccion(pausar: boolean): Promise<Resultado> {
  return seguro(pausar ? "ingresos" : "envio", async (_p, admin) => {
    await guardarConfig(admin, { pausaGeneral: !!pausar });
    return {};
  });
}

export async function guardarExclusionesAccion(texto: string): Promise<Resultado> {
  return seguro("ingresos", async (_p, admin) => {
    const lista = leerExclusiones(String(texto ?? "").slice(0, 200_000));
    await guardarConfig(admin, { exclusiones: lista });
    return { aviso: `${lista.length} entradas en la lista de exclusión.` };
  });
}

export async function devolverSinConfirmarAccion(id: string): Promise<Resultado> {
  return seguro("envio", async (_p, admin) => {
    const r = await devolverSinConfirmar(admin, String(id));
    return { aviso: `${r.devueltos} leads volvieron a la cola.` };
  });
}

export async function prospectoDesdeLeadAccion(campanaId: string, leadId: string): Promise<Resultado> {
  return seguro("ingresos", async (profile, admin) => prospectoDesdeLead(admin, String(campanaId), String(leadId), profile.name));
}

// ------------------------------------------------ ficha del prospecto ----

const UUID = /^[0-9a-f-]{36}$/i;

export async function aprobarEnvioCorreo(id: string): Promise<Resultado> {
  return seguro("envio", async (profile, admin) => {
    if (!UUID.test(String(id))) return { error: "Prospecto inválido." };
    return aprobarEnvio(admin, id, { id: profile.id, nombre: profile.name });
  });
}

export async function retirarAprobacionCorreo(id: string): Promise<Resultado> {
  return seguro("ingresos", async (profile, admin) => (UUID.test(String(id)) ? retirarAprobacion(admin, id, profile.name) : { error: "Prospecto inválido." }));
}

export async function detenerSeguimientosCorreo(id: string): Promise<Resultado> {
  return seguro("ingresos", async (profile, admin) => (UUID.test(String(id)) ? detenerSeguimientos(admin, id, profile.name) : { error: "Prospecto inválido." }));
}

export async function reanudarSeguimientosCorreo(id: string): Promise<Resultado> {
  return seguro("envio", async (profile, admin) => (UUID.test(String(id)) ? reanudarSeguimientos(admin, id, profile.name) : { error: "Prospecto inválido." }));
}

export async function soltarEnvioCorreo(id: string): Promise<Resultado> {
  return seguro("envio", async (_p, admin) => (UUID.test(String(id)) ? soltarEnvio(admin, id) : { error: "Prospecto inválido." }));
}
