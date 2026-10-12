"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireProfile, type Profile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FORMATOS_VERSION, buscarFormato, type FormatoVideo } from "@/lib/video-formatos";
import { MAX_GUION, VIDEOS_ROLES, leerDatosVideo, rellenar, type DatosVideo, type GuionGuardado, type OrigenGuion } from "@/lib/videos";
import {
  ID_VALIDO,
  escribirGuionArchivo,
  generarGuionVideo,
  generarVideo,
  investigarMercado,
  leerGuionArchivo,
} from "@/lib/videos-server";

// Acciones de «Crear video». Todas validan primero quién llama (roles de
// Ingresos o editor de video) y recién entonces usan el cliente de servicio.
// Ninguna lanza errores esperados: devuelven `{ error }`.

async function seguro<T extends object>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err); // deja pasar el redirect a /login de requireProfile
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

async function entrar(): Promise<{ profile: Profile } | { error: string }> {
  const profile = await requireProfile();
  if (!VIDEOS_ROLES.includes(profile.role)) return { error: "No tienes permiso para hacer esto." };
  return { profile };
}

function preparar(raw: unknown): { datos: DatosVideo; formato: FormatoVideo } | { error: string } {
  const datos = leerDatosVideo(raw);
  const formato = buscarFormato(datos.formato);
  if (!formato) return { error: "Elige un formato." };
  if (!datos.producto) return { error: "Falta el producto: sin eso no se puede escribir el guion." };
  return { datos, formato };
}

// ---------------------------------------------------- investigación ----

export async function resumirMercado(
  raw: unknown,
): Promise<{ resumen: string; fuente: string; aviso?: string } | { error: string }> {
  return seguro(async () => {
    const a = await entrar();
    if ("error" in a) return a;
    const p = preparar(raw);
    if ("error" in p) return p;
    const r = await investigarMercado(p.datos, p.formato);
    return { resumen: r.resumen, fuente: r.fuente, aviso: r.aviso };
  });
}

// ------------------------------------------------------------ guion ----

export async function escribirGuion(
  raw: unknown,
  indicacion?: string,
): Promise<{ texto: string; origen: OrigenGuion; aviso?: string } | { error: string }> {
  return seguro(async () => {
    const a = await entrar();
    if ("error" in a) return a;
    const p = preparar(raw);
    if ("error" in p) return p;
    return generarGuionVideo(p.datos, p.formato, typeof indicacion === "string" ? indicacion : undefined);
  });
}

// --------------------------------------------------------- guardado ----

export async function guardarGuionVideo(entrada: {
  id?: string | null;
  datos: unknown;
  guion: string;
  origen: OrigenGuion;
  prospectoId?: string | null;
}): Promise<{ guardado: GuionGuardado } | { error: string }> {
  return seguro(async () => {
    const a = await entrar();
    if ("error" in a) return a;
    const p = preparar(entrada?.datos);
    if ("error" in p) return p;
    const guion = String(entrada.guion ?? "").slice(0, MAX_GUION);
    if (!guion.trim()) return { error: "El guion está vacío: genéralo o escríbelo antes de guardar." };

    const admin = createAdminClient();
    const ahora = new Date().toISOString();
    let previo: GuionGuardado | null = null;
    if (entrada.id) {
      if (!ID_VALIDO.test(entrada.id)) return { error: "Guion inválido." };
      previo = await leerGuionArchivo(admin, entrada.id);
      if (!previo) return { error: "No se encontró el guion que intentas actualizar. Guárdalo como nuevo." };
    }
    const prospectoId =
      typeof entrada.prospectoId === "string" && ID_VALIDO.test(entrada.prospectoId) ? entrada.prospectoId : null;

    const guardado: GuionGuardado = {
      ...p.datos,
      id: previo?.id ?? randomUUID(),
      version: 1,
      formatoNombre: p.formato.nombre,
      formatosVersion: FORMATOS_VERSION,
      guion,
      origen: entrada.origen === "ia" || entrada.origen === "plantilla" ? entrada.origen : "manual",
      prospectoId: prospectoId ?? previo?.prospectoId ?? null,
      // El autor es quien lo creó; las ediciones posteriores no lo cambian.
      autorId: previo?.autorId || a.profile.id,
      autorNombre: previo?.autorNombre || a.profile.name,
      creadoAt: previo?.creadoAt || ahora,
      actualizadoAt: ahora,
    };
    const r = await escribirGuionArchivo(admin, guardado);
    if (r.error) return { error: r.error };
    revalidatePath("/videos");
    return { guardado };
  });
}

// -------------------------------------------------- generar video ----

/** Hoy siempre responde que no está conectado: ver `generarVideo()` en lib/videos-server.ts. */
export async function solicitarVideo(raw: unknown, guion: string): Promise<{ clips: string[] } | { error: string }> {
  return seguro(async () => {
    const a = await entrar();
    if ("error" in a) return a;
    const p = preparar(raw);
    if ("error" in p) return p;
    const r = await generarVideo({
      guion: String(guion ?? "").slice(0, MAX_GUION),
      formato: p.formato.slug,
      relacionAspecto: p.formato.relacion_aspecto,
      escenas: p.formato.prompts.map((e) => ({ escena: e.escena, prompt: rellenar(e.prompt, p.datos) })),
    });
    return r.listo ? { clips: r.clips } : { error: r.motivo };
  });
}
