"use server";

import { randomBytes, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireProfile, INGRESOS_ROLES, type Profile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FORMATOS_VERSION, buscarFormato, type FormatoVideo } from "@/lib/video-formatos";
import {
  ESTADOS_GUION,
  MAX_CORRECCION,
  MAX_GUION,
  MAX_VERSIONES,
  VIDEOS_ROLES,
  leerDatosVideo,
  videoAprobado,
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
  corregirGuionVideo,
  escribirGuionArchivo,
  generarGuionVideo,
  investigarMercado,
  leerGuionArchivo,
} from "@/lib/videos-server";
import { ORIGEN_PROSPECCION, leerProspeccion } from "@/lib/prospeccion";
import { guardarProspeccion, leerFila } from "@/lib/prospeccion-server";
import {
  BUCKET_VIDEOS_GENERADOS,
  CARPETA_FOTOS_PRODUCTO,
  ID_TRABAJO,
  MAX_FOTO_PRODUCTO_BYTES,
  TIPOS_FOTO_PRODUCTO,
  trabajoActivo,
  vistaTrabajo,
  type TrabajoVista,
} from "@/lib/trabajos-video";
import {
  buscarTrabajo,
  cancelarTrabajo,
  crearTrabajoVideo,
  listarTrabajos,
  servidorVideoActivo,
  topeDeHoy,
  type PedidoVideo,
  type TopeDiario,
} from "@/lib/trabajos-video-server";

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
    videoTrabajoId: null,
    videoAprobado: null,
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
    let aviso: string | undefined;
    if (cambio) {
      const anterior = versionVigente(previo);
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
      if (correccion) {
        resolverCorreccion(g, correccion.id, v.n);
        // Corrección del cliente aplicada a mano: su video se encola igual que con IA.
        aviso = await encolarVideoDeCorreccion(admin, g, anterior, v, a.profile);
      }
    }
    return guardar(admin, g, aviso);
  });
}

// ----------------------------------------- correcciones del cliente ----

/**
 * «Regenerar con corrección» termina aquí: si la versión anterior ya tenía
 * video (o uno en proceso), se encola el de la versión nueva con las mismas
 * fotos y opciones. Si nunca se pidió video para este guion no se encola
 * nada: el video se pide a mano en el paso 07.
 */
async function encolarVideoDeCorreccion(
  admin: Almacen,
  g: GuionGuardado,
  anterior: VersionGuion | null,
  nueva: VersionGuion,
  profile: Profile,
): Promise<string | undefined> {
  if (!servidorVideoActivo() || !anterior || (!anterior.videoUrl && !anterior.videoTrabajoId)) return undefined;
  const previo = anterior.videoTrabajoId ? await buscarTrabajo(anterior.videoTrabajoId) : null;
  const pedido: PedidoVideo | undefined = previo
    ? { imagenesProducto: previo.trabajo.imagenesProducto, ...previo.trabajo.opciones }
    : undefined;
  const r = await crearTrabajoVideo(admin, g, nueva, { id: profile.id, nombre: profile.name }, pedido, "correccion");
  if ("error" in r) return `El guion quedó corregido (v${nueva.n}), pero su video no se encoló: ${r.error}`;
  g.versiones = g.versiones.map((v) => (v.n === nueva.n ? { ...v, videoTrabajoId: r.trabajo.id } : v));
  return undefined;
}

/** Pide a la IA el guion corregido. Si falla, la corrección queda pendiente y devuelve el motivo. */
async function aplicarConIA(
  admin: Almacen,
  g: GuionGuardado,
  formato: FormatoVideo,
  correccion: Correccion,
  profile: Profile,
): Promise<string | undefined> {
  const datos = leerDatosVideo(g);
  const anterior = versionVigente(g);
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
  return encolarVideoDeCorreccion(admin, g, anterior, v, profile);
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
    const aviso = regenerar ? await aplicarConIA(x.admin, x.g, x.formato, correccion, x.profile) : undefined;
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
    const aviso = await aplicarConIA(x.admin, x.g, x.formato, correccion, x.profile);
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
//
// El video lo genera un servidor externo: aquí solo se deja el trabajo en la
// cola y se consulta cómo va. Regla del dueño: nada generado sale sin un sí
// explícito. Por eso el video entra «Por aprobar» y solo después de
// `aprobarVideo` se puede copiar su enlace o pasarlo al prospecto (se valida
// aquí, en el servidor, no solo en la pantalla).

/** Quién puede dar el sí a un video generado: el equipo comercial (no quien edita). */
const APROBAR_VIDEO_ROLES = INGRESOS_ROLES;

export type EstadoVideos = { guardado: GuionGuardado; trabajos: TrabajoVista[]; tope: TopeDiario };

/** El último trabajo de cada versión que tenga uno. */
async function trabajosDe(g: GuionGuardado): Promise<TrabajoVista[]> {
  const ids = [...new Set(g.versiones.map((v) => v.videoTrabajoId).filter((x): x is string => !!x && ID_TRABAJO.test(x)))].slice(-8);
  const leidos = await Promise.all(ids.map((id) => buscarTrabajo(id)));
  return leidos.filter((x): x is NonNullable<typeof x> => !!x).map((x) => vistaTrabajo(x.trabajo));
}

/** Encola el video de la versión VIGENTE del guion guardado. */
export async function solicitarVideo(id: string, pedido?: PedidoVideo): Promise<EstadoVideos | { error: string }> {
  return seguro(async () => {
    const x = await abrir(id);
    if ("error" in x) return x;
    const version = versionVigente(x.g);
    if (!version) return { error: "Este guion no tiene versiones." };
    const r = await crearTrabajoVideo(x.admin, x.g, version, { id: x.profile.id, nombre: x.profile.name }, pedido, "manual");
    if ("error" in r) return r;
    // Regenerar: el video anterior de esta versión deja de contar hasta que llegue el nuevo.
    x.g.versiones = x.g.versiones.map((v) =>
      v.n === version.n ? { ...v, videoTrabajoId: r.trabajo.id, videoUrl: null, videoAprobado: null } : v,
    );
    x.g.actualizadoAt = new Date().toISOString();
    const w = await guardar(x.admin, x.g);
    if ("error" in w) return w;
    return { guardado: x.g, trabajos: await trabajosDe(x.g), tope: await topeDeHoy(x.admin) };
  });
}

/** Cómo van los videos de un guion. La pantalla la llama cada pocos segundos mientras haya uno en proceso. */
export async function consultarVideos(id: string): Promise<EstadoVideos | { error: string }> {
  return seguro(async () => {
    const x = await abrir(id);
    if ("error" in x) return x;
    return { guardado: x.g, trabajos: await trabajosDe(x.g), tope: await topeDeHoy(x.admin) };
  });
}

export async function cancelarVideo(id: string, trabajoId: string): Promise<EstadoVideos | { error: string }> {
  return seguro(async () => {
    const x = await abrir(id);
    if ("error" in x) return x;
    if (!x.g.versiones.some((v) => v.videoTrabajoId === trabajoId)) return { error: "Ese video no es de este guion." };
    const r = await cancelarTrabajo(x.admin, trabajoId, x.profile.name);
    if ("error" in r) return r;
    return { guardado: x.g, trabajos: await trabajosDe(x.g), tope: await topeDeHoy(x.admin) };
  });
}

/** El sí explícito: sin esto el video no sale del CRM. */
export async function aprobarVideo(id: string, n: number): Promise<ConGuion> {
  return seguro(async () => {
    const x = await abrir(id);
    if ("error" in x) return x;
    if (!APROBAR_VIDEO_ROLES.includes(x.profile.role)) {
      return { error: "Solo el equipo comercial (CEO, gerente comercial o directora operativa) puede aprobar un video." };
    }
    const v = x.g.versiones.find((y) => y.n === n);
    if (!v?.videoUrl) return { error: "Esa versión todavía no tiene video." };
    if (v.videoTrabajoId) {
      const t = await buscarTrabajo(v.videoTrabajoId);
      if (t && trabajoActivo(t.trabajo.estado)) return { error: "Se está generando un video nuevo para esa versión: espera a que termine." };
    }
    if (v.videoAprobado) return { guardado: x.g };
    const ahora = new Date().toISOString();
    x.g.versiones = x.g.versiones.map((y) =>
      y.n === n ? { ...y, videoAprobado: { porId: x.profile.id, por: x.profile.name, fecha: ahora } } : y,
    );
    x.g.actualizadoAt = ahora;
    return guardar(x.admin, x.g);
  });
}

/** Pasa el video YA APROBADO de una versión a la ficha del prospecto del guion. */
export async function usarVideoEnProspecto(id: string, n: number): Promise<{ ok: true } | { error: string }> {
  return seguro(async () => {
    const x = await abrir(id);
    if ("error" in x) return x;
    if (!INGRESOS_ROLES.includes(x.profile.role)) return { error: "Solo el equipo comercial puede pasar un video al prospecto." };
    const v = x.g.versiones.find((y) => y.n === n);
    if (!v?.videoUrl) return { error: "Esa versión no tiene video." };
    if (!videoAprobado(v)) return { error: "Ese video está por aprobar: apruébalo antes de usarlo en el prospecto." };
    if (!x.g.prospectoId) return { error: "Este guion no está ligado a ningún prospecto." };
    const fila = await leerFila(x.admin, x.g.prospectoId);
    const pros = fila ? leerProspeccion(fila.respuestas_calificacion) : null;
    if (!fila || !pros || fila.origen !== ORIGEN_PROSPECCION) return { error: "No se encontró el prospecto de este guion." };
    const r = await guardarProspeccion(
      x.admin,
      x.g.prospectoId,
      { video_url: v.videoUrl, video_nombre: `Video generado · v${v.n}`, video_path: null, video_terminado_at: null },
      { evento: { quien: x.profile.name, accion: `Usó el video generado (v${v.n}), aprobado por ${v.videoAprobado?.por ?? "—"}` } },
    );
    if (r.error) return { error: r.error };
    revalidatePath("/prospectos");
    revalidatePath(`/prospectos/${x.g.prospectoId}`);
    return { ok: true as const };
  });
}

/** «Cola de videos»: todos los trabajos recientes, solo para el CEO. */
export async function colaVideos(): Promise<{ trabajos: TrabajoVista[]; tope: TopeDiario; aviso?: string } | { error: string }> {
  return seguro(async () => {
    const profile = await requireProfile();
    if (profile.role !== "ceo") return { error: "No tienes permiso para ver la cola de videos." };
    const admin = createAdminClient();
    const r = await listarTrabajos(admin);
    return { trabajos: r.trabajos.map(vistaTrabajo), tope: await topeDeHoy(admin), aviso: r.error };
  });
}

// ------------------------------------------------ fotos del producto ----
//
// Fotos pegadas (Ctrl+V) o arrastradas en «Crear video». Van al bucket de los
// videos generados (público, como ellos) con un nombre al azar imposible de
// adivinar, porque el servidor de videos las descarga por https sin sesión.
// Subida en dos pasos: el CRM firma la subida y el navegador manda el archivo
// directo a Storage (una acción del servidor no aguanta archivos grandes).

const NOMBRE_FOTO = /^\d{13}-[0-9a-f]{16}\.(png|jpg|webp)$/;

/** Paso 1: valida la foto y devuelve dónde subirla. */
export async function prepararFotoProducto(archivo: { tipo: string; tamano: number }): Promise<{ path: string; token: string } | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    const ext = TIPOS_FOTO_PRODUCTO[String(archivo?.tipo ?? "")];
    if (!ext) return { error: "La foto debe ser PNG, JPG o WebP." };
    const tamano = Number(archivo?.tamano ?? 0);
    if (!tamano || tamano > MAX_FOTO_PRODUCTO_BYTES) {
      return { error: `La foto pesa ${(tamano / 1024 / 1024).toFixed(1)} MB y el máximo es ${MAX_FOTO_PRODUCTO_BYTES / 1024 / 1024} MB.` };
    }
    const path = `${CARPETA_FOTOS_PRODUCTO}/${x.profile.id}/${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
    const { data, error } = await createAdminClient().storage.from(BUCKET_VIDEOS_GENERADOS).createSignedUploadUrl(path);
    if (error || !data) return { error: `No se pudo preparar la subida: ${error?.message ?? "sin respuesta"}` };
    return { path: data.path, token: data.token };
  });
}

/** Paso 2: confirma que la foto quedó en Storage y devuelve su enlace https. */
export async function confirmarFotoProducto(path: string): Promise<{ url: string } | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    const ruta = String(path ?? "");
    const carpeta = `${CARPETA_FOTOS_PRODUCTO}/${x.profile.id}`;
    const base = ruta.startsWith(`${carpeta}/`) ? ruta.slice(carpeta.length + 1) : "";
    if (!NOMBRE_FOTO.test(base)) return { error: "Foto inválida." };
    const almacen = createAdminClient().storage.from(BUCKET_VIDEOS_GENERADOS);
    const { data: lista, error } = await almacen.list(carpeta, { search: base });
    if (error || !lista?.some((o) => o.name === base)) return { error: "La subida no terminó. Intenta de nuevo." };
    return { url: almacen.getPublicUrl(ruta).data.publicUrl };
  });
}
