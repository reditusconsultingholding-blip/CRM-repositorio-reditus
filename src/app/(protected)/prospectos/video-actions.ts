"use server";

import { unstable_rethrow } from "next/navigation";
import { requireProfile, INGRESOS_ROLES, type Profile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerConfig } from "@/lib/videos-config-server";
import { enMarcha, type FilaVideoProspecto, type VideoProspecto } from "@/lib/videos-prospecto";
import { agendarSinPreguntar, agendarVideoProspecto, candidatoDeVideo, correrEtapaProspecto, filasDeVideo, guardarVideoProspecto, leerVideoProspecto } from "@/lib/videos-prospecto-server";

// Video automático para prospectos. Solo el CEO decide (Sí / No / generar
// ahora); el resto del equipo comercial ve el estado. Ninguna acción lanza
// errores esperados: devuelven `{ error }`.

async function seguro<T extends object>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

async function entrar(): Promise<{ profile: Profile; admin: ReturnType<typeof createAdminClient> } | { error: string }> {
  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) return { error: "No tienes permiso para ver esto." };
  return { profile, admin: createAdminClient() };
}

export type EstadoVideosProspectos = { filas: FilaVideoProspecto[]; pideAprobacion: boolean };

/** Los prospectos candidatos a video, con su estado. Con la pregunta apagada, los que falten se agendan aquí. */
export async function videosDeProspectos(): Promise<EstadoVideosProspectos | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    const cfg = await leerConfig(x.admin);
    const filas = await agendarSinPreguntar(x.admin, await filasDeVideo(x.admin));
    return { filas, pideAprobacion: cfg.aprobarProspectos };
  });
}

/** El Sí o el No del dueño. Sí agenda el video; No lo deja marcado y no se vuelve a preguntar. */
export async function decidirVideoProspecto(prospectoId: string, hacer: boolean): Promise<{ video: VideoProspecto } | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    if (x.profile.role !== "ceo") return { error: "Solo el CEO decide a qué prospectos se les hace video." };
    const c = await candidatoDeVideo(x.admin, prospectoId);
    if (!c) return { error: "Ese prospecto ya no es candidato a video (ya tiene uno o cambió de etapa)." };
    if (hacer) return agendarVideoProspecto(x.admin, c, { id: x.profile.id, nombre: x.profile.name });
    const previo = await leerVideoProspecto(c.id);
    if (previo.etapa === "lanzado") return { error: "Ese video ya está en marcha: detenlo desde «Creativos»." };
    const video: VideoProspecto = { ...previo, etapa: "no", detalle: "", retomarEn: "", decididoPor: x.profile.name, decididoPorId: x.profile.id, decididoAt: new Date().toISOString() };
    const w = await guardarVideoProspecto(x.admin, video);
    return w.error ? { error: w.error } : { video };
  });
}

/** Completa a mano la oferta o el llamado cuando la página no los deja ver, y lo vuelve a agendar. Solo CEO. */
export async function completarVideoProspecto(prospectoId: string, datos: { oferta?: string; llamado?: string }): Promise<{ video: VideoProspecto } | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    if (x.profile.role !== "ceo") return { error: "Solo el CEO puede volver a correr el video de un prospecto." };
    const c = await candidatoDeVideo(x.admin, prospectoId);
    if (!c) return { error: "Ese prospecto ya no es candidato a video." };
    const previo = await leerVideoProspecto(c.id);
    if (previo.etapa !== "detenido") return { error: "Ese video no está detenido." };
    const oferta = String(datos?.oferta ?? "").trim().slice(0, 400);
    const llamado = String(datos?.llamado ?? "").trim().slice(0, 200);
    const w = await guardarVideoProspecto(x.admin, { ...previo, oferta: oferta || previo.oferta, llamado: llamado || previo.llamado });
    if (w.error) return { error: w.error };
    return agendarVideoProspecto(x.admin, c, { id: x.profile.id, nombre: x.profile.name });
  });
}

/**
 * Corre UNA etapa del video de un prospecto agendado. La pantalla la llama en
 * cadena mientras está abierta (cada etapa cabe en el tiempo de una función);
 * si se cierra, sigue el latido del servidor de videos.
 */
export async function correrVideoProspecto(prospectoId: string): Promise<{ video: VideoProspecto } | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    const c = await candidatoDeVideo(x.admin, prospectoId);
    if (!c) return { error: "Ese prospecto ya no es candidato a video." };
    const previo = await leerVideoProspecto(c.id);
    if (!enMarcha(previo.etapa)) return { video: previo };
    return { video: await correrEtapaProspecto(x.admin, c) };
  });
}

/**
 * «Generar ahora para los últimos 3 prospectos»: los agenda sin preguntar uno
 * por uno (el dueño ya lo autorizó para esos tres). Solo CEO. No toca los que
 * ya están en marcha ni los que tienen un No.
 */
export async function generarParaLosUltimos(cuantos = 3): Promise<EstadoVideosProspectos | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    if (x.profile.role !== "ceo") return { error: "Solo el CEO puede lanzar videos de prospectos." };
    const n = Math.min(3, Math.max(1, Math.floor(cuantos)));
    const filas = await filasDeVideo(x.admin);
    const elegidas = filas.filter((f) => f.video.etapa === "sin-decidir" || f.video.etapa === "detenido").slice(0, n);
    if (!elegidas.length) return { error: "No hay prospectos recientes pendientes de video." };
    for (const f of elegidas) await agendarVideoProspecto(x.admin, f.candidato, { id: x.profile.id, nombre: x.profile.name });
    return { filas: await filasDeVideo(x.admin), pideAprobacion: (await leerConfig(x.admin)).aprobarProspectos };
  });
}
