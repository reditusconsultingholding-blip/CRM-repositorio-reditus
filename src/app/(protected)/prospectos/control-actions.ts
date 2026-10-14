"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireProfile, INGRESOS_ROLES, type Profile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLES_ACTIVAN_ENVIO } from "@/lib/prospeccion-correo";
import { idDeHoja, leerConfigAuto, type ConfigAuto } from "@/lib/prospeccion-auto";
import { activarCampanasAutomaticas, guardarConfig, leerConfig } from "@/lib/prospeccion-correo-server";
import { resolverCola, sincronizarHoja, type AccionCola } from "@/lib/prospeccion-auto-server";

// Acciones del panel de control de la prospección automática
// (/prospectos/control).
//
// Permisos: los interruptores, los topes, el remitente y la hoja los cambia
// SOLO el CEO. Aprobar una respuesta o pasar a alguien a candidato a video:
// CEO o gerente comercial. Descartar, marcar «no interesado» y pedir una
// sincronización: cualquiera de Ingresos. La pausa total sigue en
// `pausaGeneralAccion` (pausar puede cualquiera de Ingresos; reanudar, CEO o
// gerente). Ninguna lanza errores esperados: devuelven `{ error }`.

type Resultado = { error?: string; aviso?: string };
type Admin = ReturnType<typeof createAdminClient>;

async function seguro(modo: "ingresos" | "envio" | "ceo", fn: (profile: Profile, admin: Admin) => Promise<Resultado>): Promise<Resultado> {
  try {
    const profile = await requireProfile();
    if (!(INGRESOS_ROLES as string[]).includes(profile.role)) return { error: "No tienes permiso para hacer esto." };
    if (modo === "envio" && !ROLES_ACTIVAN_ENVIO.includes(profile.role)) return { error: "Solo el CEO o el gerente comercial pueden aprobar esto." };
    if (modo === "ceo" && profile.role !== "ceo") return { error: "Solo el CEO cambia la configuración de la prospección automática." };
    const r = await fn(profile, createAdminClient());
    revalidatePath("/prospectos", "layout");
    return r;
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

type CambioAuto = { [K in keyof ConfigAuto]?: Partial<ConfigAuto[K]> };

/** Guarda interruptores, topes, palabras y datos del remitente. Encender «Envío» o «Entrega automática» deja anotado quién lo autorizó. */
export async function guardarAutoAccion(cambio: CambioAuto): Promise<Resultado> {
  return seguro("ceo", async (profile, admin) => {
    const actual = (await leerConfig()).auto;
    const c = (cambio && typeof cambio === "object" ? cambio : {}) as CambioAuto;
    const quien = { por: profile.name, porId: profile.id, fecha: new Date().toISOString() };
    const nueva = leerConfigAuto({
      busqueda: { ...actual.busqueda, ...c.busqueda, palabras: { ...actual.busqueda.palabras, ...(c.busqueda?.palabras ?? {}) } },
      envio: { ...actual.envio, ...c.envio },
      respuestas: { ...actual.respuestas, ...c.respuestas },
      entrega: { ...actual.entrega, ...c.entrega },
      remitente: { ...actual.remitente, ...c.remitente },
      // La hoja se conecta con su propia acción.
      hoja: actual.hoja,
    });
    if (nueva.busqueda.usdPorCorrida > nueva.busqueda.usdPorDia) return { error: "El tope por corrida no puede ser mayor que el tope por día." };
    nueva.envio.autorizadoPor = nueva.envio.activo ? (actual.envio.activo ? actual.envio.autorizadoPor : quien) : null;
    nueva.entrega.autorizadoPor = nueva.entrega.automatica ? (actual.entrega.automatica ? actual.entrega.autorizadoPor : quien) : null;
    await guardarConfig(admin, { auto: nueva });
    let aviso: string | undefined;
    if (nueva.envio.activo !== actual.envio.activo) {
      const n = await activarCampanasAutomaticas(admin, nueva.envio.activo, { id: profile.id, nombre: profile.name });
      aviso = nueva.envio.activo ? `Envío encendido${n ? ` (${n} ${n === 1 ? "campaña automática" : "campañas automáticas"})` : ""}. Sale en horario laboral del país de cada tienda.` : "Envío apagado: no salen correos nuevos. Las entregas ya aprobadas y las respuestas aprobadas sí salen; para frenar todo usa la pausa total.";
    }
    return { aviso };
  });
}

/** Conecta la hoja de prospectos (enlace o id) y hace la primera sincronización. */
export async function conectarHojaAccion(enlace: string, pestanas?: { ES?: string; MX?: string }): Promise<Resultado> {
  return seguro("ceo", async (_p, admin) => {
    const id = idDeHoja(enlace);
    const actual = (await leerConfig()).auto;
    if (!id && String(enlace ?? "").trim()) return { error: "Ese no parece el enlace de una hoja de Google (debe traer /spreadsheets/d/…)." };
    const hoja = { id, activa: !!id, pestanas: { ES: pestanas?.ES?.trim() || actual.hoja.pestanas.ES, MX: pestanas?.MX?.trim() || actual.hoja.pestanas.MX } };
    await guardarConfig(admin, { auto: leerConfigAuto({ ...actual, hoja }) });
    if (!id) return { aviso: "Hoja desconectada." };
    const r = await sincronizarHoja(admin, new Date());
    return r.error ? { error: r.error } : { aviso: `Conectada. ${r.leidas} filas leídas, ${r.importadas} entraron al CRM, ${r.actualizadas} estados actualizados en la hoja.` };
  });
}

export async function sincronizarHojaAccion(): Promise<Resultado> {
  return seguro("ingresos", async (_p, admin) => {
    const r = await sincronizarHoja(admin, new Date());
    return r.error ? { error: r.error } : { aviso: `${r.leidas} filas leídas · ${r.importadas} nuevas al CRM · ${r.actualizadas} estados a la hoja · ${r.agregadas} tiendas agregadas a la hoja.` };
  });
}

/** Lo que una persona decide sobre una respuesta en cola. Aprobar el texto es lo único que hace que salga. */
export async function resolverColaAccion(id: string, accion: AccionCola): Promise<Resultado> {
  const tipo = accion?.tipo;
  if (!["aprobar", "descartar", "es_si", "no_interesado", "devolver", "dar_por_enviada"].includes(tipo)) return { error: "Acción desconocida." };
  const modo = tipo === "descartar" || tipo === "no_interesado" ? "ingresos" : "envio";
  return seguro(modo, async (profile, admin) => resolverCola(admin, String(id), accion, { id: profile.id, nombre: profile.name }, new Date()));
}
