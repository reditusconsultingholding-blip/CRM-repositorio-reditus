import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { createAdminClient } from "@/lib/supabase/admin";

// Relevo entre el tablero Pulso y su robot (`/api/servidor/pulso/**`).
//
// El robot de Pulso corre en el servidor de Reditus y solo escucha en su
// propio 127.0.0.1, así que el tablero (abierto en cualquier computador) no
// puede hablarle. Este relevo es el punto de encuentro:
//
//   · El ROBOT llama cada 20 s a `POST /api/servidor/pulso/latido` con su
//     estado (Authorization: Bearer SERVIDOR_SECRET) y recibe
//     `{ ok, pedir, paginas? }`: si alguien pidió una actualización o dejó una
//     lista de páginas por aplicar. Lo entregado queda tomado en ese momento.
//   · El TABLERO (la función `/api/robot` del proyecto de Pulso, nunca el
//     navegador directamente) llama a `pedir`, `estado` y `paginas` con una
//     firma corta hecha con PULSO_SECRETO, el secreto que ya comparten los dos
//     proyectos:  Authorization: Pulso <vence>.<hmac sha256 de "pulso:robot:<vence>">
//     con `vence` en segundos y como mucho 2 minutos en el futuro.
//
// Estado: tres JSON pequeños en el bucket privado `trabajos`, carpeta
// `pulso-robot/`. Van separados a propósito: el latido escribe cada 20 s y, si
// todo viviera en un solo archivo, un «pedir» que cayera entre su lectura y su
// escritura se perdería.
//
//   latido.json   lo último que dijo el robot (solo lo escribe el latido)
//   pedido.json   existe mientras hay una actualización pedida sin tomar
//   paginas.json  existe mientras hay una lista de páginas sin aplicar
//
// Nada aquí lanza errores esperados: todo vuelve como `{ error }`.

type Admin = ReturnType<typeof createAdminClient>;

const BUCKET = "trabajos";
const CARPETA = /^[a-z0-9-]{1,40}$/.test(process.env.PULSO_ROBOT_CARPETA ?? "") ? (process.env.PULSO_ROBOT_CARPETA as string) : "pulso-robot";
const ARCHIVO = { latido: "latido.json", pedido: "pedido.json", paginas: "paginas.json" } as const;
type Archivo = (typeof ARCHIVO)[keyof typeof ARCHIVO];
const ruta = (a: Archivo) => `${CARPETA}/${a}`;

const SEGUNDOS_FIRMA = 120;
/** Sin latido en este tiempo, el tablero dice «El servidor no responde». */
export const LATIDO_VENCE_MS = 120_000;
const MAX_PAGINAS = 40;

// ───────────────────────── Autenticación ─────────────────────────

function iguales(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

/** Rechazo para las rutas que llama el tablero, o null si la firma es válida. */
export function rechazoPulso(request: NextRequest): NextResponse | null {
  const secreto = process.env.PULSO_SECRETO?.trim();
  if (!secreto) {
    return NextResponse.json({ error: "El relevo de Pulso no está activado: falta PULSO_SECRETO." }, { status: 503 });
  }
  const cabecera = request.headers.get("authorization") ?? "";
  const [vence, firma] = (cabecera.startsWith("Pulso ") ? cabecera.slice(6).trim() : "").split(".");
  const ahora = Math.floor(Date.now() / 1000);
  const valida =
    /^\d{9,11}$/.test(vence ?? "") &&
    !!firma &&
    +vence >= ahora &&
    +vence <= ahora + SEGUNDOS_FIRMA + 60 &&
    iguales(firma, createHmac("sha256", secreto).update(`pulso:robot:${vence}`).digest("hex"));
  return valida ? null : NextResponse.json({ error: "No autorizado." }, { status: 401 });
}

// ───────────────────────── Almacenamiento ─────────────────────────

let bucketListo = false;
async function asegurarBucket(admin: Admin): Promise<string | null> {
  if (bucketListo) return null;
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) {
    if (data.public) return "El bucket «trabajos» quedó público. Debe ser privado: corrígelo en Supabase → Storage.";
    bucketListo = true;
    return null;
  }
  const { error } = await admin.storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists|duplicate/i.test(error.message)) return `No se pudo preparar el almacenamiento: ${error.message}`;
  bucketListo = true;
  return null;
}

// Lectura directa y sin caché: una copia vieja del latido haría creer que el robot está caído.
async function leer(archivo: Archivo): Promise<{ dato: unknown | null; error?: string }> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !llave) return { dato: null, error: "Falta la configuración de Supabase." };
  const url = `${base}/storage/v1/object/${BUCKET}/${ruta(archivo)}?sinCache=${Date.now()}${randomBytes(3).toString("hex")}`;
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

async function escribir(admin: Admin, archivo: Archivo, dato: unknown): Promise<string | null> {
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(ruta(archivo), JSON.stringify(dato), { contentType: "application/json", upsert: true, cacheControl: "0" });
  return error ? error.message : null;
}

async function borrar(admin: Admin, archivo: Archivo): Promise<string | null> {
  const { error } = await admin.storage.from(BUCKET).remove([ruta(archivo)]);
  return error ? error.message : null;
}

// ───────────────────────── Datos ─────────────────────────

const texto = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const fecha = (v: unknown): string | null => (typeof v === "string" && v.length <= 40 && !isNaN(Date.parse(v)) ? v : null);
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export type PaginaPulso = {
  id: string;
  nombre: string;
  cliente: string;
  slug: string;
  rutas: string[];
  producto: string[];
  modelo: string;
  moneda: string;
  url: string;
  creada?: string;
};

export type LatidoPulso = {
  recibido: string;
  enCurso: boolean;
  fase: string | null;
  ultimaOk: string | null;
  ultimaOkTexto: string | null;
  ultimoIntento: string | null;
  proxima: string | null;
  error: string | null;
  avisos: string[];
  equipo: string | null;
  paginas: PaginaPulso[] | null;
};

const MODELOS = ["cod", "prepago"];
const MONEDAS = ["COP", "USD", "EUR", "MXN", "CLP", "ARS", "PEN"];

/** Las mismas reglas que `validarPaginas` del robot, para que el error llegue al tablero en el momento y no se pierda en el servidor. */
export function validarPaginas(lista: unknown): { paginas: PaginaPulso[] } | { error: string } {
  if (!Array.isArray(lista)) return { error: "Falta la lista «paginas»" };
  if (lista.length > MAX_PAGINAS) return { error: `Máximo ${MAX_PAGINAS} páginas` };
  const ids = new Set<string>();
  const paginas: PaginaPulso[] = [];
  for (let i = 0; i < lista.length; i++) {
    const p: unknown = lista[i];
    const mal = (m: string) => ({ error: `Página ${i + 1}: ${m}` });
    if (!esObjeto(p)) return mal("debe ser un objeto");
    if (typeof p.id !== "string" || p.id.length > 64 || !/^x-[a-z0-9][a-z0-9-]*$/.test(p.id)) return mal("el id debe empezar por «x-» y llevar solo minúsculas, dígitos y guiones (máximo 64 caracteres)");
    if (ids.has(p.id)) return mal(`el id «${p.id}» está repetido`);
    if (typeof p.nombre !== "string" || !p.nombre.trim()) return mal("falta el nombre");
    if (p.nombre.trim().length > 120) return mal("el nombre no puede pasar de 120 caracteres");
    if (p.cliente !== undefined && typeof p.cliente !== "string") return mal("el cliente debe ser un texto");
    const cliente = (typeof p.cliente === "string" ? p.cliente : "").trim();
    if (cliente.length > 120) return mal("el cliente no puede pasar de 120 caracteres");
    if (typeof p.slug !== "string" || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(p.slug)) return mal("el identificador de la tienda (slug) no es válido: es lo que va después de admin.shopify.com/store/");
    if (!Array.isArray(p.rutas)) return mal("«rutas» debe ser una lista");
    if (!Array.isArray(p.producto)) return mal("«producto» debe ser una lista");
    if (p.rutas.length > 20 || p.producto.length > 20) return mal("máximo 20 rutas y 20 textos de producto");
    const rutas: string[] = [];
    for (const r of p.rutas as unknown[]) {
      if (typeof r !== "string") return mal("cada ruta debe ser un texto");
      const limpia = r.trim();
      if (!limpia.startsWith("/")) return mal("cada ruta debe empezar por «/» (por ejemplo /products/mi-producto)");
      if (limpia.length > 200) return mal("cada ruta puede medir máximo 200 caracteres");
      rutas.push(limpia);
    }
    const producto: string[] = [];
    for (const x of p.producto as unknown[]) {
      if (typeof x !== "string" || !x.trim()) return mal("cada texto de producto debe ser un texto no vacío");
      if (x.trim().length > 120) return mal("cada texto de producto puede medir máximo 120 caracteres");
      producto.push(x.trim());
    }
    if (!rutas.length && !producto.length) return mal("hace falta al menos una ruta o un texto del título del producto");
    if (typeof p.modelo !== "string" || !MODELOS.includes(p.modelo)) return mal("el modelo debe ser «cod» o «prepago»");
    if (typeof p.moneda !== "string" || !MONEDAS.includes(p.moneda)) return mal(`la moneda debe ser una de ${MONEDAS.join(", ")}`);
    if (p.url !== undefined && typeof p.url !== "string") return mal("la url debe ser un texto");
    const url = (typeof p.url === "string" ? p.url : "").trim();
    if (url.length > 300 || (url && !/^https?:\/\/[^\s"'<>]+$/i.test(url))) return mal("la url debe empezar por http:// o https:// y medir máximo 300 caracteres");
    const pagina: PaginaPulso = { id: p.id, nombre: p.nombre.trim(), cliente, slug: p.slug, rutas, producto, modelo: p.modelo, moneda: p.moneda, url };
    // Sin fecha, la pone el robot con el «hoy» de Colombia.
    if (p.creada !== undefined && p.creada !== null && p.creada !== "") {
      if (typeof p.creada !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.creada) || isNaN(Date.parse(`${p.creada}T00:00:00Z`))) return mal("la fecha de creación debe tener la forma AAAA-MM-DD");
      pagina.creada = p.creada;
    }
    ids.add(p.id);
    paginas.push(pagina);
  }
  return { paginas };
}

function leerLatido(dato: unknown): LatidoPulso | null {
  if (!esObjeto(dato)) return null;
  const recibido = fecha(dato.recibido);
  if (!recibido) return null;
  const paginas = Array.isArray(dato.paginas) ? validarPaginas(dato.paginas) : null;
  return {
    recibido,
    enCurso: dato.enCurso === true,
    fase: texto(dato.fase, 40),
    ultimaOk: fecha(dato.ultimaOk),
    ultimaOkTexto: texto(dato.ultimaOkTexto, 60),
    ultimoIntento: fecha(dato.ultimoIntento),
    proxima: fecha(dato.proxima),
    error: texto(dato.error, 400),
    avisos: Array.isArray(dato.avisos) ? dato.avisos.filter((a): a is string => typeof a === "string" && !!a.trim()).slice(0, 10).map((a) => a.trim().slice(0, 300)) : [],
    equipo: texto(dato.equipo, 80),
    paginas: paginas && "paginas" in paginas ? paginas.paginas : null,
  };
}

type Resultado<T> = { ok: true; dato: T } | { ok: false; estado: number; error: string };
const fallo = (error: string, estado = 500): { ok: false; estado: number; error: string } => ({ ok: false, estado, error });

// ───────────────────────── Operaciones ─────────────────────────

/** El robot reporta su estado y se lleva lo que tenga pendiente (queda tomado al entregarlo). */
export async function recibirLatido(admin: Admin, cuerpo: Record<string, unknown>): Promise<Resultado<{ pedir: boolean; paginas?: PaginaPulso[] }>> {
  const listo = await asegurarBucket(admin);
  if (listo) return fallo(listo);
  const latido = leerLatido({ ...cuerpo, recibido: new Date().toISOString() });
  if (!latido) return fallo("El latido no es válido.", 400);
  const guardado = await escribir(admin, ARCHIVO.latido, latido);
  if (guardado) return fallo(`No se pudo guardar el latido: ${guardado}`);

  // Una sola consulta dice qué hay pendiente; lo normal es que no haya nada.
  const { data, error } = await admin.storage.from(BUCKET).list(CARPETA, { limit: 20 });
  if (error) return fallo(`No se pudo consultar lo pendiente: ${error.message}`);
  const hay = new Set((data ?? []).map((f) => f.name));

  let pedir = false;
  if (hay.has(ARCHIVO.pedido)) {
    // Si no se pudo marcar como tomado se entrega igual: como mucho el robot actualiza dos veces.
    await borrar(admin, ARCHIVO.pedido);
    pedir = true;
  }
  let paginas: PaginaPulso[] | undefined;
  if (hay.has(ARCHIVO.paginas)) {
    const r = await leer(ARCHIVO.paginas);
    const lista = esObjeto(r.dato) ? validarPaginas(r.dato.paginas) : null;
    if (lista && "paginas" in lista) {
      paginas = lista.paginas;
      await borrar(admin, ARCHIVO.paginas);
    } else if (!r.error) {
      await borrar(admin, ARCHIVO.paginas); // ilegible: no sirve guardarla
    }
  }
  return { ok: true, dato: { pedir, ...(paginas ? { paginas } : {}) } };
}

export type EstadoPulso = {
  ahora: string;
  latido: Omit<LatidoPulso, "paginas"> | null;
  /** Segundos desde el último latido; null si el robot nunca se ha reportado. */
  sinLatidoSeg: number | null;
  responde: boolean;
  pedida: boolean;
  paginas: PaginaPulso[];
  paginasPendientes: boolean;
};

/** Lo que el tablero necesita para decir, en llano, cómo está el robot. */
export async function estadoPulso(): Promise<Resultado<EstadoPulso>> {
  const [l, p, g] = await Promise.all([leer(ARCHIVO.latido), leer(ARCHIVO.pedido), leer(ARCHIVO.paginas)]);
  const error = l.error ?? p.error ?? g.error;
  if (error) return fallo(`No se pudo leer el estado del robot: ${error}`);
  const latido = leerLatido(l.dato);
  const pendientes = esObjeto(g.dato) ? validarPaginas(g.dato.paginas) : null;
  const ahora = Date.now();
  const edad = latido ? Math.max(0, ahora - Date.parse(latido.recibido)) : null;
  let sinPaginas: Omit<LatidoPulso, "paginas"> | null = null;
  let delRobot: PaginaPulso[] = [];
  if (latido) {
    const { paginas, ...resto } = latido;
    sinPaginas = resto;
    delRobot = paginas ?? [];
  }
  return {
    ok: true,
    dato: {
      ahora: new Date(ahora).toISOString(),
      latido: sinPaginas,
      sinLatidoSeg: edad === null ? null : Math.round(edad / 1000),
      responde: edad !== null && edad <= LATIDO_VENCE_MS,
      pedida: !!p.dato,
      // La lista pendiente es la intención más reciente; si no hay, vale la que reportó el robot.
      paginas: pendientes && "paginas" in pendientes ? pendientes.paginas : delRobot,
      paginasPendientes: !!(pendientes && "paginas" in pendientes),
    },
  };
}

/** Deja pedida una actualización: el robot la toma en su siguiente latido. */
export async function pedirActualizacion(admin: Admin): Promise<Resultado<EstadoPulso>> {
  const listo = await asegurarBucket(admin);
  if (listo) return fallo(listo);
  const guardado = await escribir(admin, ARCHIVO.pedido, { pedida: new Date().toISOString() });
  if (guardado) return fallo(`No se pudo dejar el pedido: ${guardado}`);
  return estadoPulso();
}

/** Deja la lista completa de páginas para que el robot la aplique en su siguiente latido. */
export async function dejarPaginas(admin: Admin, lista: unknown): Promise<Resultado<{ paginas: PaginaPulso[]; responde: boolean }>> {
  const r = validarPaginas(lista);
  if ("error" in r) return fallo(r.error, 400);
  const listo = await asegurarBucket(admin);
  if (listo) return fallo(listo);
  const guardado = await escribir(admin, ARCHIVO.paginas, { paginas: r.paginas, desde: new Date().toISOString() });
  if (guardado) return fallo(`No se pudo guardar la lista de páginas: ${guardado}`);
  const l = leerLatido((await leer(ARCHIVO.latido)).dato);
  return { ok: true, dato: { paginas: r.paginas, responde: !!l && Date.now() - Date.parse(l.recibido) <= LATIDO_VENCE_MS } };
}

/** Envuelve una ruta del tablero: comprueba la firma y nunca deja escapar una excepción. */
export async function atenderPulso(request: NextRequest, fn: () => Promise<NextResponse>): Promise<NextResponse> {
  const rechazo = rechazoPulso(request);
  if (rechazo) return rechazo;
  try {
    return await fn();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error inesperado." }, { status: 500 });
  }
}

export function responderPulso<T extends object>(r: Resultado<T>): NextResponse {
  const cabeceras = { "cache-control": "no-store" };
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.estado, headers: cabeceras });
  return NextResponse.json({ ok: true, ...r.dato }, { headers: cabeceras });
}
