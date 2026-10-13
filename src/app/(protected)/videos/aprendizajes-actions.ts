"use server";

import { randomBytes } from "crypto";
import { unstable_rethrow } from "next/navigation";
import { requireProfile, type Profile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { VIDEOS_ROLES } from "@/lib/videos";
import { ID_VALIDO, leerGuionArchivo } from "@/lib/videos-server";
import { TONOS_MUSICA, type TonoMusica } from "@/lib/proyecto-video";
import { BUCKET_VIDEOS_GENERADOS } from "@/lib/trabajos-video";
import { buscarFormato } from "@/lib/video-formatos";
import { ETAPAS_APRENDIZAJE, type Aprendizaje, type EtapaAprendizaje } from "@/lib/aprendizajes-video";
import {
  MAX_PISTAS_POR_TONO,
  RUTA_MUSICA,
  editarAprendizaje,
  guardarMusica,
  leerMusica,
  leerTodosLosAprendizajes,
  registrarAprendizaje,
  type BibliotecaMusica,
  type CambioAprendizaje,
} from "@/lib/aprendizajes-video-server";

// Aprendizajes (lo que el equipo va corrigiendo) y biblioteca de música por tono.
// Los aprendizajes los escriben y editan el CEO y la directora operativa; la música, el CEO.

const EDITAN_APRENDIZAJES = ["ceo", "directora_operativa"];
const CARPETA_MUSICA = "videos-musica";
const MAX_PISTA_BYTES = 15 * 1024 * 1024;

async function seguro<T extends object>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

async function entrar(): Promise<{ profile: Profile } | { error: string }> {
  const profile = await requireProfile();
  if (!VIDEOS_ROLES.includes(profile.role)) return { error: "No tienes permiso para hacer esto." };
  return { profile };
}

export type EstadoAprendizajes = { lista: Aprendizaje[]; puedeEditar: boolean; aviso?: string };

export async function listarAprendizajes(): Promise<EstadoAprendizajes | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    return { lista: await leerTodosLosAprendizajes(true), puedeEditar: EDITAN_APRENDIZAJES.includes(x.profile.role) };
  });
}

export type Retro = { nota: string; etapa: string; general?: boolean; importante?: boolean; formato?: string };

/**
 * Guarda una retroalimentación como aprendizaje. Con `guionId`, queda asociada a ese video
 * y a su formato; sin él (desde la pantalla «Aprendizajes»), al formato que se indique.
 */
export async function guardarRetro(guionId: string | null, r: Retro): Promise<EstadoAprendizajes | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    if (!EDITAN_APRENDIZAJES.includes(x.profile.role)) return { error: "Los aprendizajes los escriben el CEO y la directora operativa." };
    const nota = String(r?.nota ?? "").trim();
    if (nota.length < 8) return { error: "Escribe la retroalimentación con un poco más de detalle." };
    const etapa = (ETAPAS_APRENDIZAJE as readonly string[]).includes(r?.etapa) ? (r.etapa as EtapaAprendizaje) : "guion";
    const admin = createAdminClient();
    let formato = typeof r?.formato === "string" && buscarFormato(r.formato) ? r.formato : "";
    let producto = "";
    if (guionId) {
      if (!ID_VALIDO.test(guionId)) return { error: "Guion inválido." };
      const g = await leerGuionArchivo(admin, guionId);
      if (!g) return { error: "No se encontró el video." };
      formato = g.formato;
      producto = g.producto;
    }
    const general = r?.general === true || !formato;
    const w = await registrarAprendizaje(admin, { nota, quien: { id: x.profile.id, nombre: x.profile.name }, guionId: guionId ?? "", producto, formato, etapa, general, origen: guionId ? "retro" : "manual", importante: r?.importante === true });
    if (w.error) return { error: w.error };
    return {
      lista: await leerTodosLosAprendizajes(true),
      puedeEditar: true,
      aviso: w.aprendizaje ? `Guardado como regla: «${w.aprendizaje.regla}»` : "Esa nota ya estaba guardada o no deja una regla para videos futuros: no se agregó nada.",
    };
  });
}

export async function cambiarAprendizaje(id: string, cambio: CambioAprendizaje): Promise<EstadoAprendizajes | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    if (!EDITAN_APRENDIZAJES.includes(x.profile.role)) return { error: "Los aprendizajes los editan el CEO y la directora operativa." };
    const c: CambioAprendizaje = {
      ...(typeof cambio?.regla === "string" ? { regla: cambio.regla } : {}),
      ...(typeof cambio?.activo === "boolean" ? { activo: cambio.activo } : {}),
      ...(typeof cambio?.importante === "boolean" ? { importante: cambio.importante } : {}),
      ...(typeof cambio?.formato === "string" && (cambio.formato === "" || buscarFormato(cambio.formato)) ? { formato: cambio.formato } : {}),
      ...((ETAPAS_APRENDIZAJE as readonly string[]).includes(cambio?.etapa as string) ? { etapa: cambio.etapa } : {}),
    };
    const r = await editarAprendizaje(createAdminClient(), String(id ?? ""), c, x.profile.name);
    if ("error" in r) return r;
    return { lista: r.lista, puedeEditar: true };
  });
}

// ------------------------------------------------------------------ música ----

export type EstadoMusica = { biblioteca: Record<TonoMusica, string[]>; puedeEditar: boolean; ruta: string };

const vista = (b: BibliotecaMusica, puedeEditar: boolean): EstadoMusica => ({ biblioteca: { neutro: b.neutro, energia: b.energia, suspenso: b.suspenso, emotivo: b.emotivo }, puedeEditar, ruta: `trabajos/${RUTA_MUSICA}` });
const tonoValido = (t: unknown): t is TonoMusica => (TONOS_MUSICA as readonly string[]).includes(t as string);

export async function bibliotecaMusica(): Promise<EstadoMusica | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    return vista(await leerMusica(), x.profile.role === "ceo");
  });
}

async function soloCeo(): Promise<{ profile: Profile } | { error: string }> {
  const x = await entrar();
  if ("error" in x) return x;
  return x.profile.role === "ceo" ? x : { error: "La biblioteca de música la cambia el CEO." };
}

/** Agrega una pista por su enlace https (un mp3 que el servidor de videos pueda descargar). */
export async function agregarPista(tono: string, url: string): Promise<EstadoMusica | { error: string }> {
  return seguro(async () => {
    const x = await soloCeo();
    if ("error" in x) return x;
    if (!tonoValido(tono)) return { error: "Tono inválido." };
    const u = String(url ?? "").trim();
    if (!/^https:\/\/[^\s"'<>]{8,600}$/.test(u) || !/\.mp3(\?|$)/i.test(u)) return { error: "La pista debe ser un enlace https que termine en .mp3." };
    const b = await leerMusica();
    if (b[tono].includes(u)) return vista(b, true);
    if (b[tono].length >= MAX_PISTAS_POR_TONO) return { error: `Ese tono ya tiene ${MAX_PISTAS_POR_TONO} pistas: quita alguna primero.` };
    b[tono] = [...b[tono], u];
    const w = await guardarMusica(createAdminClient(), b);
    return w.error ? { error: w.error } : vista(b, true);
  });
}

/** Quita una pista de la biblioteca (el archivo no se borra del almacenamiento). */
export async function quitarPista(tono: string, url: string): Promise<EstadoMusica | { error: string }> {
  return seguro(async () => {
    const x = await soloCeo();
    if ("error" in x) return x;
    if (!tonoValido(tono)) return { error: "Tono inválido." };
    const b = await leerMusica();
    b[tono] = b[tono].filter((u) => u !== url);
    if (b._ultima[tono] === url) delete b._ultima[tono];
    const w = await guardarMusica(createAdminClient(), b);
    return w.error ? { error: w.error } : vista(b, true);
  });
}

/** Subir un mp3 · paso 1: permiso de subida directa al almacenamiento público. */
export async function prepararPista(archivo: { tono: string; tipo: string; tamano: number }): Promise<{ path: string; token: string } | { error: string }> {
  return seguro(async () => {
    const x = await soloCeo();
    if ("error" in x) return x;
    if (!tonoValido(archivo?.tono)) return { error: "Tono inválido." };
    if (!/^audio\/(mpeg|mp3)$/.test(String(archivo?.tipo ?? ""))) return { error: "La pista debe ser un archivo mp3." };
    const tamano = Number(archivo?.tamano ?? 0);
    if (!tamano || tamano > MAX_PISTA_BYTES) return { error: `La pista pesa ${(tamano / 1024 / 1024).toFixed(1)} MB y el máximo es ${MAX_PISTA_BYTES / 1024 / 1024} MB.` };
    const path = `${CARPETA_MUSICA}/${archivo.tono}/${Date.now()}-${randomBytes(6).toString("hex")}.mp3`;
    const { data, error } = await createAdminClient().storage.from(BUCKET_VIDEOS_GENERADOS).createSignedUploadUrl(path);
    if (error || !data) return { error: `No se pudo preparar la subida: ${error?.message ?? "sin respuesta"}` };
    return { path: data.path, token: data.token };
  });
}

/** Subir un mp3 · paso 2: confirma que quedó en el almacenamiento y lo agrega a su tono. */
export async function confirmarPista(path: string): Promise<EstadoMusica | { error: string }> {
  return seguro(async () => {
    const x = await soloCeo();
    if ("error" in x) return x;
    const m = /^videos-musica\/(neutro|energia|suspenso|emotivo)\/(\d{10,}-[0-9a-f]{12}\.mp3)$/.exec(String(path ?? ""));
    if (!m) return { error: "Pista inválida." };
    const almacen = createAdminClient().storage.from(BUCKET_VIDEOS_GENERADOS);
    const { data: lista, error } = await almacen.list(`${CARPETA_MUSICA}/${m[1]}`, { search: m[2] });
    if (error || !lista?.some((o) => o.name === m[2])) return { error: "La subida no terminó. Intenta de nuevo." };
    return agregarPista(m[1], almacen.getPublicUrl(m[0]).data.publicUrl);
  });
}
