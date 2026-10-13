import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { buscarFormato } from "@/lib/video-formatos";
import { corchetes, escenasParaVideo, pasosDelGuion } from "@/lib/trabajos-video";
import {
  BUCKET_TRABAJOS,
  BUCKET_VIDEOS_GENERADOS,
  CARPETA_VIDEOS_GENERADOS,
  ESPERA_REINTENTO_MS,
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

const CARPETAS = { pendientes: "videos/pendientes", enCurso: "videos/en-curso", listos: "videos/listos", fallos: "videos/fallos" } as const;
type Carpeta = (typeof CARPETAS)[keyof typeof CARPETAS];
const ORDEN_BUSQUEDA: Carpeta[] = [CARPETAS.enCurso, CARPETAS.pendientes, CARPETAS.listos, CARPETAS.fallos];
const ruta = (carpeta: Carpeta, id: string) => `${carpeta}/${id}.json`;

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

/** Videos pedidos hoy (hora de Bogotá). Un trabajo que falló sin gastar segundos no cuenta. */
export async function topeDeHoy(admin: Admin): Promise<TopeDiario> {
  const { dia } = selloBogota(new Date());
  const [p, c, l, f] = await Promise.all(
    [CARPETAS.pendientes, CARPETAS.enCurso, CARPETAS.listos, CARPETAS.fallos].map((x) => nombres(admin, x, { busca: `${dia}-` })),
  );
  const deHoy = (ids: string[]) => ids.filter((id) => id.startsWith(`${dia}-`));
  const fallidos = await Promise.all(deHoy(f.ids).map((id) => leerEn(CARPETAS.fallos, id)));
  const fallosConGasto = fallidos.filter((t) => t && t.segundosGenerados > 0).length;
  return { usados: deHoy(p.ids).length + deHoy(c.ids).length + deHoy(l.ids).length + fallosConGasto, max: TOPE_DIARIO_VIDEOS };
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
      return { imagenes: [], opciones: { subtitulos: true, voz: true, modelo: null }, error: `Esta foto del producto no es un enlace https válido: ${c.slice(0, 80)}` };
    }
    imagenes.push(u.slice(0, 600));
  }
  const modelo = typeof p?.modelo === "string" ? p.modelo.trim().slice(0, 160) : "";
  if (modelo && !/^[\w.\-/]+$/.test(modelo)) {
    return { imagenes: [], opciones: { subtitulos: true, voz: true, modelo: null }, error: "El modelo solo puede llevar letras, números, puntos, guiones y barras." };
  }
  return {
    imagenes: imagenes.slice(0, MAX_IMAGENES_PRODUCTO),
    opciones: { subtitulos: p?.subtitulos !== false, voz: p?.voz !== false, modelo: modelo || null },
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
  if (!t.pedidoPor.id) return;
  try {
    await notify(admin, t.pedidoPor.id, "terminado", `No se pudo generar el video de «${t.producto}» (v${t.version}): ${t.motivo}`.slice(0, 240), `/videos?guion=${t.guionId}`);
  } catch {
    /* el aviso es mejor esfuerzo */
  }
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

export async function reportarProgreso(admin: Admin, id: string, cuerpo: Record<string, unknown>): Promise<RespuestaServidor<{ estado: EstadoTrabajo }>> {
  const r = await enCursoDe(id, cuerpo.toma);
  if (!r.ok) return r;
  const t = r.dato;
  const estado = cuerpo.estado === "montando" ? "montando" : cuerpo.estado === "generando" ? "generando" : null;
  if (!estado) return no(400, "`estado` debe ser «generando» o «montando».");
  const iso = new Date().toISOString();
  const p = cuerpo.progreso && typeof cuerpo.progreso === "object" ? (cuerpo.progreso as Record<string, unknown>) : null;
  const progreso: ProgresoTrabajo | null = p
    ? { hecho: numero(p.hecho) ?? 0, total: numero(p.total) ?? 0, detalle: typeof p.detalle === "string" ? p.detalle.slice(0, 200) : "" }
    : t.progreso;
  t.latidoAt = iso;
  t.progreso = progreso;
  anotarGasto(t, cuerpo);
  if (t.estado !== estado) anotar(t, estado, estado === "generando" ? "Empezó a generar las escenas" : "Empezó el montaje", iso);
  const w = await escribir(admin, CARPETAS.enCurso, t);
  if (w.error) return no(500, w.error);
  return { ok: true, dato: { estado } };
}

export const rutaVideoGenerado = (t: Pick<TrabajoVideo, "guionId" | "version" | "id">) =>
  `${CARPETA_VIDEOS_GENERADOS}/${t.guionId}/v${t.version}-${t.id}.mp4`;

export type SubidaFirmada = { url: string; metodo: "PUT"; cabeceras: Record<string, string>; bucket: string; ruta: string };
export type ResultadoRecibido = { estado: "listo"; videoUrl: string; version: number; guionId: string };

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
    if (hecho?.resultado && typeof cuerpo.toma === "string" && hecho.historial.some((h) => h.estado === "listo")) {
      return { ok: true, dato: { estado: "listo", videoUrl: hecho.resultado.videoUrl, version: hecho.version, guionId: hecho.guionId } };
    }
    return r;
  }
  const t = r.dato;
  const esperada = rutaVideoGenerado(t);
  const almacen = admin.storage.from(BUCKET_VIDEOS_GENERADOS);

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
  g.versiones = g.versiones.map((v) => (v.n === t.version ? { ...v, videoUrl, videoTrabajoId: t.id, videoAprobado: null } : v));
  g.actualizadoAt = iso;
  const wg = await escribirGuionArchivo(admin, g);
  if (wg.error) return no(500, wg.error);

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

  if (t.pedidoPor.id) {
    try {
      await notify(admin, t.pedidoPor.id, "terminado", `El video de «${t.producto}» (v${t.version}) está listo: revísalo y apruébalo`, `/videos?guion=${t.guionId}`);
    } catch {
      /* el aviso es mejor esfuerzo */
    }
  }
  return { ok: true, dato: { estado: "listo", videoUrl, version: t.version, guionId: t.guionId } };
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
