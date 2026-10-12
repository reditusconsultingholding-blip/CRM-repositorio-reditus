// «Seguimiento diario»: tipos, fechas (America/Bogota), página del día,
// plantilla inicial y cuentas de avance. Sin dependencias de servidor: lo
// usan la página, las acciones y los componentes de cliente.
//
// Dónde se guarda (Supabase Storage, bucket PRIVADO `seguimiento`; no hay
// tablas porque el proyecto no tiene acceso a SQL):
//   plantilla.json                              → la plantilla (solo CEO)
//   dias/<AAAA-MM-DD>/<userId>.json             → lo que entrega la persona (solo ella escribe)
//   revisiones/<AAAA-MM-DD>/<userId>.json       → aprobar / devolver (solo supervisora o CEO escriben)
//   evidencias/<AAAA-MM-DD>/<userId>/<tarea>/…  → capturas y videos
// El archivo de la persona y el de la revisión están separados para que
// quien entrega y quien revisa nunca pisen el mismo archivo.
import datosPaginas from "./seguimiento-paginas.json";
import { ROLE_LABELS, type UserRole } from "./roles";

export const BUCKET_SEGUIMIENTO = "seguimiento";
export const ZONA = "America/Bogota";
export const UMBRAL_DEFECTO = 80;
export const ENLACE_APLICAR = "https://reditusconsulting.org/aplicar";
export const BASE_CLIPS = "https://reditusconsulting.org/aplicar/clips/";
/** citas-a … citas-n, sin la «i» (ese clip no está publicado). */
export const CLIPS_RESENAS = "abcdefghjklmn".split("").map((l) => `citas-${l}.mp4`);
export const ZIP_RESENAS = `${BASE_CLIPS}resenas-reditus.zip`;

export const ROLES: UserRole[] = Object.keys(ROLE_LABELS) as UserRole[];

// ------------------------------------------------------------ fechas ----

/** «Hoy» en Bogotá, como AAAA-MM-DD. */
export function hoyBogota(ahora: Date = new Date()): string {
  // Solo para probar en local un día distinto (p. ej. un domingo no hay secuencia): nunca aplica en producción.
  const prueba = process.env.NODE_ENV !== "production" ? process.env.SEGUIMIENTO_FECHA_PRUEBA : undefined;
  if (prueba && /^\d{4}-\d{2}-\d{2}$/.test(prueba)) return prueba;
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

export function esFecha(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Las fechas son días de calendario: se operan a mediodía UTC para que
 * ningún cambio de zona las corra. */
function aDate(fecha: string): Date {
  return new Date(`${fecha}T12:00:00Z`);
}

export function sumarDias(fecha: string, n: number): string {
  const d = aDate(fecha);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 1 = lunes … 6 = sábado, 7 = domingo. */
export function diaSemana(fecha: string): number {
  return aDate(fecha).getUTCDay() || 7;
}

export function lunesDe(fecha: string): string {
  return sumarDias(fecha, 1 - diaSemana(fecha));
}

/** Lunes a sábado de la semana que empieza en `lunes`. */
export function diasDeSemana(lunes: string): string[] {
  return [0, 1, 2, 3, 4, 5].map((i) => sumarDias(lunes, i));
}

export const DIAS_CORTOS = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const DIAS_LARGOS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(aDate(fecha));
}

export function fechaCorta(fecha: string): string {
  return new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", day: "numeric", month: "short" }).format(aDate(fecha));
}

export function horaBogota(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, hour: "numeric", minute: "2-digit" }).format(d);
}

// ---------------------------------------------------- página del día ----

export type PaginaReditus = {
  id: string;
  nombre: string;
  antes: string;
  despues: string;
  tipo: string;
  rotulo: string;
  nota: string;
  rotacion: boolean;
};

export const PAGINAS = datosPaginas.paginas as PaginaReditus[];
export const PAGINAS_SINCRONIZADAS = datosPaginas.sincronizado;
const BASE_IMAGENES = datosPaginas.imagenes;

export function imagenPagina(id: string, lado: "antes" | "despues", larga = false): string {
  return `${BASE_IMAGENES}ct-${id}-${lado === "antes" ? "a" : "d"}${larga ? "l" : ""}.webp`;
}

export function paginaPorId(id: string | null | undefined): PaginaReditus | null {
  return PAGINAS.find((p) => p.id === id) ?? null;
}

function mcd(a: number, b: number): number {
  return b ? mcd(b, a % b) : a;
}

// Lunes de referencia: el día hábil número 0 de la rotación.
const ORIGEN_ROTACION = "2026-10-12";

/**
 * Página del día: rotación determinista por fecha, la misma para todo el
 * equipo. Cuenta los días hábiles (lunes a sábado) desde el lunes 12-oct-2026
 * y avanza por la lista con un salto fijo (el menor ≥ 7 que no comparte
 * divisores con el total), de modo que pasa por TODAS las páginas antes de
 * repetir y no deja la misma marca varios días seguidos. El domingo no hay.
 * Solo entran las páginas con `rotacion: true` (fuera las «Referencia de
 * mercado», que no son del cliente).
 */
export function paginaDelDia(fecha: string): PaginaReditus | null {
  const lista = PAGINAS.filter((p) => p.rotacion);
  const dia = diaSemana(fecha);
  if (!lista.length || dia === 7) return null;
  const semanas = Math.round((aDate(lunesDe(fecha)).getTime() - aDate(ORIGEN_ROTACION).getTime()) / (7 * 86_400_000));
  const habil = semanas * 6 + (dia - 1);
  let salto = Math.min(7, lista.length);
  while (salto < lista.length && mcd(salto, lista.length) !== 1) salto++;
  if (salto >= lista.length) salto = 1;
  const n = lista.length;
  return lista[(((habil * salto) % n) + n) % n];
}

// --------------------------------------------------------- plantilla ----

export type EnlaceTarea = { rotulo: string; url: string };

export type TareaPlantilla = {
  id: string;
  /** A qué rol le toca. */
  rol: UserRole;
  /** Opcional: solo a esta persona (dentro o fuera del rol). */
  userId: string | null;
  bloque: string;
  titulo: string;
  instrucciones: string;
  /** Exige evidencia (enlace o archivo) para poder marcarla. */
  evidencia: boolean;
  /** Cuántas evidencias pide (p. ej. 3 reseñas → 3). */
  cantidad: number;
  /** Días en que aplica: 1 = lunes … 6 = sábado. */
  dias: number[];
  /** Muestra la página del día (antes y después) dentro de la tarea. */
  paginaDelDia: boolean;
  /** Muestra de dónde sacar las reseñas (clips y zip). */
  resenas: boolean;
  /** No cuenta para el porcentaje (p. ej. Operación, que puede quedar vacía). */
  opcional: boolean;
  enlaces: EnlaceTarea[];
  orden: number;
  activa: boolean;
};

export type Plantilla = {
  version: 1;
  /** Porcentaje mínimo de la semana para «Cumplió». */
  umbral: number;
  /** Quién supervisa a cada rol (además del CEO, que supervisa a todos). */
  supervision: Partial<Record<UserRole, UserRole>>;
  tareas: TareaPlantilla[];
  actualizado: string | null;
  actualizadoPor: string | null;
};

export const TODOS_LOS_DIAS = [1, 2, 3, 4, 5, 6];
export const BLOQUES_SUGERIDOS = ["Contenido del día", "Comercial", "Supervisión", "Operación"];

function t(
  id: string,
  rol: UserRole,
  orden: number,
  bloque: string,
  titulo: string,
  instrucciones: string,
  extra: Partial<TareaPlantilla> = {},
): TareaPlantilla {
  return {
    id,
    rol,
    userId: null,
    bloque,
    titulo,
    instrucciones,
    evidencia: true,
    cantidad: 1,
    dias: TODOS_LOS_DIAS,
    paginaDelDia: false,
    resenas: false,
    opcional: false,
    enlaces: [],
    orden,
    activa: true,
    ...extra,
  };
}

const CONTENIDO = "Contenido del día";

/** Plantilla inicial (la que dictó el CEO). Después se edita desde la app. */
export function plantillaInicial(): Plantilla {
  return {
    version: 1,
    umbral: UMBRAL_DEFECTO,
    supervision: { gerente_comercial: "directora_operativa" },
    actualizado: null,
    actualizadoPor: null,
    tareas: [
      // ---- Ana · gerente comercial ----
      t(
        "ana-proyecto",
        "gerente_comercial",
        1,
        CONTENIDO,
        "Historia 1 · Proyecto de Reditus: antes y después",
        [
          "Publica en historias de Instagram el antes y después de la página del día (la de abajo).",
          "1. Usa el video que grabaste hoy con Valeria. Si todavía no está, sube dos historias: captura del ANTES con el texto «Así estaba» y captura del DESPUÉS con «Así la dejamos en Reditus».",
          "2. Escribe encima el nombre de la marca y una frase corta de qué cambió (ejemplo: «ahora se compra en un toque»).",
          "3. Va de primera: es lo que abre la secuencia del día.",
          "Evidencia: captura de la historia ya publicada.",
        ].join("\n"),
        { paginaDelDia: true },
      ),
      t(
        "ana-resenas",
        "gerente_comercial",
        2,
        CONTENIDO,
        "Historias 2 a 4 · Tres o cuatro reseñas de clientes",
        [
          "Después del proyecto, publica de 3 a 4 reseñas de clientes satisfechos, una por historia.",
          "1. Sácalas de los clips de reseñas (enlaces abajo): descarga el clip o toma la captura.",
          "2. No repitas las de ayer: ve rotando las letras (hoy a, b, c; mañana d, e, f…).",
          "3. Ponle a cada una un texto corto arriba: «Lo que dicen nuestros clientes».",
          "Evidencia: una captura por cada reseña publicada (mínimo 3).",
        ].join("\n"),
        { cantidad: 3, resenas: true },
      ),
      t(
        "ana-cierre",
        "gerente_comercial",
        3,
        CONTENIDO,
        "Historia final · Llamado a la acción: «últimos cupos»",
        [
          "Cierra la secuencia con una historia de llamado a la acción.",
          "1. Texto: «Últimos cupos de este mes para tu página con Reditus».",
          "2. Pega el sticker de enlace con https://reditusconsulting.org/aplicar y el texto «Aplica aquí».",
          "3. Revisa que el enlace abra bien desde tu celular antes de publicar.",
          "Evidencia: captura de la historia publicada donde se vea el sticker del enlace.",
        ].join("\n"),
        { enlaces: [{ rotulo: "Enlace para aplicar", url: ENLACE_APLICAR }] },
      ),
      t(
        "ana-whatsapp",
        "gerente_comercial",
        4,
        CONTENIDO,
        "Estados de WhatsApp · La misma secuencia, en el mismo orden",
        [
          "Sube a los estados de WhatsApp lo mismo que publicaste en Instagram y en el mismo orden:",
          "1. Proyecto (antes y después). 2. Las 3 o 4 reseñas. 3. Cierre «últimos cupos» con el enlace https://reditusconsulting.org/aplicar escrito en el texto del estado.",
          "Evidencia: captura de tus estados donde se vea la secuencia completa publicada.",
        ].join("\n"),
        { enlaces: [{ rotulo: "Enlace para aplicar", url: ENLACE_APLICAR }] },
      ),
      t(
        "ana-prospectos",
        "gerente_comercial",
        5,
        "Comercial",
        "Seguimiento a prospectos",
        [
          "Abre Prospectos y revisa uno por uno los que están sin respuesta o con reunión pendiente.",
          "1. Escríbeles o llámalos hoy. 2. Actualiza el estado de cada uno en el CRM. 3. Deja en la nota de esta tarea a cuántos contactaste y qué respondieron.",
          "No pide archivo: la evidencia es el estado actualizado en Prospectos y tu nota.",
        ].join("\n"),
        { evidencia: false, enlaces: [{ rotulo: "Abrir Prospectos", url: "/prospectos" }] },
      ),
      t(
        "ana-cotizaciones",
        "gerente_comercial",
        6,
        "Comercial",
        "Cotizaciones y cuentas de cobro",
        [
          "Envía las cotizaciones que quedaron pendientes y las cuentas de cobro que vencen hoy o ya vencieron.",
          "Escribe en la nota cuáles enviaste (cliente y valor). Si hoy no había ninguna, escribe «Hoy no había pendientes».",
        ].join("\n"),
        { evidencia: false, enlaces: [{ rotulo: "Abrir Ingresos", url: "/ingresos" }] },
      ),

      // ---- Valeria · directora operativa ----
      t(
        "val-video",
        "directora_operativa",
        1,
        CONTENIDO,
        "Grabar con Ana el antes y después de la página del día",
        [
          "Graben juntas, a primera hora, un video vertical (9:16) de 30 a 45 segundos con la página del día (la de abajo). Estructura fija, 5 tomas:",
          "1. GANCHO (0–3 s): cara a cámara o voz encima de la página: «Así vendía [marca] antes de trabajar con nosotros».",
          "2. ANTES (3–10 s): grabación de pantalla bajando por la página anterior. Señala 2 problemas concretos (se ve genérica, no se entiende la oferta, cuesta encontrar el botón de compra).",
          "3. DESPUÉS (10–22 s): grabación de pantalla bajando por la página nueva, desde arriba hasta el botón de compra, sin saltos.",
          "4. QUÉ CAMBIÓ (22–35 s): tres cambios, uno por frase y con texto en pantalla (ejemplo: «oferta clara arriba», «fotos reales del producto», «compra en un toque»).",
          "5. LLAMADO A LA ACCIÓN (últimos 5 s): «Si quieres una página así para tu tienda, aplica en el enlace. Quedan pocos cupos este mes».",
          "Graba la pantalla desde el celular, con el brillo alto y sin notificaciones. Este video es el que Ana publica hoy.",
          "Evidencia: el video (archivo) o el enlace de Drive.",
        ].join("\n"),
        { paginaDelDia: true },
      ),
      t(
        "val-imagenes",
        "directora_operativa",
        2,
        CONTENIDO,
        "Dos imágenes publicitarias para Reditus",
        [
          "Haz 2 piezas publicitarias de la agencia con IA (formato 4:5 o 9:16).",
          "1. Una con el antes y después de la página del día. 2. Otra de oferta o prueba social: una reseña de cliente o «últimos cupos».",
          "Cada pieza lleva el logo de Reditus, un titular de máximo 8 palabras y el llamado a la acción «Aplica en reditusconsulting.org/aplicar».",
          "Evidencia: sube las 2 imágenes terminadas.",
        ].join("\n"),
        { cantidad: 2, paginaDelDia: true },
      ),
      t(
        "val-tiktok",
        "directora_operativa",
        3,
        CONTENIDO,
        "Subir a TikTok el contenido que Ana publicó hoy",
        [
          "Sube a la cuenta de TikTok de Reditus el video de antes y después que Ana publicó hoy.",
          "1. Descripción: una frase con el resultado + «Aplica en el enlace del perfil». 2. De 3 a 5 etiquetas (#ecommerce #shopify #landingpage #tiendaonline). 3. Revisa que el enlace del perfil lleve a https://reditusconsulting.org/aplicar.",
          "Evidencia: el enlace de la publicación en TikTok.",
        ].join("\n"),
      ),
      t(
        "val-supervisar",
        "directora_operativa",
        4,
        "Supervisión",
        "Supervisar la secuencia de Ana",
        [
          "Abre la pestaña Supervisión y revisa la evidencia de cada tarea de Ana.",
          "Aprueba lo que está bien. Lo que no cumple (falta el enlace, no es la página del día, faltan reseñas), devuélvelo con una nota que diga exactamente qué corregir.",
          "Antes de las 6:00 p. m. no debe quedar nada de Ana sin revisar. Marca esta tarea cuando termines.",
        ].join("\n"),
        { evidencia: false, enlaces: [{ rotulo: "Abrir Supervisión", url: "/seguimiento?vista=supervision" }] },
      ),
      t(
        "val-operacion",
        "directora_operativa",
        5,
        "Operación",
        "Correcciones y entregas de proyectos",
        [
          "Si hoy hay proyectos en curso: revisa las correcciones pendientes en Requerimientos y coordina las entregas del día.",
          "Escribe en la nota qué se entregó o qué quedó pendiente. Si hoy no hay proyectos, déjala sin marcar: no cuenta para tu porcentaje.",
        ].join("\n"),
        { evidencia: false, opcional: true, enlaces: [{ rotulo: "Abrir Requerimientos", url: "/requerimientos" }] },
      ),
    ],
  };
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Solo enlaces https o rutas internas del CRM. */
export function enlaceValido(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > 600) return null;
  if (/^\/[a-z0-9]/i.test(s) && !s.startsWith("//")) return s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Normaliza una plantilla leída de Storage o enviada desde el formulario. */
export function leerPlantilla(raw: unknown): Plantilla {
  const base = plantillaInicial();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const umbral = Number(r.umbral);
  const supervision: Partial<Record<UserRole, UserRole>> = {};
  if (r.supervision && typeof r.supervision === "object") {
    for (const [k, v] of Object.entries(r.supervision as Record<string, unknown>)) {
      if (ROLES.includes(k as UserRole) && ROLES.includes(v as UserRole) && k !== v && k !== "ceo") {
        supervision[k as UserRole] = v as UserRole;
      }
    }
  }
  const ids = new Set<string>();
  const tareas: TareaPlantilla[] = [];
  for (const x of Array.isArray(r.tareas) ? (r.tareas as Record<string, unknown>[]) : []) {
    if (!x || typeof x !== "object") continue;
    const id = texto(x.id, 60).replace(/[^a-zA-Z0-9_-]/g, "");
    const titulo = texto(x.titulo, 160).trim();
    if (!id || ids.has(id) || !titulo || !ROLES.includes(x.rol as UserRole)) continue;
    ids.add(id);
    const dias = Array.isArray(x.dias) ? [...new Set(x.dias.map(Number))].filter((d) => d >= 1 && d <= 6).sort() : TODOS_LOS_DIAS;
    const enlaces: EnlaceTarea[] = [];
    for (const e of Array.isArray(x.enlaces) ? (x.enlaces as Record<string, unknown>[]) : []) {
      const url = enlaceValido(e?.url);
      if (url && enlaces.length < 6) enlaces.push({ rotulo: texto(e.rotulo, 60).trim() || "Abrir enlace", url });
    }
    tareas.push({
      id,
      rol: x.rol as UserRole,
      userId: typeof x.userId === "string" && /^[0-9a-f-]{36}$/i.test(x.userId) ? x.userId : null,
      bloque: texto(x.bloque, 40).trim() || "General",
      titulo,
      instrucciones: texto(x.instrucciones, 4000),
      evidencia: x.evidencia !== false,
      cantidad: Math.min(10, Math.max(1, Math.round(Number(x.cantidad)) || 1)),
      dias,
      paginaDelDia: x.paginaDelDia === true,
      resenas: x.resenas === true,
      opcional: x.opcional === true,
      enlaces,
      orden: Number.isFinite(Number(x.orden)) ? Number(x.orden) : tareas.length + 1,
      activa: x.activa !== false,
    });
  }
  return {
    version: 1,
    umbral: Number.isFinite(umbral) && umbral >= 1 && umbral <= 100 ? Math.round(umbral) : UMBRAL_DEFECTO,
    supervision,
    tareas,
    actualizado: texto(r.actualizado, 40) || null,
    actualizadoPor: texto(r.actualizadoPor, 80) || null,
  };
}

export type Persona = { id: string; name: string; role: UserRole };

/** Tareas de la plantilla que le tocan a una persona en una fecha, en orden. */
export function tareasPara(plantilla: Plantilla, persona: Pick<Persona, "id" | "role">, fecha: string): TareaPlantilla[] {
  const dia = diaSemana(fecha);
  return plantilla.tareas
    .filter((x) => x.activa && x.dias.includes(dia) && (x.userId ? x.userId === persona.id : x.rol === persona.role))
    .sort((a, b) => a.orden - b.orden);
}

/** ¿Tiene secuencia asignada (algún día de la semana)? */
export function tieneSecuencia(plantilla: Plantilla, persona: Pick<Persona, "id" | "role">): boolean {
  return plantilla.tareas.some((x) => x.activa && (x.userId ? x.userId === persona.id : x.rol === persona.role));
}

/** ¿`quien` puede revisar lo que entrega `persona`? */
export function puedeSupervisar(plantilla: Plantilla, quien: Pick<Persona, "id" | "role">, persona: Pick<Persona, "id" | "role">): boolean {
  if (quien.role === "ceo") return true;
  if (quien.id === persona.id) return false;
  return plantilla.supervision[persona.role] === quien.role;
}

// ------------------------------------------------------ día y estado ----

export type Evidencia = {
  id: string;
  tipo: "enlace" | "archivo";
  /** Enlace pegado (Instagram, TikTok, Drive…). */
  url?: string;
  /** Ruta del archivo dentro del bucket privado. */
  path?: string;
  nombre: string;
  creado: string;
};

export type Entrega = {
  hecha: boolean;
  hechaEn: string | null;
  nota: string;
  evidencias: Evidencia[];
};

export type EventoDia = { en: string; accion: string; tareaId?: string; detalle?: string };

/** Archivo de la persona: dias/<fecha>/<userId>.json */
export type ArchivoDia = {
  version: 1;
  fecha: string;
  userId: string;
  nombre: string;
  rol: UserRole;
  paginaId: string | null;
  /** Copia de las tareas tal como estaban ese día (la plantilla puede cambiar después). */
  tareas: TareaPlantilla[];
  entregas: Record<string, Entrega>;
  /** Ya se avisó a la supervisora que completó el día. */
  completoAvisado: boolean;
  historial: EventoDia[];
  actualizado: string;
};

export type Revision = { veredicto: "aprobada" | "devuelta"; nota: string; por: string; porNombre: string; en: string };

/** Archivo de quien supervisa: revisiones/<fecha>/<userId>.json */
export type ArchivoRevision = {
  version: 1;
  fecha: string;
  userId: string;
  revisiones: Record<string, Revision>;
  historial: (Revision & { tareaId: string })[];
  actualizado: string;
};

export type EstadoTarea = "pendiente" | "hecha" | "aprobada" | "devuelta";

export type TareaVista = TareaPlantilla & {
  estado: EstadoTarea;
  entrega: Entrega;
  revision: Revision | null;
};

export type DiaVista = {
  fecha: string;
  userId: string;
  nombre: string;
  rol: UserRole;
  /** false = la persona no abrió ni registró nada ese día. */
  conRegistro: boolean;
  pagina: PaginaReditus | null;
  tareas: TareaVista[];
};

export const ENTREGA_VACIA: Entrega = { hecha: false, hechaEn: null, nota: "", evidencias: [] };

/** Estado de una tarea: lo que entregó la persona cruzado con la última
 * revisión. Una revisión solo vale si es posterior a la última entrega: si
 * la persona vuelve a entregar después de una devolución, queda «hecha»
 * (por revisar) otra vez. */
export function estadoDe(entrega: Entrega | undefined, revision: Revision | undefined | null): EstadoTarea {
  const vigente = !!revision && (!entrega?.hechaEn || revision.en >= entrega.hechaEn);
  if (vigente && revision!.veredicto === "devuelta") return "devuelta";
  if (!entrega?.hecha) return "pendiente";
  if (vigente && revision!.veredicto === "aprobada") return "aprobada";
  return "hecha";
}

/** Arma el día que se muestra. Hoy o a futuro se sigue la plantilla vigente
 * (más lo ya entregado de tareas que salieron de ella); un día pasado con
 * archivo se muestra con la copia de ese día. */
export function armarDia(
  plantilla: Plantilla,
  persona: Persona,
  fecha: string,
  archivo: ArchivoDia | null,
  revision: ArchivoRevision | null,
  hoy: string = hoyBogota(),
): DiaVista {
  let tareas: TareaPlantilla[];
  if (archivo && fecha < hoy) {
    tareas = archivo.tareas;
  } else {
    tareas = tareasPara(plantilla, persona, fecha);
    if (archivo) {
      const ids = new Set(tareas.map((x) => x.id));
      const extra = archivo.tareas.filter((x) => !ids.has(x.id) && (archivo.entregas[x.id]?.hecha || archivo.entregas[x.id]?.evidencias.length));
      tareas = [...tareas, ...extra];
    }
  }
  const pagina = (archivo?.paginaId ? paginaPorId(archivo.paginaId) : null) ?? paginaDelDia(fecha);
  return {
    fecha,
    userId: persona.id,
    nombre: persona.name,
    rol: persona.role,
    conRegistro: !!archivo,
    pagina,
    tareas: tareas.map((x) => {
      const entrega = archivo?.entregas[x.id] ?? ENTREGA_VACIA;
      const rev = revision?.revisiones[x.id] ?? null;
      return { ...x, entrega, revision: rev, estado: estadoDe(entrega, rev) };
    }),
  };
}

export type Cuenta = {
  /** Tareas que cuentan (las opcionales no). */
  total: number;
  /** Entregadas: hechas (por revisar) + aprobadas. */
  cumplidas: number;
  aprobadas: number;
  porRevisar: number;
  devueltas: number;
  sinHacer: number;
  pct: number;
};

export function contar(tareas: Pick<TareaVista, "estado" | "opcional">[]): Cuenta {
  const c: Cuenta = { total: 0, cumplidas: 0, aprobadas: 0, porRevisar: 0, devueltas: 0, sinHacer: 0, pct: 0 };
  for (const x of tareas) {
    if (x.opcional) continue;
    c.total++;
    if (x.estado === "aprobada") c.aprobadas++;
    else if (x.estado === "hecha") c.porRevisar++;
    else if (x.estado === "devuelta") c.devueltas++;
    else c.sinHacer++;
  }
  c.cumplidas = c.aprobadas + c.porRevisar;
  c.pct = c.total ? Math.round((c.cumplidas / c.total) * 100) : 0;
  return c;
}

export function sumar(cuentas: Cuenta[]): Cuenta {
  const c: Cuenta = { total: 0, cumplidas: 0, aprobadas: 0, porRevisar: 0, devueltas: 0, sinHacer: 0, pct: 0 };
  for (const x of cuentas) {
    c.total += x.total;
    c.cumplidas += x.cumplidas;
    c.aprobadas += x.aprobadas;
    c.porRevisar += x.porRevisar;
    c.devueltas += x.devueltas;
    c.sinHacer += x.sinHacer;
  }
  c.pct = c.total ? Math.round((c.cumplidas / c.total) * 100) : 0;
  return c;
}

/** ¿Qué le falta a una tarea para poder marcarse? null = nada. */
export function faltaPara(tarea: Pick<TareaPlantilla, "evidencia" | "cantidad">, entrega: Entrega): string | null {
  if (!tarea.evidencia) return null;
  const n = entrega.evidencias.length;
  if (n >= tarea.cantidad) return null;
  const faltan = tarea.cantidad - n;
  return tarea.cantidad === 1
    ? "Adjunta la evidencia (enlace o archivo) para poder marcarla."
    : `Faltan ${faltan} de ${tarea.cantidad} evidencias para poder marcarla.`;
}

export const MAX_EVIDENCIA_BYTES = 100 * 1024 * 1024;
export const EXT_EVIDENCIA = /\.(png|jpe?g|webp|heic|heif|gif|mp4|mov|m4v|webm|pdf)$/i;
export const ACEPTA_EVIDENCIA = "image/*,video/*,application/pdf";

export function esImagen(nombre: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(nombre);
}
export function esVideo(nombre: string): boolean {
  return /\.(mp4|mov|m4v|webm)$/i.test(nombre);
}
