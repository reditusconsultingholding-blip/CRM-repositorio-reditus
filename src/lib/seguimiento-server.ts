import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { notify, type NotificationType } from "@/lib/notify";
import {
  BUCKET_SEGUIMIENTO,
  armarDia,
  contar,
  diasDeSemana,
  fechaCorta,
  hoyBogota,
  leerPlantilla,
  lunesDe,
  plantillaInicial,
  puedeSupervisar,
  sumar,
  sumarDias,
  tieneSecuencia,
  diaSemana,
  type ArchivoDia,
  type ArchivoRevision,
  type Cuenta,
  type DiaVista,
  type Persona,
  type Plantilla,
} from "@/lib/seguimiento";
import type { UserRole } from "@/lib/roles";

// Lectura y escritura de «Seguimiento diario» en Supabase Storage. Todo pasa
// por el cliente de servicio DESPUÉS de que la acción validó quién es y qué
// puede hacer; el bucket es privado y nada se sirve con URL pública.

type Admin = ReturnType<typeof createAdminClient>;

const RUTA_PLANTILLA = "plantilla.json";
export const rutaDia = (fecha: string, userId: string) => `dias/${fecha}/${userId}.json`;
export const rutaRevision = (fecha: string, userId: string) => `revisiones/${fecha}/${userId}.json`;
export const carpetaEvidencias = (fecha: string, userId: string) => `evidencias/${fecha}/${userId}`;

let bucketListo = false;

/** Crea el bucket privado la primera vez (crear un bucket no es SQL). */
export async function asegurarBucket(admin: Admin): Promise<{ error?: string }> {
  if (bucketListo) return {};
  const { data } = await admin.storage.getBucket(BUCKET_SEGUIMIENTO);
  if (data) {
    if (data.public) return { error: "El bucket «seguimiento» quedó público. Debe ser privado: corrígelo en Supabase → Storage." };
    bucketListo = true;
    return {};
  }
  const { error } = await admin.storage.createBucket(BUCKET_SEGUIMIENTO, { public: false });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    return { error: `No se pudo preparar el almacenamiento: ${error.message}` };
  }
  bucketListo = true;
  return {};
}

// La lectura va con una dirección única y `no-store`: el `fetch` de Next
// puede devolver una respuesta guardada de la misma dirección, y aquí una
// lectura vieja significa pisar lo que la persona acaba de entregar.
async function leerJson(_admin: Admin, ruta: string): Promise<{ dato: unknown | null; error?: string }> {
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET_SEGUIMIENTO}/${ruta}?sinCache=${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { authorization: `Bearer ${llave}`, apikey: llave }, cache: "no-store" });
  } catch (e) {
    return { dato: null, error: e instanceof Error ? e.message : "sin respuesta del almacenamiento" };
  }
  const cuerpo = await res.text();
  if (!res.ok) {
    // «No existe» es lo normal (día sin registro); cualquier otra cosa es un
    // fallo real y NO se trata como archivo vacío (se pisaría lo guardado).
    const noExiste = res.status === 404 || (res.status === 400 && /not.?found|"404"/i.test(cuerpo));
    return noExiste ? { dato: null } : { dato: null, error: `el almacenamiento respondió ${res.status}` };
  }
  try {
    return { dato: JSON.parse(cuerpo) };
  } catch {
    return { dato: null, error: `El archivo ${ruta} está dañado.` };
  }
}

async function escribirJson(admin: Admin, ruta: string, dato: unknown): Promise<{ error?: string }> {
  const { error } = await admin.storage
    .from(BUCKET_SEGUIMIENTO)
    .upload(ruta, JSON.stringify(dato, null, 1), { contentType: "application/json", upsert: true, cacheControl: "0" });
  return error ? { error: `No se pudo guardar: ${error.message}` } : {};
}

// Una sola escritura a la vez por archivo dentro del mismo proceso. Entre
// procesos distintos el riesgo queda acotado porque cada archivo tiene un
// único dueño (la persona su día; quien revisa, la revisión).
const colas = new Map<string, Promise<unknown>>();
function enFila<T>(clave: string, fn: () => Promise<T>): Promise<T> {
  const previa = colas.get(clave) ?? Promise.resolve();
  const turno = previa.then(fn, fn);
  const cola = turno.catch(() => {});
  colas.set(clave, cola);
  void cola.then(() => {
    if (colas.get(clave) === cola) colas.delete(clave);
  });
  return turno;
}

// --------------------------------------------------------- plantilla ----

// La plantilla casi nunca cambia y se necesita en CADA acción y en cada
// pintada: se recuerda unos segundos en el proceso para no ir a Storage cada
// vez. Al guardarla aquí se renueva al instante; en otro proceso, el cambio
// del CEO se ve a lo sumo con este retraso.
const PLANTILLA_VIGENCIA_MS = 15_000;
let plantillaReciente: { plantilla: Plantilla; hasta: number } | null = null;

export async function leerPlantillaGuardada(admin: Admin): Promise<Plantilla> {
  if (plantillaReciente && plantillaReciente.hasta > Date.now()) return structuredClone(plantillaReciente.plantilla);
  const r = await leerJson(admin, RUTA_PLANTILLA);
  // Sin archivo (o ilegible): la plantilla inicial. No se escribe sola.
  const plantilla = r.dato ? leerPlantilla(r.dato) : plantillaInicial();
  // Un fallo de lectura no se recuerda: la próxima vez se vuelve a intentar.
  if (!r.error) plantillaReciente = { plantilla: structuredClone(plantilla), hasta: Date.now() + PLANTILLA_VIGENCIA_MS };
  return plantilla;
}

export async function guardarPlantilla(admin: Admin, plantilla: Plantilla): Promise<{ error?: string }> {
  const b = await asegurarBucket(admin);
  if (b.error) return b;
  const g = await enFila(RUTA_PLANTILLA, () => escribirJson(admin, RUTA_PLANTILLA, plantilla));
  plantillaReciente = g.error ? null : { plantilla: structuredClone(plantilla), hasta: Date.now() + PLANTILLA_VIGENCIA_MS };
  cuentasPasadas.clear(); // los días pasados sin registro se arman con la plantilla
  return g;
}

// Conteo de días YA PASADOS para la tira de la semana (solo para pintar,
// nunca para escribir): la persona ya no puede tocarlos y solo cambian si
// alguien los revisa. Se recuerdan un minuto para que marcar varias tareas
// seguidas no relea toda la semana cada vez.
const CUENTA_VIGENCIA_MS = 60_000;
const cuentasPasadas = new Map<string, { conRegistro: boolean; cuenta: Cuenta; hasta: number }>();
const claveCuenta = (fecha: string, userId: string) => `${fecha}/${userId}`;

// --------------------------------------------------------------- días ----

function esArchivoDia(v: unknown): v is ArchivoDia {
  const d = v as ArchivoDia | null;
  return !!d && typeof d === "object" && typeof d.fecha === "string" && typeof d.userId === "string" && Array.isArray(d.tareas) && !!d.entregas;
}

export async function leerDia(admin: Admin, fecha: string, userId: string): Promise<{ dia: ArchivoDia | null; error?: string }> {
  const r = await leerJson(admin, rutaDia(fecha, userId));
  if (r.error) return { dia: null, error: r.error };
  return { dia: esArchivoDia(r.dato) ? r.dato : null };
}

export async function leerRevision(admin: Admin, fecha: string, userId: string): Promise<{ revision: ArchivoRevision | null; error?: string }> {
  const r = await leerJson(admin, rutaRevision(fecha, userId));
  if (r.error) return { revision: null, error: r.error };
  const d = r.dato as ArchivoRevision | null;
  return { revision: d && typeof d === "object" && d.revisiones ? d : null };
}

/**
 * Leer-modificar-escribir del archivo de UNA persona en UN día. `cambio`
 * recibe el archivo (o uno nuevo armado con la plantilla) y lo modifica; si
 * devuelve `{ error }` no se guarda nada.
 *
 * `cambio` recibe también el día tal como estaba ANTES del cambio, cruzado
 * con la revisión (estado de cada tarea): ahí mismo se valida que la tarea
 * exista y siga abierta, con una sola ida a Storage (día y revisión a la
 * vez) en lugar de leer todo antes y volver a leerlo para escribir.
 */
export async function cambiarDia(
  admin: Admin,
  plantilla: Plantilla,
  persona: Persona,
  fecha: string,
  cambio: (dia: ArchivoDia, antes: DiaVista) => { error: string } | void,
): Promise<{ error: string } | { dia: ArchivoDia }> {
  const b = await asegurarBucket(admin);
  if (b.error) return { error: b.error };
  return enFila(rutaDia(fecha, persona.id), async () => {
    const [leido, rev] = await Promise.all([leerDia(admin, fecha, persona.id), leerRevision(admin, fecha, persona.id)]);
    if (leido.error || rev.error) return { error: `No se pudo leer tu día: ${leido.error ?? rev.error}. Intenta de nuevo.` };
    const vista = armarDia(plantilla, persona, fecha, leido.dia, rev.revision, fecha);
    const ahora = new Date().toISOString();
    const dia: ArchivoDia = leido.dia ?? {
      version: 1,
      fecha,
      userId: persona.id,
      nombre: persona.name,
      rol: persona.role,
      paginaId: vista.pagina?.id ?? null,
      tareas: [],
      entregas: {},
      completoAvisado: false,
      historial: [{ en: ahora, accion: "abrió el día" }],
      actualizado: ahora,
    };
    // La copia de tareas sigue a la plantilla mientras el día está en curso.
    dia.tareas = vista.tareas.map((x) => {
      const copia: Record<string, unknown> = { ...x };
      delete copia.estado;
      delete copia.entrega;
      delete copia.revision;
      return copia as ArchivoDia["tareas"][number];
    });
    dia.nombre = persona.name;
    dia.rol = persona.role;
    const r = cambio(dia, vista);
    if (r && "error" in r) return r;
    dia.actualizado = ahora;
    if (dia.historial.length > 300) dia.historial = dia.historial.slice(-300);
    const g = await escribirJson(admin, rutaDia(fecha, persona.id), dia);
    cuentasPasadas.delete(claveCuenta(fecha, persona.id));
    return g.error ? { error: g.error } : { dia };
  });
}

export async function cambiarRevision(
  admin: Admin,
  fecha: string,
  userId: string,
  cambio: (rev: ArchivoRevision) => void,
): Promise<{ error: string } | { revision: ArchivoRevision }> {
  const b = await asegurarBucket(admin);
  if (b.error) return { error: b.error };
  return enFila(rutaRevision(fecha, userId), async () => {
    const leido = await leerRevision(admin, fecha, userId);
    if (leido.error) return { error: `No se pudo leer la revisión: ${leido.error}. Intenta de nuevo.` };
    const revision: ArchivoRevision = leido.revision ?? { version: 1, fecha, userId, revisiones: {}, historial: [], actualizado: "" };
    cambio(revision);
    revision.actualizado = new Date().toISOString();
    if (revision.historial.length > 300) revision.historial = revision.historial.slice(-300);
    const g = await escribirJson(admin, rutaRevision(fecha, userId), revision);
    cuentasPasadas.delete(claveCuenta(fecha, userId));
    return g.error ? { error: g.error } : { revision };
  });
}

export async function cargarDia(admin: Admin, plantilla: Plantilla, persona: Persona, fecha: string): Promise<DiaVista> {
  const [d, r] = await Promise.all([leerDia(admin, fecha, persona.id), leerRevision(admin, fecha, persona.id)]);
  return armarDia(plantilla, persona, fecha, d.dia, r.revision);
}

// ------------------------------------------------------------ equipo ----

export async function equipoActivo(admin: Admin): Promise<Persona[]> {
  const { data } = await admin.from("users").select("id, name, role").eq("active", true).order("name");
  return ((data ?? []) as { id: string; name: string; role: UserRole }[]).map((u) => ({ id: u.id, name: u.name, role: u.role }));
}

/** Personas con secuencia asignada en la plantilla. */
export function conSecuencia(plantilla: Plantilla, equipo: Persona[]): Persona[] {
  return equipo.filter((p) => tieneSecuencia(plantilla, p));
}

/** A quién le toca revisar lo de `persona`: su supervisora y el CEO. */
export function supervisoresDe(plantilla: Plantilla, equipo: Persona[], persona: Persona): Persona[] {
  return equipo.filter((q) => q.id !== persona.id && puedeSupervisar(plantilla, q, persona));
}

// ------------------------------------------------------------ semana ----

export type SemanaPersona = {
  persona: Persona;
  dias: { fecha: string; futuro: boolean; conRegistro: boolean; cuenta: Cuenta }[];
  /** Solo días ya transcurridos (hasta hoy). */
  total: Cuenta;
  cumplio: boolean;
};

/**
 * `hasta`: último día que cuenta (por defecto hoy); lo posterior se trata como futuro.
 */
export async function cargarSemana(
  admin: Admin,
  plantilla: Plantilla,
  personas: Persona[],
  lunes: string,
  opciones: { hasta?: string } = {},
): Promise<SemanaPersona[]> {
  const hoy = hoyBogota();
  const tope = opciones.hasta && opciones.hasta < hoy ? opciones.hasta : hoy;
  const fechas = diasDeSemana(lunes);
  return Promise.all(
    personas.map(async (persona) => {
      const dias = await Promise.all(
        fechas.map(async (fecha) => {
          const futuro = fecha > tope;
          // Un día futuro no tiene archivos: se arma con la plantilla y no cuenta.
          if (futuro) {
            const dia = armarDia(plantilla, persona, fecha, null, null, hoy);
            return { fecha, futuro, conRegistro: dia.conRegistro, cuenta: contar(dia.tareas) };
          }
          const clave = claveCuenta(fecha, persona.id);
          const recordado = fecha < hoy ? cuentasPasadas.get(clave) : undefined;
          if (recordado && recordado.hasta > Date.now()) return { fecha, futuro, conRegistro: recordado.conRegistro, cuenta: recordado.cuenta };
          const [d, r] = await Promise.all([leerDia(admin, fecha, persona.id), leerRevision(admin, fecha, persona.id)]);
          const dia = armarDia(plantilla, persona, fecha, d.dia, r.revision);
          const cuenta = contar(dia.tareas);
          // Solo se recuerda un día pasado que se leyó bien.
          if (fecha < hoy && !d.error && !r.error) {
            cuentasPasadas.set(clave, { conRegistro: dia.conRegistro, cuenta, hasta: Date.now() + CUENTA_VIGENCIA_MS });
          }
          return { fecha, futuro, conRegistro: dia.conRegistro, cuenta };
        }),
      );
      const total = sumar(dias.filter((d) => !d.futuro).map((d) => d.cuenta));
      return { persona, dias, total, cumplio: total.total > 0 && total.pct >= plantilla.umbral };
    }),
  );
}

// ------------------------------------------------------------- avisos ----

/**
 * Aviso por la campana y push. Con SEGUIMIENTO_SIN_AVISOS=1 (pruebas
 * locales) no se le manda nada a nadie: solo queda en la consola.
 */
export async function avisar(admin: Admin, userId: string, tipo: NotificationType, titulo: string, enlace = "/seguimiento"): Promise<void> {
  if (process.env.SEGUIMIENTO_SIN_AVISOS === "1") {
    console.log(`[seguimiento] aviso simulado → ${userId} · ${tipo} · ${titulo} · ${enlace}`);
    return;
  }
  try {
    await notify(admin, userId, tipo, titulo.slice(0, 240), enlace);
  } catch {
    // Un aviso que falla no debe romper la acción que lo disparó.
  }
}

async function yaAvisadoHoy(admin: Admin, tipo: NotificationType, prefijo: string): Promise<boolean> {
  if (process.env.SEGUIMIENTO_SIN_AVISOS === "1") return false;
  const desde = new Date(Date.now() - 20 * 3600_000).toISOString();
  const { data } = await admin.from("notifications").select("id").eq("type", tipo).like("title", `${prefijo}%`).gte("created_at", desde).limit(1);
  return !!data?.length;
}

const PREFIJO_PENDIENTES = "Seguimiento diario:";
const PREFIJO_SEMANA = "Seguimiento semanal:";

/**
 * Recordatorio a quien tiene tareas sin entregar o devueltas en `fecha`.
 * `momento` solo cambia el texto: "tarde" (mismo día, pensado para las 5 p. m.)
 * o "manana" (al día siguiente, que es cuando corre hoy el cron diario).
 */
export async function avisarPendientes(admin: Admin, fecha: string, momento: "tarde" | "manana"): Promise<{ avisados: number; omitido?: string }> {
  if (diaSemana(fecha) === 7) return { avisados: 0, omitido: "domingo" };
  if (await yaAvisadoHoy(admin, "recordatorio_ingreso", PREFIJO_PENDIENTES)) return { avisados: 0, omitido: "ya enviado" };
  const plantilla = await leerPlantillaGuardada(admin);
  const personas = conSecuencia(plantilla, await equipoActivo(admin));
  let avisados = 0;
  for (const persona of personas) {
    const c = contar((await cargarDia(admin, plantilla, persona, fecha)).tareas);
    const faltan = c.sinHacer + c.devueltas;
    if (!c.total || !faltan) continue;
    const titulo =
      momento === "tarde"
        ? `${PREFIJO_PENDIENTES} te faltan ${faltan} de ${c.total} tareas de hoy. Súbelas con su evidencia antes de cerrar el día.`
        : `${PREFIJO_PENDIENTES} ayer (${fechaCorta(fecha)}) quedaron ${faltan} de ${c.total} tareas sin entregar. Hoy va la secuencia completa.`;
    await avisar(admin, persona.id, "recordatorio_ingreso", titulo);
    avisados++;
  }
  return { avisados };
}

/**
 * Resumen de la semana (lunes a sábado) para el CEO: quién cumplió y quién no.
 * Con `hasta` es un corte parcial: cuenta solo hasta ese día y lo dice.
 */
export async function resumenSemanalCeo(admin: Admin, lunes: string, hasta?: string): Promise<{ enviados: number; texto: string; omitido?: string }> {
  // El corte del sábado y el cierre no se tapan entre sí: cada uno mira su propio texto.
  if (await yaAvisadoHoy(admin, "recomendacion_ceo", `${PREFIJO_SEMANA} ${hasta ? "corte" : "semana"}`)) return { enviados: 0, texto: "", omitido: "ya enviado" };
  const plantilla = await leerPlantillaGuardada(admin);
  const equipo = await equipoActivo(admin);
  const semana = await cargarSemana(admin, plantilla, conSecuencia(plantilla, equipo), lunes, { hasta });
  if (!semana.length) return { enviados: 0, texto: "", omitido: "nadie tiene secuencia" };
  const partes = semana.map((s) =>
    hasta
      ? `${s.persona.name.split(" ")[0]} ${s.total.pct} % (${s.cumplio ? "va cumpliendo" : "va por debajo"})`
      : `${s.persona.name.split(" ")[0]} ${s.total.pct} % (${s.cumplio ? "cumplió" : "NO cumplió"})`,
  );
  const texto = hasta
    ? `${PREFIJO_SEMANA} corte del ${fechaCorta(lunes)} al ${fechaCorta(hasta)} (falta el sábado) · ${partes.join(" · ")} · meta ${plantilla.umbral} %`
    : `${PREFIJO_SEMANA} semana del ${fechaCorta(lunes)} al ${fechaCorta(sumarDias(lunes, 5))} · ${partes.join(" · ")} · meta ${plantilla.umbral} %`;
  const ceos = equipo.filter((p) => p.role === "ceo");
  for (const ceo of ceos) await avisar(admin, ceo.id, "recomendacion_ceo", texto, `/seguimiento?vista=semana&semana=${lunes}`);
  return { enviados: ceos.length, texto };
}

/**
 * Lo que engancha el cron diario (corre a las 12:00 UTC = 7:00 a. m. Bogotá):
 * de martes a domingo recuerda lo que quedó sin entregar el día anterior; el
 * SÁBADO le manda al CEO el resumen de la semana con corte al viernes (a las
 * 7 a. m. el sábado apenas empieza, por eso no se cuenta), y el lunes el
 * cierre definitivo de lunes a sábado.
 *
 * Va aquí y no como un segundo cron en vercel.json porque no hay certeza de
 * que el plan de Vercel lo admita ni de que CRON_SECRET esté puesto (sin él,
 * /api/cron/seguimiento responde 503). El aviso de las 5 p. m. del mismo día
 * sigue necesitando esa ruta con un programador a esa hora.
 */
export async function tareasDeCronSeguimiento(admin: Admin): Promise<string[]> {
  const hoy = hoyBogota();
  const hechas: string[] = [];
  const ayer = sumarDias(hoy, -1);
  const p = await avisarPendientes(admin, ayer, "manana");
  hechas.push(`seguimiento_pendientes:${p.omitido ?? p.avisados}`);
  if (diaSemana(hoy) === 6) {
    const r = await resumenSemanalCeo(admin, lunesDe(hoy), ayer);
    hechas.push(`seguimiento_semana_sabado:${r.omitido ?? r.enviados}`);
  }
  if (diaSemana(hoy) === 1) {
    const r = await resumenSemanalCeo(admin, lunesDe(ayer));
    hechas.push(`seguimiento_semana:${r.omitido ?? r.enviados}`);
  }
  return hechas;
}
