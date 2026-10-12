"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireProfile, type Profile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FORMATOS_VERSION, buscarFormato, type FormatoVideo } from "@/lib/video-formatos";
import {
  ESTADOS_GUION,
  MAX_CORRECCION,
  MAX_GUION,
  MAX_VERSIONES,
  VIDEOS_ROLES,
  leerDatosVideo,
  rellenar,
  versionVigente,
  type Correccion,
  type DatosVideo,
  type EstadoGuion,
  type GuionGuardado,
  type OrigenGuion,
  type VersionGuion,
} from "@/lib/videos";
import {
  ID_VALIDO,
  VIDEO_IA_ACTIVO,
  corregirGuionVideo,
  escribirGuionArchivo,
  generarGuionVideo,
  generarVideo,
  investigarMercado,
  leerGuionArchivo,
} from "@/lib/videos-server";

// Acciones de «Crear video». Todas validan primero quién llama (roles de
// Ingresos o editor de video) y recién entonces usan el cliente de servicio.
// Ninguna lanza errores esperados: devuelven `{ error }`.
//
// Versiones: el archivo de un guion guarda TODAS sus versiones. Cada cambio
// de texto (a mano, por una corrección del cliente o al restaurar) agrega una
// versión nueva al final; ninguna se reescribe ni se borra.

type Almacen = ReturnType<typeof createAdminClient>;
type ConGuion = { guardado: GuionGuardado; aviso?: string } | { error: string };

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

/** Valida a quien llama y trae el guion guardado con su formato. */
async function abrir(
  id: string,
): Promise<{ profile: Profile; admin: Almacen; g: GuionGuardado; formato: FormatoVideo } | { error: string }> {
  const a = await entrar();
  if ("error" in a) return a;
  if (typeof id !== "string" || !ID_VALIDO.test(id)) return { error: "Guion inválido." };
  const admin = createAdminClient();
  const g = await leerGuionArchivo(admin, id);
  if (!g) return { error: "No se encontró el guion." };
  const formato = buscarFormato(g.formato);
  if (!formato) return { error: "El formato de este guion ya no existe en la biblioteca." };
  return { profile: a.profile, admin, g, formato };
}

function escenasDe(formato: FormatoVideo, datos: DatosVideo): VersionGuion["escenas"] {
  return formato.prompts.map((e) => ({ escena: e.escena, prompt: rellenar(e.prompt, datos) }));
}

/** Agrega una versión al final. No toca las anteriores. */
function agregarVersion(
  g: GuionGuardado,
  v: Pick<VersionGuion, "guion" | "escenas" | "origen" | "queCambio"> &
    Partial<Pick<VersionGuion, "correccionId" | "correccion" | "restauradaDe">>,
  profile: Profile,
  ahora: string,
): VersionGuion | { error: string } {
  if (g.versiones.length >= MAX_VERSIONES) {
    return { error: `Este guion ya tiene ${MAX_VERSIONES} versiones. Usa «Guardar como nuevo» para seguir sin perder ninguna.` };
  }
  const nueva: VersionGuion = {
    n: (versionVigente(g)?.n ?? 0) + 1,
    guion: v.guion,
    escenas: v.escenas,
    origen: v.origen,
    correccionId: v.correccionId ?? null,
    correccion: v.correccion ?? "",
    queCambio: v.queCambio,
    restauradaDe: v.restauradaDe ?? null,
    autorId: profile.id,
    autorNombre: profile.name,
    fecha: ahora,
    videoUrl: null,
  };
  g.versiones = [...g.versiones, nueva];
  g.guion = nueva.guion;
  g.origen = nueva.origen;
  g.actualizadoAt = ahora;
  return nueva;
}

/** Marca una corrección como aplicada por la versión `n` y ajusta el estado. */
function resolverCorreccion(g: GuionGuardado, correccionId: string, n: number) {
  g.correcciones = g.correcciones.map((c) => (c.id === correccionId ? { ...c, estado: "aplicada", version: n } : c));
  // Ya no queda nada pendiente: vuelve a borrador para mandárselo otra vez al cliente.
  if (g.estado === "correccion_pendiente" && !g.correcciones.some((c) => c.estado === "pendiente")) g.estado = "borrador";
}

async function guardar(admin: Almacen, g: GuionGuardado, aviso?: string): Promise<ConGuion> {
  const r = await escribirGuionArchivo(admin, g);
  if (r.error) return { error: r.error };
  revalidatePath("/videos");
  return { guardado: g, aviso };
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

/**
 * Guarda el guion. Si ya existía y el texto cambió, agrega una versión. Con
 * `correccionId`, esa versión queda ligada a la corrección del cliente y la
 * marca como aplicada (corrección hecha a mano).
 */
export async function guardarGuionVideo(entrada: {
  id?: string | null;
  datos: unknown;
  guion: string;
  origen: OrigenGuion;
  prospectoId?: string | null;
  correccionId?: string | null;
}): Promise<ConGuion> {
  return seguro(async () => {
    const a = await entrar();
    if ("error" in a) return a;
    const p = preparar(entrada?.datos);
    if ("error" in p) return p;
    const guion = String(entrada.guion ?? "").slice(0, MAX_GUION);
    if (!guion.trim()) return { error: "El guion está vacío: genéralo o escríbelo antes de guardar." };
    const origen: OrigenGuion = entrada.origen === "ia" || entrada.origen === "plantilla" ? entrada.origen : "manual";
    const prospectoId =
      typeof entrada.prospectoId === "string" && ID_VALIDO.test(entrada.prospectoId) ? entrada.prospectoId : null;

    const admin = createAdminClient();
    const ahora = new Date().toISOString();

    if (!entrada.id) {
      const nuevo: GuionGuardado = {
        ...p.datos,
        id: randomUUID(),
        version: 1,
        formatoNombre: p.formato.nombre,
        formatosVersion: FORMATOS_VERSION,
        guion,
        origen,
        estado: "borrador",
        versiones: [],
        correcciones: [],
        prospectoId,
        autorId: a.profile.id,
        autorNombre: a.profile.name,
        creadoAt: ahora,
        actualizadoAt: ahora,
      };
      const v = agregarVersion(nuevo, { guion, escenas: escenasDe(p.formato, p.datos), origen, queCambio: "" }, a.profile, ahora);
      if ("error" in v) return v;
      return guardar(admin, nuevo);
    }

    if (!ID_VALIDO.test(entrada.id)) return { error: "Guion inválido." };
    const previo = await leerGuionArchivo(admin, entrada.id);
    if (!previo) return { error: "No se encontró el guion que intentas actualizar. Guárdalo como nuevo." };

    // Se actualizan los datos; el autor y la fecha de creación no cambian.
    const g: GuionGuardado = {
      ...previo,
      ...p.datos,
      formatoNombre: p.formato.nombre,
      formatosVersion: FORMATOS_VERSION,
      prospectoId: prospectoId ?? previo.prospectoId,
      actualizadoAt: ahora,
    };
    const correccion: Correccion | undefined = entrada.correccionId
      ? g.correcciones.find((c) => c.id === entrada.correccionId && c.estado === "pendiente")
      : undefined;
    if (entrada.correccionId && !correccion) return { error: "Esa corrección ya no está pendiente." };

    const cambio = guion !== previo.guion;
    if (correccion && !cambio) {
      return { error: "El guion no cambió: edítalo con lo que pidió el cliente y vuelve a marcarla como aplicada." };
    }
    if (cambio) {
      const v = agregarVersion(
        g,
        {
          guion,
          escenas: escenasDe(p.formato, p.datos),
          origen: correccion ? "manual" : origen,
          queCambio: correccion ? "Corrección del cliente aplicada a mano." : "",
          correccionId: correccion?.id,
          correccion: correccion?.texto,
        },
        a.profile,
        ahora,
      );
      if ("error" in v) return v;
      if (correccion) resolverCorreccion(g, correccion.id, v.n);
    }
    return guardar(admin, g);
  });
}

// ----------------------------------------- correcciones del cliente ----

/**
 * Con el modelo de video conectado, «regenerar con corrección» termina aquí:
 * la versión nueva del guion se manda a `generarVideo()` y su `videoUrl` se
 * guarda en esa versión. Hoy `VIDEO_IA_ACTIVO` es false y no hace nada.
 */
async function regenerarVideoSiActivo(g: GuionGuardado, formato: FormatoVideo): Promise<string | undefined> {
  if (!VIDEO_IA_ACTIVO) return undefined;
  const version = versionVigente(g);
  if (!version) return undefined;
  const r = await generarVideo({ guionId: g.id, version, formato: formato.slug, relacionAspecto: formato.relacion_aspecto });
  if (!r.listo) return `El guion quedó corregido, pero el video no se regeneró: ${r.motivo}`;
  g.versiones = g.versiones.map((v) => (v.n === version.n ? { ...v, videoUrl: r.videoUrl } : v));
  return undefined;
}

/** Pide a la IA el guion corregido. Si falla, la corrección queda pendiente y devuelve el motivo. */
async function aplicarConIA(
  g: GuionGuardado,
  formato: FormatoVideo,
  correccion: Correccion,
  profile: Profile,
): Promise<string | undefined> {
  const datos = leerDatosVideo(g);
  const r = await corregirGuionVideo(datos, formato, g.guion, correccion.texto);
  if ("error" in r) {
    return `${r.error} La corrección quedó guardada como pendiente: edita el guion a mano y márcala como aplicada.`;
  }
  const v = agregarVersion(
    g,
    {
      guion: r.texto.slice(0, MAX_GUION),
      escenas: escenasDe(formato, datos),
      origen: "ia",
      queCambio: r.queCambio,
      correccionId: correccion.id,
      correccion: correccion.texto,
    },
    profile,
    new Date().toISOString(),
  );
  if ("error" in v) return `${v.error} La corrección quedó pendiente.`;
  resolverCorreccion(g, correccion.id, v.n);
  return regenerarVideoSiActivo(g, formato);
}

/**
 * Registra lo que pidió el cliente (texto tal cual, quién lo registró y
 * cuándo). Con `regenerar`, la IA devuelve el guion corregido como versión
 * nueva; si la IA no está o falla, la corrección queda pendiente.
 */
export async function registrarCorreccion(id: string, texto: string, regenerar: boolean): Promise<ConGuion> {
  return seguro(async () => {
    const x = await abrir(id);
    if ("error" in x) return x;
    const limpio = String(texto ?? "").trim().slice(0, MAX_CORRECCION);
    if (!limpio) return { error: "Pega la corrección que mandó el cliente." };
    if (x.g.correcciones.length >= 60) return { error: "Este guion ya tiene demasiadas correcciones: guárdalo como nuevo." };

    const ahora = new Date().toISOString();
    const correccion: Correccion = {
      id: randomUUID(),
      texto: limpio,
      registradaPor: x.profile.name,
      registradaPorId: x.profile.id,
      fecha: ahora,
      estado: "pendiente",
      version: null,
    };
    x.g.correcciones = [...x.g.correcciones, correccion];
    x.g.estado = "correccion_pendiente";
    x.g.actualizadoAt = ahora;
    const aviso = regenerar ? await aplicarConIA(x.g, x.formato, correccion, x.profile) : undefined;
    return guardar(x.admin, x.g, aviso);
  });
}

/** Reintenta con IA una corrección que quedó pendiente. */
export async function regenerarConCorreccion(id: string, correccionId: string): Promise<ConGuion> {
  return seguro(async () => {
    const x = await abrir(id);
    if ("error" in x) return x;
    const correccion = x.g.correcciones.find((c) => c.id === correccionId && c.estado === "pendiente");
    if (!correccion) return { error: "Esa corrección ya no está pendiente." };
    const antes = x.g.versiones.length;
    const aviso = await aplicarConIA(x.g, x.formato, correccion, x.profile);
    // Si la IA falló no cambió nada: no hace falta reescribir el archivo.
    if (x.g.versiones.length === antes) return { guardado: x.g, aviso };
    return guardar(x.admin, x.g, aviso);
  });
}

// ------------------------------------------------ estado y versiones ----

export async function cambiarEstadoGuion(id: string, estado: EstadoGuion): Promise<ConGuion> {
  return seguro(async () => {
    const x = await abrir(id);
    if ("error" in x) return x;
    if (!(ESTADOS_GUION as readonly string[]).includes(estado)) return { error: "Estado inválido." };
    x.g.estado = estado;
    x.g.actualizadoAt = new Date().toISOString();
    return guardar(x.admin, x.g);
  });
}

/** Restaurar NO borra nada: copia la versión elegida como una versión nueva al final. */
export async function restaurarVersion(id: string, n: number): Promise<ConGuion> {
  return seguro(async () => {
    const x = await abrir(id);
    if ("error" in x) return x;
    const origen = x.g.versiones.find((v) => v.n === n);
    if (!origen) return { error: "Esa versión no existe." };
    if (versionVigente(x.g)?.n === n) return { error: "Esa ya es la versión vigente." };
    const v = agregarVersion(
      x.g,
      {
        guion: origen.guion,
        escenas: origen.escenas.length ? origen.escenas : escenasDe(x.formato, leerDatosVideo(x.g)),
        origen: origen.origen,
        queCambio: `Se restauró la versión ${n}.`,
        restauradaDe: n,
      },
      x.profile,
      new Date().toISOString(),
    );
    if ("error" in v) return v;
    return guardar(x.admin, x.g);
  });
}

// -------------------------------------------------- generar video ----

/**
 * Genera el video de la versión VIGENTE de un guion guardado y guarda su URL
 * en esa versión. Hoy siempre responde que no está conectado: ver
 * `generarVideo()` en lib/videos-server.ts.
 */
export async function solicitarVideo(id: string): Promise<ConGuion> {
  return seguro(async () => {
    const x = await abrir(id);
    if ("error" in x) return x;
    const version = versionVigente(x.g);
    if (!version) return { error: "Este guion no tiene versiones." };
    const r = await generarVideo({
      guionId: x.g.id,
      version,
      formato: x.formato.slug,
      relacionAspecto: x.formato.relacion_aspecto,
    });
    if (!r.listo) return { error: r.motivo };
    x.g.versiones = x.g.versiones.map((v) => (v.n === version.n ? { ...v, videoUrl: r.videoUrl } : v));
    x.g.actualizadoAt = new Date().toISOString();
    return guardar(x.admin, x.g);
  });
}
