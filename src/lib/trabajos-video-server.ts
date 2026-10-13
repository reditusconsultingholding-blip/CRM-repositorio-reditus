import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { buscarFormato, type FormatoVideo } from "@/lib/video-formatos";
import { duracionTotal, type EscenaProyecto, type ProyectoVideo, type TipoPieza } from "@/lib/proyecto-video";
import { corchetes, escenasParaVideo, pasosDelGuion } from "@/lib/trabajos-video";
import {
  BUCKET_TRABAJOS,
  BUCKET_VIDEOS_GENERADOS,
  CARPETA_VIDEOS_GENERADOS,
  ESPERA_REINTENTO_MS,
  ETAPA_LABELS,
  EXT_IMAGEN,
  MAX_REPORTES,
  escenasSinReportar,
  type EtapaTrabajo,
  ID_TRABAJO,
  MAX_IMAGENES_PRODUCTO,
  MAX_INTENTOS_VIDEO,
  TOPE_DIARIO_VIDEOS,
  VENCIMIENTO_TOMA_MS,
  leerTrabajo,
  selloBogota,
  trabajoActivo,
  type EstadoTrabajo,
  type OpcionesVideo,
  type ProgresoTrabajo,
  type TrabajoVideo,
} from "@/lib/trabajos-video";
import { enlaceSeguro, type GuionGuardado, type VersionGuion } from "@/lib/videos";
import { escribirGuionArchivo, leerGuionArchivo } from "@/lib/videos-server";

// Cola de videos en Supabase Storage (bucket privado `trabajos`). La usan dos
// lados: las acciones de `/videos` (crear, consultar, cancelar) y la API del
// servidor externo (`/api/servidor/trabajos/**`: tomar, progreso, resultado,
// fallo). Todo pasa por el cliente de servicio DESPUÉS de validar a quien
// llama (rol o secreto). Nada aquí lanza errores esperados.
//
// Bloqueo: «tomar» MUEVE el archivo de `pendientes/` a `en-curso/`. Mover es
// una sola operación en Storage: si dos trabajadores lo intentan a la vez,
// solo a uno le funciona y el otro sigue con el siguiente trabajo.

type Admin = ReturnType<typeof createAdminClient>;

// Carpeta raíz de la cola dentro del bucket. En producción es siempre «videos». Solo las pruebas la
// cambian (COLA_VIDEOS_CARPETA) para que un trabajo de prueba jamás lo tome el servidor real.
const RAIZ_COLA = /^[a-z0-9-]{1,40}$/.test(process.env.COLA_VIDEOS_CARPETA ?? "") ? (process.env.COLA_VIDEOS_CARPETA as string) : "videos";
const CARPETAS = { pendientes: `${RAIZ_COLA}/pendientes`, enCurso: `${RAIZ_COLA}/en-curso`, listos: `${RAIZ_COLA}/listos`, fallos: `${RAIZ_COLA}/fallos` } as const;
type Carpeta = (typeof CARPETAS)[keyof typeof CARPETAS];
const ORDEN_BUSQUEDA: Carpeta[] = [CARPETAS.enCurso, CARPETAS.pendientes, CARPETAS.listos, CARPETAS.fallos];
const ruta = (carpeta: Carpeta, id: string) => `${carpeta}/${id}.json`;

/** Aviso a una persona (campana y push). Mejor esfuerzo; `AVISOS_VIDEO_APAGADOS=1` lo apaga (pruebas). */
async function avisar(admin: Admin, userId: string, titulo: string, enlace: string) {
  if (!userId || process.env.AVISOS_VIDEO_APAGADOS === "1") return;
  try {
    await notify(admin, userId, "terminado", titulo.slice(0, 240), enlace);
  } catch {
    /* el aviso es mejor esfuerzo */
  }
}

/** El paso «Generar video» existe solo si el servidor externo tiene con qué autenticarse. */
export function servidorVideoActivo(): boolean {
  return !!process.env.SERVIDOR_SECRET?.trim();
}

let bucketListo = false;

/** Crea el bucket privado la primera vez (crear un bucket no es SQL). */
export async function asegurarBucketTrabajos(admin: Admin): Promise<{ error?: string }> {
  if (bucketListo) return {};
  const { data } = await admin.storage.getBucket(BUCKET_TRABAJOS);
  if (data) {
    if (data.public) return { error: "El bucket «trabajos» quedó público. Debe ser privado: corrígelo en Supabase → Storage." };
    bucketListo = true;
    return {};
  }
  const { error } = await admin.storage.createBucket(BUCKET_TRABAJOS, { public: false });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    return { error: `No se pudo preparar la cola de videos: ${error.message}` };
  }
  bucketListo = true;
  return {};
}

// Lectura directa y sin caché (ver la nota de `leerGuionArchivo`): una copia
// vieja de un trabajo haría retroceder su estado.
async function leerJson(rutaArchivo: string): Promise<{ dato: unknown | null; error?: string }> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !llave) return { dato: null, error: "Falta la configuración de Supabase." };
  const url = `${base}/storage/v1/object/${BUCKET_TRABAJOS}/${rutaArchivo}?sinCache=${Date.now()}${randomBytes(3).toString("hex")}`;
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${llave}`, apikey: llave }, cache: "no-store" });
    const cuerpo = await res.text();
    if (!res.ok) {
      const noExiste = res.status === 404 || (res.status === 400 && /not.?found|"404"/i.test(cuerpo));
      return noExiste ? { dato: null } : { dato: null, error: `el almacenamiento respondió ${res.status}` };
    }
    return { dato: JSON.parse(cuerpo) };
  } catch (e) {
    return { dato: null, error: e instanceof Error ? e.message : "sin respuesta del almacenamiento" };
  }
}

async function escribir(admin: Admin, carpeta: Carpeta, t: TrabajoVideo, nuevo = false): Promise<{ error?: string }> {
  const { error } = await admin.storage
    .from(BUCKET_TRABAJOS)
    .upload(ruta(carpeta, t.id), JSON.stringify(t, null, 1), { contentType: "application/json", upsert: !nuevo, cacheControl: "0" });
  return error ? { error: `No se pudo guardar el trabajo: ${error.message}` } : {};
}

async function mover(admin: Admin, id: string, de: Carpeta, a: Carpeta): Promise<boolean> {
  const { error } = await admin.storage.from(BUCKET_TRABAJOS).move(ruta(de, id), ruta(a, id));
  return !error;
}

async function nombres(admin: Admin, carpeta: Carpeta, opciones: { busca?: string; limite?: number; orden?: "asc" | "desc" } = {}) {
  const { data, error } = await admin.storage.from(BUCKET_TRABAJOS).list(carpeta, {
    limit: opciones.limite ?? 200,
    search: opciones.busca,
    sortBy: { column: "name", order: opciones.orden ?? "asc" },
  });
  if (error) return { ids: [] as string[], error: error.message };
  const ids = (data ?? [])
    .map((f) => f.name)
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.slice(0, -5))
    .filter((id) => ID_TRABAJO.test(id));
  return { ids };
}

async function leerEn(carpeta: Carpeta, id: string): Promise<TrabajoVideo | null> {
  const r = await leerJson(ruta(carpeta, id));
  return r.dato ? leerTrabajo(r.dato) : null;
}

/** Busca un trabajo en las cuatro carpetas. Mientras se mueve puede no estar en ninguna un instante. */
export async function buscarTrabajo(id: string): Promise<{ trabajo: TrabajoVideo; carpeta: Carpeta } | null> {
  if (!ID_TRABAJO.test(id)) return null;
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    for (const carpeta of ORDEN_BUSQUEDA) {
      const t = await leerEn(carpeta, id);
      if (t) return { trabajo: t, carpeta };
    }
  }
  return null;
}

function anotar(t: TrabajoVideo, estado: EstadoTrabajo, nota: string, ahora: string) {
  t.estado = estado;
  t.historial = [...t.historial, { fecha: ahora, estado, nota: nota.slice(0, 400) }].slice(-40);
}

// Una sola operación de cola a la vez dentro del mismo proceso; entre
// procesos distintos manda el «mover» de Storage.
let turno: Promise<unknown> = Promise.resolve();
function enFila<T>(fn: () => Promise<T>): Promise<T> {
  const mio = turno.then(fn, fn);
  turno = mio.catch(() => {});
  return mio;
}

// ------------------------------------------------------------ tope diario ----

export type TopeDiario = { usados: number; max: number };

// Qué cuenta cada trabajo para el tope diario. La etapa y el guion de un
// trabajo no cambian nunca, así que se recuerda (por proceso) para no releerlo.
//   · video completo de los de antes → cuenta 1;
//   · etapa `clips` → cuenta 1 por PROYECTO y día (regenerar un clip no gasta otro cupo:
//     para eso está el tope de intentos por escena);
//   · etapas `imagenes` y `armado` → no cuentan.
const claveTope = new Map<string, string | null>();

async function claveDeTope(carpeta: Carpeta, id: string): Promise<string | null> {
  const k = carpeta === CARPETAS.fallos ? `f:${id}` : id;
  const sabida = claveTope.get(k);
  if (sabida !== undefined) return sabida;
  const t = await leerEn(carpeta, id);
  if (!t) return `v:${id}`; // se está moviendo: cuenta como siempre y no se recuerda
  let clave: string | null;
  if (t.etapa === "imagenes" || t.etapa === "armado") clave = null;
  // Un trabajo que falló sin gastar no cuenta.
  else if (carpeta === CARPETAS.fallos && t.segundosGenerados <= 0 && !t.reportes.length) clave = null;
  else clave = t.etapa === "clips" ? `p:${t.guionId}` : `v:${id}`;
  if (claveTope.size > 2000) claveTope.clear();
  claveTope.set(k, clave);
  return clave;
}

async function clavesDeHoy(admin: Admin): Promise<Set<string>> {
  const { dia } = selloBogota(new Date());
  const carpetas = [CARPETAS.pendientes, CARPETAS.enCurso, CARPETAS.listos, CARPETAS.fallos];
  const listas = await Promise.all(carpetas.map((x) => nombres(admin, x, { busca: `${dia}-` })));
  const pares = listas.flatMap((l, i) => l.ids.filter((id) => id.startsWith(`${dia}-`)).map((id) => ({ carpeta: carpetas[i], id })));
  const claves = await Promise.all(pares.map((x) => claveDeTope(x.carpeta, x.id)));
  return new Set(claves.filter((c): c is string => !!c));
}

/** Videos pedidos hoy (hora de Bogotá). Imágenes base y armados no cuentan; un proyecto cuenta una vez. */
export async function topeDeHoy(admin: Admin): Promise<TopeDiario> {
  return { usados: (await clavesDeHoy(admin)).size, max: TOPE_DIARIO_VIDEOS };
}

// ------------------------------------------------------------------ crear ----

export type PedidoVideo = {
  imagenesProducto?: unknown;
  subtitulos?: unknown;
  voz?: unknown;
  modelo?: unknown;
};

function leerPedido(p: PedidoVideo | undefined): { imagenes: string[]; opciones: OpcionesVideo; error?: string } {
  const crudas = Array.isArray(p?.imagenesProducto) ? p.imagenesProducto : [];
  const imagenes: string[] = [];
  for (const c of crudas.slice(0, MAX_IMAGENES_PRODUCTO + 4)) {
    if (typeof c !== "string" || !c.trim()) continue;
    const u = enlaceSeguro(c);
    if (!u || !u.startsWith("https://")) {
      return { imagenes: [], opciones: { subtitulos: true, voz: true, musica: null, modelo: null }, error: `Esta foto del producto no es un enlace https válido: ${c.slice(0, 80)}` };
    }
    imagenes.push(u.slice(0, 600));
  }
  const modelo = typeof p?.modelo === "string" ? p.modelo.trim().slice(0, 160) : "";
  if (modelo && !/^[\w.\-/]+$/.test(modelo)) {
    return { imagenes: [], opciones: { subtitulos: true, voz: true, musica: null, modelo: null }, error: "El modelo solo puede llevar letras, números, puntos, guiones y barras." };
  }
  return {
    imagenes: imagenes.slice(0, MAX_IMAGENES_PRODUCTO),
    opciones: { subtitulos: p?.subtitulos !== false, voz: p?.voz !== false, musica: null, modelo: modelo || null },
  };
}

/**
 * Encola el video de UNA versión del guion. No escribe el guion: devuelve el
 * trabajo y quien llama liga su id a la versión (`videoTrabajoId`) y guarda.
 */
export async function crearTrabajoVideo(
  admin: Admin,
  g: GuionGuardado,
  version: VersionGuion,
  quien: { id: string; nombre: string },
  pedido: PedidoVideo | undefined,
  origen: "manual" | "correccion",
): Promise<{ trabajo: TrabajoVideo } | { error: string }> {
  if (!servidorVideoActivo()) return { error: "La generación de video no está conectada: falta SERVIDOR_SECRET." };
  const formato = buscarFormato(g.formato);
  if (!formato) return { error: "El formato de este guion ya no existe en la biblioteca." };
  const b = await asegurarBucketTrabajos(admin);
  if (b.error) return { error: b.error };

  if (version.videoTrabajoId) {
    const previo = await buscarTrabajo(version.videoTrabajoId);
    if (previo && trabajoActivo(previo.trabajo.estado)) {
      return { error: `La versión ${version.n} ya tiene un video en proceso. Espera a que termine o cancélalo.` };
    }
  }

  const p = leerPedido(pedido);
  if (p.error) return { error: p.error };

  // Lo que se dice en el video sale del guion. Si quedó un dato entre
  // corchetes en una frase hablada, se detiene aquí: no se inventa ni se
  // gasta en un video que diría «[precio]».
  const pasos = pasosDelGuion(version.guion);
  const faltan = corchetes(pasos.map((x) => x.voz).join(" "));
  if (faltan.length && (p.opciones.voz || p.opciones.subtitulos)) {
    return {
      error: `El guion todavía tiene datos por completar en lo que se dice: ${faltan.slice(0, 4).join(", ")}${faltan.length > 4 ? "…" : ""}. Complétalos con el cliente y guarda antes de generar el video (o desactiva voz y subtítulos).`,
    };
  }

  const fuente = version.escenas.length ? version.escenas : formato.prompts;
  const { escenas, avisos } = escenasParaVideo({
    guion: version.guion,
    escenas: fuente,
    estructura: formato.estructura,
    hayImagenes: p.imagenes.length > 0,
  });
  if (!escenas.length) return { error: avisos[0] ?? "No se pudieron armar las escenas de este guion." };

  const tope = await topeDeHoy(admin);
  if (tope.usados >= tope.max) {
    return {
      error: `Hoy ya se pidieron ${tope.usados} de ${tope.max} videos, que es el tope diario. Mañana se libera; si hace falta subirlo, lo cambia el CEO (TOPE_DIARIO_VIDEOS).`,
    };
  }

  const ahora = new Date();
  const sello = selloBogota(ahora);
  const iso = ahora.toISOString();
  const trabajo: TrabajoVideo = {
    id: `${sello.dia}-${sello.hora}-${randomBytes(6).toString("hex")}`,
    tipo: "video",
    guionId: g.id,
    version: version.n,
    formato: formato.slug,
    formatoNombre: formato.nombre,
    producto: g.producto,
    cliente: g.cliente,
    pais: g.pais,
    relacionAspecto: formato.relacion_aspecto || "9:16",
    duracionObjetivo: escenas.reduce((s, e) => s + e.duracion, 0),
    escenas,
    imagenesProducto: p.imagenes,
    opciones: p.opciones,
    pedidoPor: quien,
    origen,
    cierre: { oferta: g.oferta, llamadoALaAccion: g.llamado },
    avisos,
    etapa: null,
    contexto: null,
    escenasEtapa: [],
    todas: [],
    reportes: [],
    creditos: 0,
    estado: "pendiente",
    motivo: "",
    intentos: 0,
    maxIntentos: MAX_INTENTOS_VIDEO,
    creadoAt: iso,
    tomadoAt: null,
    latidoAt: null,
    terminadoAt: null,
    noAntesDe: null,
    toma: null,
    trabajador: null,
    progreso: null,
    segundosGenerados: 0,
    costoEstimadoUsd: null,
    resultado: null,
    historial: [{ fecha: iso, estado: "pendiente", nota: `Pedido por ${quien.nombre}${origen === "correccion" ? " (corrección del cliente)" : ""}` }],
  };
  const w = await escribir(admin, CARPETAS.pendientes, trabajo, true);
  if (w.error) return { error: w.error };
  return { trabajo };
}

// ------------------------------------------ proyecto por escenas: etapas ----

export type PedidoEtapa = {
  g: GuionGuardado;
  /** Número de la versión del guion dueña del proyecto. */
  version: number;
  formato: FormatoVideo;
  proyecto: ProyectoVideo;
  etapa: EtapaTrabajo;
  /** SOLO las escenas que hay que procesar (imágenes o clips). En `armado` se ignora. */
  escenas: EscenaProyecto[];
  quien: { id: string; nombre: string };
};

const conNota = (prompt: string, nota: string) => (nota.trim() ? `${prompt.trim()}\n\nCORRECCIÓN PEDIDA POR QUIEN REVISÓ EL INTENTO ANTERIOR: ${nota.trim()}` : prompt);

/**
 * Encola UNA etapa del proyecto (`imagenes`, `clips` o `armado`) para un
 * subconjunto de escenas. No escribe el guion: quien llama marca las piezas
 * `en-cola` con el id del trabajo y guarda. Las reglas de qué se puede pedir
 * (imagen aprobada antes del clip, tope de intentos) las aplica quien llama;
 * aquí se vuelven a comprobar las que cuestan dinero.
 */
export async function crearTrabajoEtapa(admin: Admin, p: PedidoEtapa): Promise<{ trabajo: TrabajoVideo } | { error: string }> {
  if (!servidorVideoActivo()) return { error: "La generación no está conectada: falta SERVIDOR_SECRET. El plan queda guardado y se podrá generar cuando el servidor de videos esté conectado." };
  const b = await asegurarBucketTrabajos(admin);
  if (b.error) return { error: b.error };
  const { proyecto, etapa } = p;
  let escenas = p.escenas;
  if (etapa === "armado") escenas = [];
  else {
    if (!escenas.length) return { error: "No hay escenas para generar." };
    if (escenas.some((e) => e.tipo !== "generada")) return { error: "Las escenas de foto real y el cierre no se generan: se fabrican al armar, sin costo." };
    if (etapa === "clips") {
      const sinImagen = escenas.filter((e) => e.imagen.estado !== "aprobada" || !e.imagen.url);
      if (sinImagen.length) return { error: `No se genera ningún clip sin su imagen aprobada. Falta aprobar la imagen de la escena ${sinImagen.map((e) => e.n).join(", ")}.` };
      const claves = await clavesDeHoy(admin);
      if (!claves.has(`p:${p.g.id}`) && claves.size >= TOPE_DIARIO_VIDEOS) {
        return { error: `Hoy ya se pidieron ${claves.size} de ${TOPE_DIARIO_VIDEOS} videos, que es el tope diario. Mañana se libera; si hace falta subirlo, lo cambia el CEO (TOPE_DIARIO_VIDEOS).` };
      }
    }
  }
  const ahora = new Date();
  const sello = selloBogota(ahora);
  const iso = ahora.toISOString();
  // El trabajo lleva el número de ESTE intento (el que quien llama anota en el proyecto al encolar).
  const paraEtapa = escenas.map((e) =>
    etapa === "imagenes"
      ? { ...e, promptImagen: conNota(e.promptImagen, e.imagen.nota), imagen: { ...e.imagen, intentos: e.imagen.intentos + 1 } }
      : { ...e, promptVideo: conNota(e.promptVideo, e.clip.nota), clip: { ...e.clip, intentos: e.clip.intentos + 1 } },
  );
  const trabajo: TrabajoVideo = {
    id: `${sello.dia}-${sello.hora}-${randomBytes(6).toString("hex")}`,
    tipo: "video",
    guionId: p.g.id,
    version: p.version,
    formato: p.formato.slug,
    formatoNombre: p.formato.nombre,
    producto: p.g.producto,
    cliente: p.g.cliente,
    pais: p.g.pais,
    relacionAspecto: p.formato.relacion_aspecto || "9:16",
    duracionObjetivo: etapa === "armado" ? duracionTotal(proyecto) : escenas.reduce((x, e) => x + e.duracion, 0),
    escenas: [],
    imagenesProducto: proyecto.contexto.fotos.slice(0, MAX_IMAGENES_PRODUCTO),
    opciones: { ...proyecto.opciones },
    pedidoPor: p.quien,
    origen: "manual",
    cierre: { ...proyecto.contexto.cierre },
    avisos: [],
    etapa,
    contexto: proyecto.contexto,
    escenasEtapa: paraEtapa,
    todas: etapa === "armado" ? proyecto.escenas : [],
    reportes: [],
    creditos: 0,
    estado: "pendiente",
    motivo: "",
    intentos: 0,
    maxIntentos: MAX_INTENTOS_VIDEO,
    creadoAt: iso,
    tomadoAt: null,
    latidoAt: null,
    terminadoAt: null,
    noAntesDe: null,
    toma: null,
    trabajador: null,
    progreso: null,
    segundosGenerados: 0,
    costoEstimadoUsd: null,
    resultado: null,
    historial: [
      {
        fecha: iso,
        estado: "pendiente",
        nota: `${ETAPA_LABELS[etapa]}${etapa === "armado" ? "" : ` · ${escenas.length === 1 ? `escena ${escenas[0].n}` : `${escenas.length} escenas`}`} · pedido por ${p.quien.nombre}`,
      },
    ],
  };
  const w = await escribir(admin, CARPETAS.pendientes, trabajo, true);
  if (w.error) return { error: w.error };
  return { trabajo };
}

/** Varios trabajos por id, en paralelo (los que ya no existan se saltan). */
export async function leerTrabajos(ids: string[]): Promise<TrabajoVideo[]> {
  const leidos = await Promise.all([...new Set(ids)].filter((id) => ID_TRABAJO.test(id)).map((id) => buscarTrabajo(id)));
  return leidos.filter((x): x is NonNullable<typeof x> => !!x).map((x) => x.trabajo);
}

/** Cancela un trabajo que todavía nadie tomó. */
export async function cancelarTrabajo(admin: Admin, id: string, quien: string): Promise<{ trabajo: TrabajoVideo } | { error: string }> {
  return enFila(async () => {
    const t = await leerEn(CARPETAS.pendientes, id);
    if (!t) return { error: "Ese video ya no está en cola: el servidor lo tomó o ya terminó." };
    if (!(await mover(admin, id, CARPETAS.pendientes, CARPETAS.fallos))) {
      return { error: "El servidor acaba de tomar ese video: ya no se puede cancelar." };
    }
    const ahora = new Date().toISOString();
    t.motivo = `Cancelado por ${quien}.`;
    t.terminadoAt = ahora;
    t.noAntesDe = null;
    anotar(t, "fallo", t.motivo, ahora);
    await escribir(admin, CARPETAS.fallos, t);
    return { trabajo: t };
  });
}

/** Los trabajos más recientes de todas las carpetas (para «Cola de videos»). */
export async function listarTrabajos(admin: Admin, limite = 40): Promise<{ trabajos: TrabajoVideo[]; error?: string }> {
  const b = await asegurarBucketTrabajos(admin);
  if (b.error) return { trabajos: [], error: b.error };
  const porCarpeta = await Promise.all(
    ORDEN_BUSQUEDA.map(async (carpeta) => {
      const { ids, error } = await nombres(admin, carpeta, { limite, orden: "desc" });
      const leidos = await Promise.all(ids.map((id) => leerEn(carpeta, id)));
      return { trabajos: leidos.filter((t): t is TrabajoVideo => !!t), error };
    }),
  );
  const vistos = new Set<string>();
  const trabajos = porCarpeta
    .flatMap((x) => x.trabajos)
    .filter((t) => (vistos.has(t.id) ? false : (vistos.add(t.id), true)))
    .sort((a, b2) => b2.id.localeCompare(a.id))
    .slice(0, limite);
  const error = porCarpeta.find((x) => x.error)?.error;
  return { trabajos, error: error ? `No se pudo leer toda la cola: ${error}` : undefined };
}

// ------------------------------------------- lado del servidor externo ----

export type RespuestaServidor<T> = { ok: true; dato: T } | { ok: false; estado: number; error: string; soltar?: boolean };

const no = (estado: number, error: string, soltar = false): RespuestaServidor<never> => ({ ok: false, estado, error, soltar });

/** Devuelve a la cola (o manda a fallo) un trabajo en curso que no salió bien. */
async function soltar(admin: Admin, t: TrabajoVideo, motivo: string, definitivo: boolean): Promise<TrabajoVideo> {
  const ahora = new Date();
  const iso = ahora.toISOString();
  t.motivo = motivo.slice(0, 800);
  t.toma = null;
  t.progreso = null;
  if (definitivo || t.intentos >= t.maxIntentos) {
    t.terminadoAt = iso;
    t.noAntesDe = null;
    anotar(t, "fallo", `Intento ${t.intentos} de ${t.maxIntentos}: ${motivo}`, iso);
    await escribir(admin, CARPETAS.enCurso, t);
    if (await mover(admin, t.id, CARPETAS.enCurso, CARPETAS.fallos)) await avisarFallo(admin, t);
    return t;
  }
  const espera = ESPERA_REINTENTO_MS[Math.min(t.intentos, ESPERA_REINTENTO_MS.length) - 1] ?? ESPERA_REINTENTO_MS[ESPERA_REINTENTO_MS.length - 1];
  t.noAntesDe = new Date(ahora.getTime() + espera).toISOString();
  anotar(t, "pendiente", `Intento ${t.intentos} de ${t.maxIntentos} falló: ${motivo}. Se reintenta.`, iso);
  await escribir(admin, CARPETAS.enCurso, t);
  await mover(admin, t.id, CARPETAS.enCurso, CARPETAS.pendientes);
  return t;
}

async function avisarFallo(admin: Admin, t: TrabajoVideo) {
  const que = t.etapa ? `${ETAPA_LABELS[t.etapa].toLowerCase()} del video` : "el video";
  await avisar(admin, t.pedidoPor.id, `No se pudo generar ${que} de «${t.producto}» (v${t.version}): ${t.motivo}`, `/videos?guion=${t.guionId}`);
}

/** Trabajos en curso cuyo trabajador dejó de reportar: vuelven a la cola o quedan en fallo. */
async function rescatarVencidos(admin: Admin) {
  const { ids } = await nombres(admin, CARPETAS.enCurso);
  const limite = Date.now() - VENCIMIENTO_TOMA_MS;
  for (const id of ids) {
    const t = await leerEn(CARPETAS.enCurso, id);
    if (!t) continue;
    const latido = Date.parse(t.latidoAt ?? t.tomadoAt ?? t.creadoAt);
    if (Number.isFinite(latido) && latido > limite) continue;
    await soltar(admin, t, `El servidor dejó de reportar durante más de ${Math.round(VENCIMIENTO_TOMA_MS / 60000)} minutos`, false);
  }
}

/** Entrega el siguiente trabajo pendiente y lo deja tomado. `null` si no hay. */
export async function tomarTrabajo(admin: Admin, trabajador: string): Promise<RespuestaServidor<TrabajoVideo | null>> {
  const b = await asegurarBucketTrabajos(admin);
  if (b.error) return no(500, b.error);
  return enFila(async () => {
    await rescatarVencidos(admin);
    const { ids, error } = await nombres(admin, CARPETAS.pendientes);
    if (error) return no(500, `No se pudo leer la cola: ${error}`);
    const ahora = Date.now();
    for (const id of ids) {
      const t = await leerEn(CARPETAS.pendientes, id);
      if (!t) continue;
      if (t.noAntesDe && Date.parse(t.noAntesDe) > ahora) continue;
      // El bloqueo: solo un trabajador logra mover el archivo.
      if (!(await mover(admin, id, CARPETAS.pendientes, CARPETAS.enCurso))) continue;
      const iso = new Date().toISOString();
      t.intentos += 1;
      t.toma = randomUUID();
      t.trabajador = trabajador.slice(0, 80) || "servidor";
      t.tomadoAt = iso;
      t.latidoAt = iso;
      t.noAntesDe = null;
      t.motivo = "";
      t.progreso = null;
      // Un trabajo de imágenes o clips que se retoma tras una caída y ya entregó
      // todas sus escenas no se vuelve a repartir: se cierra solo, sin gastar.
      if ((t.etapa === "imagenes" || t.etapa === "clips") && !escenasSinReportar(t).length) {
        t.toma = null;
        t.terminadoAt = iso;
        anotar(t, "listo", "Todas sus escenas ya estaban entregadas: se cerró sin repetir nada", iso);
        await escribir(admin, CARPETAS.enCurso, t);
        await mover(admin, id, CARPETAS.enCurso, CARPETAS.listos);
        continue;
      }
      anotar(t, "tomado", `Tomado por ${t.trabajador} (intento ${t.intentos} de ${t.maxIntentos})`, iso);
      const w = await escribir(admin, CARPETAS.enCurso, t);
      if (w.error) return no(500, w.error);
      return { ok: true, dato: t };
    }
    return { ok: true, dato: null };
  });
}

/** Trae un trabajo en curso y comprueba que quien reporta es quien lo tomó. */
async function enCursoDe(id: string, toma: unknown): Promise<RespuestaServidor<TrabajoVideo>> {
  if (!ID_TRABAJO.test(id)) return no(400, "Id de trabajo inválido.");
  if (typeof toma !== "string" || !toma) return no(400, "Falta `toma`: la clave que entregó /tomar.");
  const t = await leerEn(CARPETAS.enCurso, id);
  if (!t) return no(409, "Ese trabajo ya no está en curso (venció, se terminó o se canceló). Suéltalo.", true);
  if (t.toma !== toma) return no(409, "Otro trabajador tomó este trabajo después de ti. Suéltalo.", true);
  return { ok: true, dato: t };
}

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

function anotarGasto(t: TrabajoVideo, cuerpo: Record<string, unknown>) {
  const seg = numero(cuerpo.segundosGenerados);
  if (seg !== null) t.segundosGenerados = Math.max(t.segundosGenerados, Math.round(seg * 10) / 10);
  const costo = numero(cuerpo.costoEstimadoUsd);
  if (costo !== null) t.costoEstimadoUsd = Math.round(costo * 1000) / 1000;
}

// ---- archivos del proyecto: una carpeta por trabajo, así una regeneración nunca pisa lo aprobado ----
const carpetaProyecto = (t: Pick<TrabajoVideo, "guionId" | "id">) => `${CARPETA_VIDEOS_GENERADOS}/${t.guionId}/proyecto/${t.id}`;
const rutaPieza = (t: Pick<TrabajoVideo, "guionId" | "id">, n: number, tipo: TipoPieza, ext: string) => `${carpetaProyecto(t)}/e${n}-${tipo}.${ext}`;

export type EscenaRecibida = { n: number; tipo: TipoPieza; ok: boolean; error?: string };

/**
 * Anota en el TRABAJO las escenas que el trabajador reporta (`escenas: [{ n, tipo,
 * ruta | url, creditos?, segundos?, error? }]`). El proyecto del guion las recoge
 * en la siguiente consulta de la pantalla (`plegarTrabajos`): aquí no se toca el
 * guion, para que el trabajador y la persona que revisa nunca se pisen.
 */
async function anotarEscenas(admin: Admin, t: TrabajoVideo, crudas: unknown[], iso: string): Promise<EscenaRecibida[]> {
  const esperado: TipoPieza = t.etapa === "imagenes" ? "imagen" : "clip";
  const almacen = admin.storage.from(BUCKET_VIDEOS_GENERADOS);
  let subidos: Map<string, number> | null = null;
  const pesoDe = async (rutaArchivo: string) => {
    if (!subidos) {
      const { data } = await almacen.list(carpetaProyecto(t), { limit: 200 });
      subidos = new Map((data ?? []).map((o) => [o.name, Number((o.metadata as { size?: number } | null)?.size ?? 0)]));
    }
    return subidos.get(rutaArchivo.slice(rutaArchivo.lastIndexOf("/") + 1)) ?? -1;
  };
  const salida: EscenaRecibida[] = [];
  for (const cruda of crudas.slice(0, 40)) {
    const x = cruda && typeof cruda === "object" ? (cruda as Record<string, unknown>) : {};
    const n = typeof x.n === "number" ? Math.floor(x.n) : NaN;
    const tipo: TipoPieza = x.tipo === "clip" ? "clip" : x.tipo === "imagen" ? "imagen" : esperado;
    const mal = (error: string) => salida.push({ n, tipo, ok: false, error });
    if (!t.escenasEtapa.some((e) => e.n === n)) {
      mal("Esa escena no es de este trabajo.");
      continue;
    }
    if (tipo !== esperado) {
      mal(`Este trabajo es de ${ETAPA_LABELS[t.etapa as EtapaTrabajo].toLowerCase()}: no admite «${tipo}».`);
      continue;
    }
    const base = { n, tipo, creditos: numero(x.creditos) ?? 0, segundos: numero(x.segundos) ?? 0, fecha: iso };
    const error = typeof x.error === "string" ? x.error.trim().slice(0, 600) : "";
    if (error) {
      t.reportes.push({ ...base, url: "", ruta: null, error });
      salida.push({ n, tipo, ok: true });
      continue;
    }
    // Repetir el aviso de una escena ya entregada no la duplica ni la vuelve a cobrar.
    if (t.reportes.some((r) => r.n === n && r.tipo === tipo && !r.error && (r.ruta === x.ruta || r.url === x.url))) {
      salida.push({ n, tipo, ok: true });
      continue;
    }
    if (typeof x.ruta === "string" && x.ruta) {
      const exts = tipo === "clip" ? ["mp4"] : Object.keys(EXT_IMAGEN);
      if (!exts.some((ext) => x.ruta === rutaPieza(t, n, tipo, ext))) {
        mal("`ruta` no es la que entregó este trabajo al pedir la subida de esa escena.");
        continue;
      }
      const peso = await pesoDe(x.ruta);
      if (peso < 0) {
        mal("El archivo todavía no está en Storage: la subida no terminó.");
        continue;
      }
      if (peso < 200) {
        mal("El archivo subido está vacío. Súbelo de nuevo.");
        continue;
      }
      t.reportes.push({ ...base, url: almacen.getPublicUrl(x.ruta).data.publicUrl, ruta: x.ruta, error: "" });
      salida.push({ n, tipo, ok: true });
      continue;
    }
    const u = typeof x.url === "string" ? enlaceSeguro(x.url) : null;
    if (!u || !u.startsWith("https://")) {
      mal("Manda `ruta` (archivo subido con la URL firmada), `url` (https) o `error`.");
      continue;
    }
    t.reportes.push({ ...base, url: u.slice(0, 600), ruta: null, error: "" });
    salida.push({ n, tipo, ok: true });
  }
  t.reportes = t.reportes.slice(-MAX_REPORTES);
  return salida;
}

export async function reportarProgreso(
  admin: Admin,
  id: string,
  cuerpo: Record<string, unknown>,
): Promise<RespuestaServidor<{ estado: EstadoTrabajo; escenas?: EscenaRecibida[] }>> {
  const r = await enCursoDe(id, cuerpo.toma);
  if (!r.ok) return r;
  const t = r.dato;
  const crudas = Array.isArray(cuerpo.escenas) ? cuerpo.escenas : [];
  if (crudas.length && t.etapa !== "imagenes" && t.etapa !== "clips") {
    return no(400, "Este trabajo no es de imágenes ni de clips: no admite `escenas`.");
  }
  // Un reporte de escenas sin `estado` se entiende como «generando».
  const estado = cuerpo.estado === "montando" ? "montando" : cuerpo.estado === "generando" || crudas.length ? "generando" : null;
  if (!estado) return no(400, "`estado` debe ser «generando» o «montando».");
  const iso = new Date().toISOString();
  const recibidas = crudas.length ? await anotarEscenas(admin, t, crudas, iso) : undefined;
  const p = cuerpo.progreso && typeof cuerpo.progreso === "object" ? (cuerpo.progreso as Record<string, unknown>) : null;
  const progreso: ProgresoTrabajo | null = p
    ? { hecho: numero(p.hecho) ?? 0, total: numero(p.total) ?? 0, detalle: typeof p.detalle === "string" ? p.detalle.slice(0, 200) : "" }
    : t.progreso;
  t.latidoAt = iso;
  t.progreso = progreso;
  if (!p && recibidas) {
    // Sin barra propia del trabajador, el avance es cuántas escenas ya reportó.
    const total = t.escenasEtapa.length;
    const hecho = total - escenasSinReportar(t).length;
    t.progreso = { hecho, total, detalle: `${hecho} de ${total} ${t.etapa === "imagenes" ? "imágenes" : "clips"}` };
  }
  anotarGasto(t, cuerpo);
  if (t.estado !== estado) anotar(t, estado, estado === "generando" ? "Empezó a generar las escenas" : "Empezó el montaje", iso);
  const w = await escribir(admin, CARPETAS.enCurso, t);
  if (w.error) return no(500, w.error);
  return { ok: true, dato: recibidas ? { estado, escenas: recibidas } : { estado } };
}

export const rutaVideoGenerado = (t: Pick<TrabajoVideo, "guionId" | "version" | "id">) =>
  `${CARPETA_VIDEOS_GENERADOS}/${t.guionId}/v${t.version}-${t.id}.mp4`;

export type SubidaFirmada = { url: string; metodo: "PUT"; cabeceras: Record<string, string>; bucket: string; ruta: string };
export type ResultadoRecibido = { estado: "listo"; videoUrl: string; version: number; guionId: string; etapa?: EtapaTrabajo; faltaron?: number[] };

/**
 * Dos usos, con el mismo cuerpo `{ toma, … }`:
 *  · `{ pedirSubida: true }` → devuelve una URL firmada para subir el MP4 directo a Storage.
 *  · `{ ruta }` (la que devolvió el paso anterior) o `{ videoUrl }` (https, ya subido en
 *    otra parte) → liga el video a su versión del guion, deja el trabajo `listo` y avisa.
 */
export async function recibirResultado(
  admin: Admin,
  id: string,
  cuerpo: Record<string, unknown>,
): Promise<RespuestaServidor<{ subida: SubidaFirmada } | ResultadoRecibido>> {
  const r = await enCursoDe(id, cuerpo.toma);
  if (!r.ok) {
    // Reintento de un resultado que ya había entrado: se responde lo mismo.
    const hecho = r.estado === 409 ? await leerEn(CARPETAS.listos, id) : null;
    if (hecho && typeof cuerpo.toma === "string" && hecho.historial.some((h) => h.estado === "listo") && (hecho.resultado || hecho.etapa === "imagenes" || hecho.etapa === "clips")) {
      return {
        ok: true,
        dato: { estado: "listo", videoUrl: hecho.resultado?.videoUrl ?? "", version: hecho.version, guionId: hecho.guionId, ...(hecho.etapa ? { etapa: hecho.etapa } : {}) },
      };
    }
    return r;
  }
  const t = r.dato;
  const esperada = rutaVideoGenerado(t);
  const almacen = admin.storage.from(BUCKET_VIDEOS_GENERADOS);
  const porEscenas = t.etapa === "imagenes" || t.etapa === "clips";

  // Subida por tipo (proyecto por escenas): la imagen base o el clip de UNA escena.
  if (cuerpo.pedirSubida === true && (cuerpo.tipo === "imagen" || cuerpo.tipo === "clip")) {
    const tipo: TipoPieza = cuerpo.tipo;
    if (!porEscenas || (tipo === "imagen") !== (t.etapa === "imagenes")) {
      return no(400, `Este trabajo ${t.etapa ? `es de ${ETAPA_LABELS[t.etapa].toLowerCase()}` : "es un video completo"}: no admite la subida de «${tipo}».`);
    }
    const n = typeof cuerpo.escena === "number" ? Math.floor(cuerpo.escena) : NaN;
    if (!t.escenasEtapa.some((e) => e.n === n)) return no(400, "`escena` debe ser el número de una escena de este trabajo.");
    const ext = tipo === "clip" ? "mp4" : typeof cuerpo.extension === "string" && EXT_IMAGEN[cuerpo.extension] ? cuerpo.extension : "jpg";
    const destino = rutaPieza(t, n, tipo, ext);
    const { data, error } = await almacen.createSignedUploadUrl(destino, { upsert: true });
    if (error || !data) return no(500, `No se pudo preparar la subida: ${error?.message ?? "sin respuesta"}`);
    t.latidoAt = new Date().toISOString();
    await escribir(admin, CARPETAS.enCurso, t);
    return {
      ok: true,
      dato: {
        subida: {
          url: data.signedUrl,
          metodo: "PUT",
          cabeceras: { "content-type": tipo === "clip" ? "video/mp4" : EXT_IMAGEN[ext], "x-upsert": "true", "cache-control": "max-age=3600" },
          bucket: BUCKET_VIDEOS_GENERADOS,
          ruta: destino,
        },
      },
    };
  }
  if (porEscenas && cuerpo.pedirSubida === true) {
    return no(400, "En esta etapa cada archivo se sube por escena: manda `tipo` («imagen» o «clip») y `escena`.");
  }

  // Cierre de un trabajo de imágenes o de clips: las escenas ya llegaron por `progreso`.
  if (porEscenas) {
    const iso = new Date().toISOString();
    const creditos = numero(cuerpo.creditos);
    if (creditos !== null) t.creditos = Math.max(t.creditos, Math.round(creditos * 100) / 100);
    anotarGasto(t, cuerpo);
    const faltaron = escenasSinReportar(t).map((e) => e.n);
    const bien = t.reportes.filter((x) => !x.error).length;
    t.terminadoAt = iso;
    t.latidoAt = iso;
    t.toma = null;
    t.progreso = null;
    t.motivo = "";
    anotar(t, "listo", `${ETAPA_LABELS[t.etapa as EtapaTrabajo]}: ${bien} entregadas${faltaron.length ? `, ${faltaron.length} sin entregar` : ""}. Quedan por aprobar`, iso);
    const w = await escribir(admin, CARPETAS.enCurso, t);
    if (w.error) return no(500, w.error);
    await mover(admin, t.id, CARPETAS.enCurso, CARPETAS.listos);
    await avisar(
      admin,
      t.pedidoPor.id,
      t.etapa === "imagenes"
        ? `Las imágenes de «${t.producto}» están listas: revísalas y aprueba las que sirven`
        : `Los clips de «${t.producto}» están listos: revísalos antes de armar el video`,
      `/videos?guion=${t.guionId}`,
    );
    return { ok: true, dato: { estado: "listo", videoUrl: "", version: t.version, guionId: t.guionId, etapa: t.etapa as EtapaTrabajo, faltaron } };
  }

  if (cuerpo.pedirSubida === true) {
    const { data, error } = await almacen.createSignedUploadUrl(esperada, { upsert: true });
    if (error || !data) return no(500, `No se pudo preparar la subida: ${error?.message ?? "sin respuesta"}`);
    t.latidoAt = new Date().toISOString();
    await escribir(admin, CARPETAS.enCurso, t);
    return {
      ok: true,
      dato: {
        subida: {
          url: data.signedUrl,
          metodo: "PUT",
          cabeceras: { "content-type": "video/mp4", "x-upsert": "true", "cache-control": "max-age=3600" },
          bucket: BUCKET_VIDEOS_GENERADOS,
          ruta: esperada,
        },
      },
    };
  }

  let rutaFinal: string | null = null;
  let videoUrl: string;
  if (typeof cuerpo.ruta === "string" && cuerpo.ruta) {
    if (cuerpo.ruta !== esperada) return no(400, "`ruta` no es la que entregó este trabajo al pedir la subida.");
    const carpeta = esperada.slice(0, esperada.lastIndexOf("/"));
    const nombre = esperada.slice(carpeta.length + 1);
    const { data: lista, error } = await almacen.list(carpeta, { search: nombre });
    const archivo = lista?.find((o) => o.name === nombre);
    if (error || !archivo) return no(409, "El video todavía no está en Storage: la subida no terminó. Súbelo y vuelve a reportar.");
    const peso = Number((archivo.metadata as { size?: number } | null)?.size ?? 0);
    if (peso < 1024) return no(409, "El archivo subido está vacío. Súbelo de nuevo.");
    rutaFinal = esperada;
    videoUrl = almacen.getPublicUrl(esperada).data.publicUrl;
  } else if (typeof cuerpo.videoUrl === "string" && cuerpo.videoUrl) {
    const u = enlaceSeguro(cuerpo.videoUrl);
    if (!u || !u.startsWith("https://")) return no(400, "`videoUrl` debe ser un enlace https.");
    videoUrl = u.slice(0, 600);
  } else {
    return no(400, "Manda `pedirSubida: true`, o `ruta` (video ya subido con la URL firmada), o `videoUrl` (https).");
  }

  // Se liga a ESA versión del guion. El video entra sin aprobar: nada generado
  // sale del CRM sin que alguien diga que sí.
  const g = await leerGuionArchivo(admin, t.guionId);
  if (!g) return no(409, "El guion de este trabajo ya no existe.", true);
  if (!g.versiones.some((v) => v.n === t.version)) return no(409, "La versión del guion de este trabajo ya no existe.", true);
  const iso = new Date().toISOString();
  // Un armado NO escribe el guion aquí: el proyecto lo recoge del trabajo ya
  // terminado (`ponerAlDiaProyecto`), igual que las imágenes y los clips.
  if (t.etapa !== "armado") {
    g.versiones = g.versiones.map((v) => (v.n === t.version ? { ...v, videoUrl, videoTrabajoId: t.id, videoAprobado: null } : v));
    g.actualizadoAt = iso;
    const wg = await escribirGuionArchivo(admin, g);
    if (wg.error) return no(500, wg.error);
  }

  const lst = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : [])
      .filter((x): x is string => typeof x === "string" && !!x.trim())
      .map((x) => x.slice(0, 400))
      .slice(0, max);
  anotarGasto(t, cuerpo);
  t.resultado = {
    ruta: rutaFinal,
    videoUrl,
    duracion: numero(cuerpo.duracion),
    proveedor: typeof cuerpo.proveedor === "string" ? cuerpo.proveedor.slice(0, 60) : "",
    modelos: lst(cuerpo.modelos, 6),
    sinVoz: cuerpo.sinVoz === true,
    avisos: lst(cuerpo.avisos, 12),
  };
  t.terminadoAt = iso;
  t.latidoAt = iso;
  t.toma = null;
  t.progreso = null;
  t.motivo = "";
  anotar(t, "listo", "Video entregado: queda por aprobar", iso);
  const w = await escribir(admin, CARPETAS.enCurso, t);
  if (w.error) return no(500, w.error);
  await mover(admin, t.id, CARPETAS.enCurso, CARPETAS.listos);

  await avisar(admin, t.pedidoPor.id, `El video de «${t.producto}» (v${t.version}) está listo: revísalo y apruébalo`, `/videos?guion=${t.guionId}`);
  return { ok: true, dato: { estado: "listo", videoUrl, version: t.version, guionId: t.guionId, ...(t.etapa ? { etapa: t.etapa } : {}) } };
}

export async function reportarFallo(
  admin: Admin,
  id: string,
  cuerpo: Record<string, unknown>,
): Promise<RespuestaServidor<{ estado: EstadoTrabajo; intentos: number; maxIntentos: number; reintentaDesde: string | null }>> {
  const r = await enCursoDe(id, cuerpo.toma);
  if (!r.ok) return r;
  const motivo = typeof cuerpo.motivo === "string" && cuerpo.motivo.trim() ? cuerpo.motivo.trim() : "El servidor no dijo por qué";
  anotarGasto(r.dato, cuerpo);
  const t = await enFila(() => soltar(admin, r.dato, motivo, cuerpo.definitivo === true));
  return { ok: true, dato: { estado: t.estado, intentos: t.intentos, maxIntentos: t.maxIntentos, reintentaDesde: t.noAntesDe } };
}
