"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { registrarAprendizaje } from "@/lib/aprendizajes-video-server";
import type { EtapaAprendizaje, OrigenAprendizaje } from "@/lib/aprendizajes-video";
import { TIEMPOS_BASE, type TiemposVideo } from "@/lib/progreso-video";
import { aplicarGancho, buscarGancho, elegirGanchos } from "@/lib/ganchos-video";
import { unstable_rethrow } from "next/navigation";
import { requireProfile, INGRESOS_ROLES, type Profile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarFormato, type FormatoVideo } from "@/lib/video-formatos";
import { VIDEOS_ROLES, enlaceSeguro, leerDatosVideo, versionVigente, type GuionGuardado, type VersionGuion } from "@/lib/videos";
import { ID_VALIDO, escribirGuionArchivo, leerGuionArchivo } from "@/lib/videos-server";
import {
  MAX_FOTOS_PROYECTO,
  TONOS_MUSICA,
  COLOR_HEX,
  leerEdicion,
  anotar,
  leerVoz,
  type TonoMusica,
  vozDePais,
  escenasParaClip,
  escenasParaImagen,
  faltaParaArmar,
  fichaConDatos,
  hayTrabajoEnCurso,
  leerFicha,
  piezaEnCurso,
  piezaNueva,
  sellarFicha,
  textoFicha,
  type EscenaProyecto,
  type FichaProducto,
  type ProyectoVideo,
  type TipoPieza,
} from "@/lib/proyecto-video";
import { enriquecerPlan, heredarProyecto, normalizarPlan, planDeCorreccion, proyectoDeVariacion, type CorreccionProyecto, type PedidoVariacion } from "@/lib/proyecto-video-plan";
import { alDiaYAvanzar, analizarFotosProducto, armarProyecto, avanzar, conCandado, encolarEtapa, marcarEnMarcha, ponerAlDiaProyecto, type AnalisisFotos } from "@/lib/proyecto-video-server";
import { ID_TRABAJO, type EtapaTrabajo, type TrabajoVista } from "@/lib/trabajos-video";
import { cancelarTrabajo, creditosDeHoy, listarTrabajos, servidorVideoActivo, topeDeHoy, type TopeDiario } from "@/lib/trabajos-video-server";
import { leerConfigVideos, type ConfigVideos } from "@/lib/videos-config";
import { escribirConfig, leerConfig } from "@/lib/videos-config-server";

// Acciones del PROYECTO DE VIDEO POR ESCENAS (`lib/proyecto-video.ts`).
//
// Operar (crear el plan, editarlo, pedir imágenes y clips, armar, corregir):
// VIDEOS_ROLES. Aprobar o rechazar imágenes, clips y el video final: CEO,
// gerente comercial y directora operativa. Ninguna lanza errores esperados:
// devuelven `{ error }`. Solo estas acciones escriben el proyecto; el
// trabajador escribe en su trabajo de la cola y aquí se recoge.

type Almacen = ReturnType<typeof createAdminClient>;

/** Quién puede dar el sí o el no a una imagen, a un clip o al video final. */
const APROBAR_ROLES = INGRESOS_ROLES;

export type EstadoProyecto = {
  guardado: GuionGuardado;
  /** Trabajos de la cola que el proyecto tiene abiertos (para mostrar en qué van). */
  trabajos: TrabajoVista[];
  /** Hay servidor de videos conectado (existe SERVIDOR_SECRET). */
  servidorActivo: boolean;
  aviso?: string;
};

async function seguro<T extends object>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err); // deja pasar el redirect a /login de requireProfile
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

/**
 * Una acción que escribe el proyecto: corre con el candado del guion, para no pisarse con el
 * modo directo (que también lo escribe cuando el servidor cierra un trabajo).
 */
async function bajoCandado<T extends object>(id: string, fn: () => Promise<T | { error: string }>): Promise<T | { error: string }> {
  return seguro<T | { error: string }>(async () => {
    if (typeof id !== "string" || !ID_VALIDO.test(id)) return { error: "Guion inválido." };
    const r = await conCandado(createAdminClient(), id, 12_000, fn);
    return r ?? { error: "El proyecto está avanzando solo en este momento (revisión automática o encolado). Espera unos segundos y vuelve a intentarlo." };
  });
}

type Abierto = { profile: Profile; admin: Almacen; g: GuionGuardado; formato: FormatoVideo; version: VersionGuion; trabajos: TrabajoVista[] };

/** Valida a quien llama y trae el guion AL DÍA con lo que reportó el trabajador. */
async function abrir(id: string, escribir = true): Promise<Abierto | { error: string }> {
  const profile = await requireProfile();
  if (!VIDEOS_ROLES.includes(profile.role)) return { error: "No tienes permiso para hacer esto." };
  if (typeof id !== "string" || !ID_VALIDO.test(id)) return { error: "Guion inválido." };
  const admin = createAdminClient();
  const leido = await leerGuionArchivo(admin, id);
  if (!leido) return { error: "No se encontró el guion." };
  const formato = buscarFormato(leido.formato);
  if (!formato) return { error: "El formato de este guion ya no existe en la biblioteca." };
  const alDia = await ponerAlDiaProyecto(admin, leido, escribir);
  const version = versionVigente(alDia.g);
  if (!version) return { error: "Este guion no tiene versiones." };
  return { profile, admin, g: alDia.g, formato, version, trabajos: alDia.trabajos };
}

type ConProyecto = Abierto & { p: ProyectoVideo };

/**
 * Lo que el dueño o la directora operativa escriben al rechazar o corregir queda como
 * aprendizaje del formato (se condensa después de responder: no demora la acción).
 */
function aprender(x: Abierto, nota: string, etapa: EtapaAprendizaje, origen: OrigenAprendizaje) {
  if (!["ceo", "directora_operativa"].includes(x.profile.role) || nota.trim().length < 12) return;
  const pedido = { nota, quien: { id: x.profile.id, nombre: x.profile.name }, guionId: x.g.id, producto: x.g.producto, formato: x.g.formato, etapa, general: false, origen };
  after(async () => {
    await registrarAprendizaje(x.admin, pedido).catch(() => null);
  });
}

/** Como `abrir`, pero exige que la versión vigente ya sea un proyecto. `p` es una copia que se puede modificar. */
async function abrirProyecto(id: string): Promise<ConProyecto | { error: string }> {
  const x = await abrir(id);
  if ("error" in x) return x;
  if (!x.version.proyecto) return { error: "Esta versión del guion todavía no es un proyecto por escenas: conviértela primero." };
  const p = structuredClone(x.version.proyecto);
  // El tope de intentos vigente es el de la configuración del CEO.
  p.topeIntentos = (await leerConfig(x.admin)).intentosPorEscena;
  return { ...x, p };
}

const contexto = (x: Abierto) => ({ admin: x.admin, g: x.g, versionN: x.version.n, formato: x.formato, quien: { id: x.profile.id, nombre: x.profile.name } });

/** Guarda el proyecto en su versión y devuelve el estado para la pantalla. */
async function guardar(x: Abierto, p: ProyectoVideo, aviso?: string, extra?: Partial<VersionGuion>, revalidar = false): Promise<EstadoProyecto | { error: string }> {
  // Modo directo: después de lo que hizo la persona, el proyecto sigue solo hasta donde pueda.
  if (p.auto.activo) await avanzar(contexto(x), p);
  const ahora = new Date().toISOString();
  const g: GuionGuardado = { ...x.g, versiones: x.g.versiones.map((v) => (v.n === x.version.n ? { ...v, ...extra, proyecto: p } : v)), actualizadoAt: ahora };
  const w = await escribirGuionArchivo(x.admin, g);
  if (w.error) return { error: w.error };
  // En modo directo queda una marca mientras espera al servidor: así se retoma aunque nadie mire.
  if (p.auto.activo) await marcarEnMarcha(x.admin, g.id, hayTrabajoEnCurso(p));
  if (revalidar) revalidatePath("/videos");
  // Tras encolar, la pantalla necesita ver los trabajos nuevos.
  const alDia = p.trabajosAbiertos.length ? await ponerAlDiaProyecto(x.admin, g) : { g, trabajos: [] as TrabajoVista[] };
  return { guardado: alDia.g, trabajos: alDia.trabajos, servidorActivo: servidorVideoActivo(), aviso };
}

const estado = (x: Abierto, aviso?: string): EstadoProyecto => ({ guardado: x.g, trabajos: x.trabajos, servidorActivo: servidorVideoActivo(), aviso });

function leerFotos(raw: unknown): string[] {
  return [...new Set((Array.isArray(raw) ? raw : []).filter((u): u is string => typeof u === "string" && u.startsWith("https://")).map((u) => u.trim().slice(0, 600)))].slice(0, MAX_FOTOS_PROYECTO);
}

/** La música es un enlace https (lo descarga el servidor de videos). Devuelve el motivo si no sirve. */
function musicaInvalida(m: string | null | undefined): string | null {
  if (!m) return null;
  return enlaceSeguro(m)?.startsWith("https://") ? null : "La música debe ser un enlace https a un archivo de audio (o déjala vacía para no poner música).";
}

/** El video armado deja de ser el vigente: algo cambió y hay que volver a armar. */
function finalPorRehacer(p: ProyectoVideo) {
  if (p.final.estado === "por-aprobar" || p.final.estado === "aprobada" || p.final.estado === "fallo") p.final.estado = "pendiente";
}

// ------------------------------------------------ fotos del producto ----

/** Mira las fotos con la IA de visión y propone la ficha. Nunca falla: sin IA devuelve la ficha como estaba y el aviso. */
export async function analizarFotos(raw: unknown): Promise<AnalisisFotos | { error: string }> {
  return seguro(async () => {
    const profile = await requireProfile();
    if (!VIDEOS_ROLES.includes(profile.role)) return { error: "No tienes permiso para hacer esto." };
    const datos = leerDatosVideo(raw);
    return analizarFotosProducto(datos.fotosProducto, datos, datos.fichaProducto);
  });
}

// ----------------------------------------------------- crear el plan ----

export type PedidoProyecto = {
  fotos: unknown;
  ficha: unknown;
  /** Rehace el plan aunque la versión ya tenga proyecto (pierde las piezas; el costo gastado se conserva). */
  reemplazar?: boolean;
  /** Trae el proyecto de otra versión del mismo guion, con todo lo ya aprobado. */
  heredarDe?: number;
  /** Modo directo desde el principio («Generar todo» y lotes): avanza solo hasta «Video por aprobar». */
  directo?: boolean;
};

/**
 * Convierte la versión vigente del guion en un proyecto por escenas: guarda
 * las fotos y la ficha confirmada, y propone el plan (IA; si no está, la
 * plantilla del formato). No encola nada.
 */
export async function crearProyecto(id: string, pedido: PedidoProyecto): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrir(id);
    if ("error" in x) return x;
    const previo = x.version.proyecto;
    if (previo && !pedido?.reemplazar) return { error: "Esta versión ya tiene su proyecto por escenas." };
    if (previo && hayTrabajoEnCurso(previo)) return { error: "Hay imágenes, clips o un armado en proceso: espera a que terminen antes de rehacer el plan." };

    const fotos = leerFotos(pedido?.fotos);
    if (!fotos.length) return { error: "Sube al menos una foto real del producto (lo ideal son dos): las escenas de producto y el cierre se hacen con ellas, sin generar nada." };
    if (!x.g.oferta.trim() || !x.g.llamado.trim()) return { error: "Faltan la oferta y el llamado a la acción en los datos del guion: el cierre los lleva siempre y no se inventan." };

    const cruda = leerFicha(pedido?.ficha);
    if (fichaConDatos(cruda) && !cruda.confirmado) return { error: "Confirma o corrige el análisis de las fotos antes de seguir: lo que diga la ficha es lo que saldrá en pantalla." };
    const ahora = new Date().toISOString();
    const ficha: FichaProducto = sellarFicha(cruda, x.g.fichaProducto, { id: x.profile.id, nombre: x.profile.name }, ahora);

    const contexto = {
      producto: x.g.producto,
      pais: x.g.pais,
      fotos,
      analisisProducto: textoFicha(ficha),
      cierre: { oferta: x.g.oferta, llamadoALaAccion: x.g.llamado },
      voz: previo?.contexto.voz ?? vozDePais(x.g.pais),
    };
    const g: GuionGuardado = { ...x.g, fotosProducto: fotos, fichaProducto: ficha };

    const origen = typeof pedido?.heredarDe === "number" ? g.versiones.find((v) => v.n === pedido.heredarDe && v.n !== x.version.n) : undefined;
    let p: ProyectoVideo;
    if (origen?.proyecto) {
      const h = heredarProyecto(origen.proyecto, origen.guion, x.version.guion, contexto);
      p = { ...h.proyecto, avisos: [`Proyecto traído de la v${origen.n}: lo aprobado se conserva.`, ...h.avisos].slice(0, 8) };
    } else {
      p = await armarProyecto({ admin: x.admin, g, version: x.version, formato: x.formato, fotos, ficha, directo: pedido?.directo === true, quien: x.profile.name, previo });
    }
    return guardar({ ...x, g }, p, undefined, undefined, true);
  });
}

// --------------------------------------------------------- consultar ----

/** Cómo va el proyecto. La pantalla la llama cada pocos segundos mientras hay algo en proceso. */
export async function consultarProyecto(id: string): Promise<EstadoProyecto | { error: string }> {
  return seguro(async () => {
    // Sin candado: solo lee. Lo que haya que guardar se guarda dentro del candado, más abajo.
    const x = await abrir(id, false);
    if ("error" in x) return x;
    // Modo directo: la consulta también empuja (revisión con IA de lo recién llegado, etapa siguiente).
    const p0 = x.version.proyecto;
    if (p0?.auto.activo && !hayTrabajoEnCurso(p0)) {
      // Si otro ya lo está empujando (el servidor acaba de cerrar un trabajo), aquí solo se muestra.
      const r = await conCandado(x.admin, x.g.id, 0, async () => {
        const fresco = await leerGuionArchivo(x.admin, x.g.id);
        return fresco ? alDiaYAvanzar(x.admin, fresco, { id: x.profile.id, nombre: x.profile.name }) : null;
      });
      if (r) return { guardado: r.g, trabajos: r.trabajos.length ? r.trabajos : x.trabajos, servidorActivo: servidorVideoActivo() };
      return estado(x);
    }
    // Sin modo directo: lo que reportó el servidor se guarda aquí (bajo candado; si está ocupado, en la próxima consulta).
    const guardado = await conCandado(x.admin, x.g.id, 0, async () => {
      const fresco = await leerGuionArchivo(x.admin, x.g.id);
      return fresco ? ponerAlDiaProyecto(x.admin, fresco) : null;
    });
    if (guardado) return { guardado: guardado.g, trabajos: guardado.trabajos.length ? guardado.trabajos : x.trabajos, servidorActivo: servidorVideoActivo() };
    return estado(x);
  });
}

// ----------------------------------------------------- editar el plan ----

export type PlanEditado = {
  escenas: unknown;
  opciones?: { subtitulos?: unknown; voz?: unknown; musica?: unknown; modelo?: unknown };
  /** La voz del proyecto: motor, acento y descripción fija. */
  vozProyecto?: unknown;
  /** Tono de la música: neutro, energia, suspenso o emotivo. */
  tonoMusica?: unknown;
};

/**
 * Guarda el plan editado: textos, prompts, duración, tipo, foto, orden,
 * escenas nuevas o quitadas. Las piezas ya generadas de cada escena se
 * conservan (se reconocen por su número anterior). No encola nada.
 */
export async function guardarPlan(id: string, plan: PlanEditado): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    const { p } = x;
    if (hayTrabajoEnCurso(p)) return { error: "Hay algo generándose: espera a que termine para cambiar el plan (así ninguna pieza queda sin dueño)." };
    const crudas = (Array.isArray(plan?.escenas) ? plan.escenas : []).map((r) => {
      const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
      const anterior = p.escenas.find((e) => e.n === o.n);
      // Las piezas salen de lo guardado, nunca de lo que mande la pantalla.
      return { ...o, imagen: anterior ? anterior.imagen : piezaNueva(), clip: anterior ? anterior.clip : piezaNueva() };
    });
    if (!crudas.length) return { error: "El plan no puede quedar sin escenas." };
    const n = normalizarPlan(crudas, { guion: x.version.guion, formato: x.formato, fotos: p.contexto.fotos, fichaTexto: p.contexto.analisisProducto, producto: p.contexto.producto, voz: plan?.vozProyecto && typeof plan.vozProyecto === "object" ? leerVoz(plan.vozProyecto, p.contexto.pais) : p.contexto.voz }, { verificarVoz: false });
    const huella = (e: EscenaProyecto[]) => JSON.stringify(e.map((s) => [s.tipo, s.duracion, s.voz, s.fotoUrl, s.movimiento, s.imagen.url, s.clip.url]));
    const cambioElVideo = huella(n.escenas) !== huella(p.escenas);
    p.escenas = n.escenas;
    const op = plan?.opciones;
    if (op) {
      const modelo = typeof op.modelo === "string" ? op.modelo.trim().slice(0, 160) : (p.opciones.modelo ?? "");
      if (modelo && !/^[\w.\-/]+$/.test(modelo)) return { error: "El modelo solo puede llevar letras, números, puntos, guiones y barras." };
      const musica = typeof op.musica === "string" ? op.musica.trim().slice(0, 600) : op.musica === null ? "" : (p.opciones.musica ?? "");
      const malaMusica = musicaInvalida(musica);
      if (malaMusica) return { error: malaMusica };
      const antes = JSON.stringify(p.opciones);
      p.opciones = {
        subtitulos: typeof op.subtitulos === "boolean" ? op.subtitulos : p.opciones.subtitulos,
        voz: typeof op.voz === "boolean" ? op.voz : p.opciones.voz,
        musica: musica || null,
        modelo: modelo || null,
      };
      if (JSON.stringify(p.opciones) !== antes) finalPorRehacer(p);
    }
    if ((TONOS_MUSICA as readonly string[]).includes(plan?.tonoMusica as string) && plan.tonoMusica !== p.tonoMusica) {
      p.tonoMusica = plan.tonoMusica as TonoMusica;
      finalPorRehacer(p);
    }
    if (plan?.vozProyecto && typeof plan.vozProyecto === "object") {
      const nueva = leerVoz(plan.vozProyecto, p.contexto.pais);
      if (JSON.stringify(nueva) !== JSON.stringify(p.contexto.voz)) {
        p.contexto.voz = nueva;
        anotar(p, `Voz del proyecto cambiada por ${x.profile.name}: ${nueva.motor === "clip" ? "la del clip" : "narración aparte"}, ${nueva.acento}.`);
      }
    }
    if (cambioElVideo) finalPorRehacer(p);
    anotar(p, `Plan editado por ${x.profile.name}: ${p.escenas.length} escenas.`);
    return guardar(x, p, n.avisos.length ? n.avisos.join(" ") : undefined);
  });
}

// ------------------------------------------------------------ encolar ----

/** Encola una etapa (ver `encolarEtapa`). Modifica `x.p`. Devuelve el motivo si no se pudo. */
async function encolar(x: ConProyecto, etapa: EtapaTrabajo, escenas: EscenaProyecto[]): Promise<string | null> {
  const r = await encolarEtapa(contexto(x), x.p, etapa, escenas);
  if (!r) x.p.auto.parada = null;
  return r?.error ?? null;
}

/** Si el guion no se pudo guardar tras encolar, el trabajo no debe quedar huérfano en la cola. */
async function guardarTrasEncolar(x: ConProyecto, antes: string[], aviso?: string): Promise<EstadoProyecto | { error: string }> {
  const r = await guardar(x, x.p, aviso);
  if ("error" in r) {
    for (const idTrabajo of x.p.trabajosAbiertos.filter((t) => !antes.includes(t))) await cancelarTrabajo(x.admin, idTrabajo, "el sistema (no se pudo guardar el proyecto)");
  }
  return r;
}

/**
 * Pide una etapa:
 *  · `imagenes`: las escenas generadas que no tienen imagen (o se rechazó o falló);
 *  · `clips`: SOLO las escenas con imagen aprobada que no tienen clip;
 *  · `armado`: cuando todos los clips están aprobados. No cuesta ni cuenta para el tope diario.
 */
export async function pedirEtapa(id: string, etapa: EtapaTrabajo): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    const { p } = x;
    const antes = [...p.trabajosAbiertos];
    let escenas: EscenaProyecto[] = [];
    if (etapa === "imagenes") {
      escenas = escenasParaImagen(p);
      if (!escenas.length) return { error: "No hay imágenes por generar: ya están hechas, en proceso o llegaron al tope de intentos." };
    } else if (etapa === "clips") {
      escenas = escenasParaClip(p);
      if (!escenas.length) return { error: "No hay clips por generar: solo se generan de imágenes aprobadas, y los que faltan ya están en proceso o en el tope de intentos." };
    } else if (etapa === "armado") {
      if (hayTrabajoEnCurso(p)) return { error: "Hay algo en proceso: espera a que termine para armar." };
      const falta = faltaParaArmar(p);
      if (falta.length) return { error: `Todavía no se puede armar: falta ${falta.slice(0, 4).join(", ")}${falta.length > 4 ? "…" : ""}.` };
    } else return { error: "Etapa inválida." };
    const error = await encolar(x, etapa, escenas);
    if (error) return { error };
    return guardarTrasEncolar(x, antes);
  });
}

/** Regenera UNA pieza (imagen o clip) de una escena, con la nota de qué corregir. Cuenta como intento. */
export async function regenerarPieza(id: string, n: number, tipo: TipoPieza, nota: string): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    const { p } = x;
    const antes = [...p.trabajosAbiertos];
    const campo: TipoPieza = tipo === "clip" ? "clip" : "imagen";
    const e = p.escenas.find((s) => s.n === n);
    if (!e || e.tipo !== "generada") return { error: "Esa escena no se genera: es de foto real." };
    if (piezaEnCurso(e.imagen) || piezaEnCurso(e.clip)) return { error: "Esa escena ya se está generando." };
    if (p.final.estado === "en-cola" || p.final.estado === "generando") return { error: "El video se está armando: espera a que termine." };
    if (campo === "clip" && (e.imagen.estado !== "aprobada" || !e.imagen.url)) return { error: "No se genera el clip sin la imagen aprobada." };
    const limpia = String(nota ?? "").trim().slice(0, 600);
    e[campo] = { ...e[campo], nota: limpia || e[campo].nota };
    const error = await encolar(x, campo === "imagen" ? "imagenes" : "clips", [e]);
    if (error) return { error };
    if (limpia) aprender(x, limpia, campo === "imagen" ? "imagen" : "clip", "rechazo");
    return guardarTrasEncolar(x, antes);
  });
}

/** Cancela un trabajo del proyecto que el servidor todavía no tomó. El intento no se cuenta. */
export async function cancelarTrabajoProyecto(id: string, trabajoId: string): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    const { p } = x;
    if (!ID_TRABAJO.test(String(trabajoId)) || !p.trabajosAbiertos.includes(trabajoId)) return { error: "Ese trabajo no es de este proyecto o ya terminó." };
    const r = await cancelarTrabajo(x.admin, trabajoId, x.profile.name);
    if ("error" in r) return r;
    const soltar = (pieza: EscenaProyecto["imagen"]) =>
      pieza.trabajoId === trabajoId && piezaEnCurso(pieza)
        ? { ...pieza, estado: pieza.url ? ("rechazada" as const) : ("pendiente" as const), intentos: Math.max(0, pieza.intentos - 1), trabajoId: null }
        : pieza;
    p.escenas = p.escenas.map((e) => ({ ...e, imagen: soltar(e.imagen), clip: soltar(e.clip) }));
    if (p.final.trabajoId === trabajoId) p.final = { ...p.final, estado: "pendiente", trabajoId: null, armados: Math.max(0, p.final.armados - 1) };
    p.trabajosAbiertos = p.trabajosAbiertos.filter((t) => t !== trabajoId);
    // Cancelar es querer parar: el modo directo queda en pausa (si no, lo volvería a encolar enseguida).
    const pausado = p.auto.activo;
    p.auto = { ...p.auto, activo: false, parada: null };
    return guardar(x, p, pausado ? "Cancelado. El modo directo quedó en pausa: enciéndelo de nuevo o sigue a mano." : undefined);
  });
}

// ------------------------------------------------------------ revisar ----

export type Decision = "aprobar" | "rechazar";

/** El sí o el no de una persona a una imagen o a un clip. Rechazar exige decir por qué. */
export async function revisarPieza(id: string, n: number, tipo: TipoPieza, decision: Decision, nota?: string): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    if (!APROBAR_ROLES.includes(x.profile.role)) return { error: "Solo el CEO, el gerente comercial o la directora operativa pueden aprobar o rechazar." };
    const { p } = x;
    const campo: TipoPieza = tipo === "clip" ? "clip" : "imagen";
    const e = p.escenas.find((s) => s.n === n);
    if (!e || e.tipo !== "generada") return { error: "Esa escena no tiene piezas generadas." };
    const pieza = e[campo];
    if (decision === "aprobar") {
      if (pieza.estado === "aprobada") return estado(x);
      if (pieza.estado !== "por-aprobar" || !pieza.url) return { error: "Esa pieza no está por aprobar." };
      e[campo] = { ...pieza, estado: "aprobada", nota: "", revisadaPor: x.profile.name };
      anotar(p, `Escena ${e.n}: ${campo === "imagen" ? "imagen aprobada" : "clip aprobado"} por ${x.profile.name}.`);
    } else {
      if (pieza.estado !== "por-aprobar" && pieza.estado !== "aprobada") return { error: "Esa pieza no se puede rechazar ahora." };
      if (campo === "imagen" && piezaEnCurso(e.clip)) return { error: "El clip de esa escena se está generando: espera a que termine." };
      const limpia = String(nota ?? "").trim().slice(0, 600);
      if (!limpia) return { error: "Escribe qué está mal: esa nota es la que recibe el generador al regenerar." };
      e[campo] = { ...pieza, estado: "rechazada", nota: limpia, revisadaPor: x.profile.name };
      anotar(p, `Escena ${e.n}: ${campo === "imagen" ? "imagen rechazada" : "clip rechazado"} por ${x.profile.name}: ${limpia}`);
      aprender(x, limpia, campo === "imagen" ? "imagen" : "clip", "rechazo");
      // Sin imagen válida, el clip que salió de ella tampoco vale.
      if (campo === "imagen" && e.clip.url) e.clip = { ...e.clip, estado: "pendiente", url: null, trabajoId: null, revisadaPor: "" };
      finalPorRehacer(p);
    }
    return guardar(x, p);
  });
}

/** Aprueba varias piezas de una vez. La pantalla solo lo ofrece después de haberlas visto todas. */
export async function aprobarPiezas(id: string, tipo: TipoPieza, ns: number[]): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    if (!APROBAR_ROLES.includes(x.profile.role)) return { error: "Solo el CEO, el gerente comercial o la directora operativa pueden aprobar." };
    const { p } = x;
    const campo: TipoPieza = tipo === "clip" ? "clip" : "imagen";
    const pedidas = new Set((Array.isArray(ns) ? ns : []).filter((v) => typeof v === "number"));
    let hechas = 0;
    p.escenas = p.escenas.map((e) => {
      if (!pedidas.has(e.n) || e.tipo !== "generada" || e[campo].estado !== "por-aprobar" || !e[campo].url) return e;
      hechas++;
      return { ...e, [campo]: { ...e[campo], estado: "aprobada" as const, nota: "", revisadaPor: x.profile.name } };
    });
    if (!hechas) return { error: "No había nada por aprobar." };
    return guardar(x, p);
  });
}

/** Solo el CEO: vuelve a cero los intentos de una pieza que llegó al tope. */
export async function reabrirIntentos(id: string, n: number, tipo: TipoPieza): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    if (x.profile.role !== "ceo") return { error: "Solo el CEO puede reabrir los intentos de una escena." };
    const campo: TipoPieza = tipo === "clip" ? "clip" : "imagen";
    const e = x.p.escenas.find((s) => s.n === n);
    if (!e || e.tipo !== "generada") return { error: "Esa escena no tiene piezas generadas." };
    if (piezaEnCurso(e[campo])) return { error: "Esa pieza se está generando." };
    e[campo] = { ...e[campo], intentos: 0 };
    return guardar(x, x.p);
  });
}

// ----------------------------------------------------------- corregir ----

/**
 * «Corregir»: aplica lo marcado rehaciendo SOLO lo necesario (ver
 * `planDeCorreccion`). Lo que es de armado (texto, subtítulo, oferta, música,
 * foto real) se arma de inmediato y no cuesta; una imagen o un clip se manda
 * a generar y el armado espera a que una persona apruebe lo nuevo.
 */
export async function corregirProyecto(id: string, correccion: CorreccionProyecto): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    const { p } = x;
    if (p.final.estado === "en-cola" || p.final.estado === "generando") return { error: "El video se está armando: espera a que termine para corregir." };
    const lst = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v.slice(0, 40) : []);
    const s = (v: unknown, max: number) => (typeof v === "string" ? v : "").trim().slice(0, max);
    const c: CorreccionProyecto = {
      textos: lst(correccion?.textos).map((t) => ({ n: Number(t?.n), voz: s(t?.voz, 1200) })),
      oferta: typeof correccion?.oferta === "string" ? s(correccion.oferta, 400) : null,
      llamado: typeof correccion?.llamado === "string" ? s(correccion.llamado, 200) : null,
      ...(correccion?.musica !== undefined ? { musica: s(correccion.musica, 600) || null } : {}),
      ...(typeof correccion?.subtitulos === "boolean" ? { subtitulos: correccion.subtitulos } : {}),
      fotos: lst(correccion?.fotos).map((f) => ({
        n: Number(f?.n),
        ...(typeof f?.fotoUrl === "string" ? { fotoUrl: f.fotoUrl } : {}),
        ...(f?.movimiento ? { movimiento: f.movimiento } : {}),
        ...(typeof f?.duracion === "number" ? { duracion: Math.min(10, Math.max(2, Math.round(f.duracion))) } : {}),
      })),
      clips: lst(correccion?.clips).map((k) => ({ n: Number(k?.n), nota: s(k?.nota, 600) })),
      imagenes: lst(correccion?.imagenes).map((k) => ({ n: Number(k?.n), nota: s(k?.nota, 600) })),
    };
    const malaMusica = musicaInvalida(c.musica);
    if (malaMusica) return { error: malaMusica };
    const plan = planDeCorreccion(p, c);
    if (plan.bloqueos.length) return { error: plan.bloqueos.join(" ") };
    if (plan.vacio) return { error: "No marcaste ningún cambio." };
    const antes = [...p.trabajosAbiertos];
    for (const k of c.imagenes) if (k.nota) aprender(x, k.nota, "imagen", "correccion");
    for (const k of c.clips) if (k.nota) aprender(x, k.nota, "clip", "correccion");

    // 1) Lo que solo es de armado se escribe en el proyecto.
    p.escenas = p.escenas.map((e) => {
      const t = c.textos.find((y) => y.n === e.n);
      const f = e.tipo !== "generada" ? c.fotos.find((y) => y.n === e.n) : undefined;
      return {
        ...e,
        voz: t ? t.voz : e.voz,
        fotoUrl: f?.fotoUrl ?? e.fotoUrl,
        movimiento: f?.movimiento ?? e.movimiento,
        duracion: f?.duracion ?? e.duracion,
      };
    });
    if (c.oferta !== null && c.oferta !== p.contexto.cierre.oferta) {
      // Oferta nueva: el titular y el detalle del cierre vuelven a salir de ella.
      p.contexto.cierre = { oferta: c.oferta, llamadoALaAccion: p.contexto.cierre.llamadoALaAccion, ...(p.contexto.cierre.color ? { color: p.contexto.cierre.color } : {}) };
    }
    if (c.llamado !== null) p.contexto.cierre.llamadoALaAccion = c.llamado;
    if (c.musica !== undefined) p.opciones.musica = c.musica;
    if (c.subtitulos !== undefined) p.opciones.subtitulos = c.subtitulos;
    finalPorRehacer(p);

    // 2) Lo que hay que generar: solo esas escenas, con su nota.
    const conNota = (ns: number[], campo: TipoPieza, notas: { n: number; nota: string }[]) =>
      p.escenas
        .filter((e) => ns.includes(e.n))
        .map((e) => {
          e[campo] = { ...e[campo], nota: notas.find((y) => y.n === e.n)?.nota ?? e[campo].nota };
          return e;
        });
    // Una corrección la manda una persona: lo regenerado vuelve a ella, no se «regenera solo» otra vez.
    if (plan.imagenes.length) {
      const error = await encolar(x, "imagenes", conNota(plan.imagenes, "imagen", c.imagenes));
      if (error) return { error };
    }
    if (plan.clips.length) {
      const error = await encolar(x, "clips", conNota(plan.clips, "clip", c.clips));
      if (error) return { error: plan.imagenes.length ? `${error} (La imagen sí quedó en cola.)` : error };
    }
    // 3) Si nada quedó esperando, se arma ya. Armar no cuesta.
    let aviso = "Corrección en marcha: cuando apruebes lo regenerado, pulsa «Armar video».";
    if (plan.armarYa) {
      const falta = faltaParaArmar(p);
      if (falta.length) aviso = "Cambios guardados. Se armará cuando todas las escenas estén aprobadas.";
      else {
        const error = await encolar(x, "armado", []);
        aviso = error ? `Cambios guardados, pero el armado no se pudo pedir: ${error}` : "Cambios guardados y armado en cola: no se regeneró ninguna escena.";
      }
    }
    return guardarTrasEncolar(x, antes, aviso);
  });
}

// ------------------------------------------------------- modo directo ----

export type AjustesAuto = { activo?: boolean; imagenes?: boolean; exigencia?: string; armarDirecto?: boolean };

/** Interruptores del proyecto: modo directo, aprobación automática de imágenes, exigencia y armar al terminar los clips. */
export async function ajustarAuto(id: string, ajustes: AjustesAuto): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    const { p } = x;
    const b = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
    p.auto = {
      activo: b(ajustes?.activo, p.auto.activo),
      imagenes: b(ajustes?.imagenes, p.auto.imagenes),
      exigencia: ajustes?.exigencia === "normal" ? "normal" : ajustes?.exigencia === "estricto" ? "estricto" : p.auto.exigencia,
      armarDirecto: b(ajustes?.armarDirecto, p.auto.armarDirecto),
      parada: ajustes?.activo === true ? null : p.auto.parada,
    };
    return guardar(x, p);
  });
}

/** «Seguir»: la persona ya resolvió lo que detuvo al proyecto. Enciende el modo directo y avanza. */
export async function seguirProyecto(id: string): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    const { p } = x;
    if (p.final.estado === "fallo") p.final = { ...p.final, estado: "pendiente" };
    p.auto = { ...p.auto, activo: true, parada: null };
    const r = await guardar(x, p);
    if ("error" in r) return r;
    const parada = versionVigente(r.guardado)?.proyecto?.auto.parada;
    return { ...r, aviso: parada ? undefined : "El proyecto sigue solo: se detiene únicamente si hace falta una persona." };
  });
}

// --------------------------------------------------------- variaciones ----

export type VariacionesCreadas = EstadoProyecto & { variaciones: GuionGuardado[] };

/**
 * «Crear variaciones»: N proyectos hijos que cambian SOLO el gancho (escena 1)
 * y/o el cierre, y reutilizan todo lo demás ya aprobado sin volver a pagarlo.
 * Cada hijo es un guion nuevo en modo directo: encola únicamente lo nuevo y
 * su armado. Si el tope diario de variaciones no alcanza, las que sobran
 * quedan detenidas «en espera para mañana».
 */
export async function crearVariaciones(id: string, pedidos: PedidoVariacion[]): Promise<VariacionesCreadas | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    const { p } = x;
    if (hayTrabajoEnCurso(p)) return { error: "Espera a que termine lo que se está generando antes de crear variaciones." };
    const falta = faltaParaArmar({ ...p, auto: { ...p.auto, armarDirecto: true } });
    if (falta.length) return { error: `Las variaciones reutilizan las escenas ya hechas: todavía falta ${falta.slice(0, 3).join(", ")}.` };
    const t = (v: unknown, max: number) => (typeof v === "string" ? v : "").trim().slice(0, max);
    const limpios: PedidoVariacion[] = (Array.isArray(pedidos) ? pedidos : []).slice(0, 10).map((v) => ({
      gancho: t(v?.gancho, 400),
      regenerarGancho: v?.regenerarGancho === true,
      notaGancho: t(v?.notaGancho, 400),
      oferta: t(v?.oferta, 400),
      llamado: t(v?.llamado, 200),
    }));
    if (!limpios.length) return { error: "Elige al menos una variación." };
    const sinCambio = limpios.findIndex((v) => !v.gancho && !v.regenerarGancho && !v.oferta && !v.llamado);
    if (sinCambio >= 0) return { error: `La variación ${sinCambio + 1} no cambia nada: ponle otro gancho, otra oferta u otro llamado a la acción.` };
    const ahora = new Date().toISOString();
    const quien = { id: x.profile.id, nombre: x.profile.name };
    const variaciones: GuionGuardado[] = [];
    for (const [i, v] of limpios.entries()) {
      const proyecto = proyectoDeVariacion(p, v, { guionId: x.g.id, producto: x.g.producto }, ahora, x.profile.name);
      const hijo: GuionGuardado = {
        ...x.g,
        id: randomUUID(),
        oferta: proyecto.contexto.cierre.oferta,
        llamado: proyecto.contexto.cierre.llamadoALaAccion,
        estado: "borrador",
        correcciones: [],
        autorId: x.profile.id,
        autorNombre: x.profile.name,
        creadoAt: ahora,
        actualizadoAt: ahora,
        versiones: [
          { ...x.version, n: 1, queCambio: `Variación ${i + 1} de «${x.g.producto}»: cambia ${proyecto.variacionDe?.cambia}.`, correccionId: null, correccion: "", restauradaDe: null, autorId: x.profile.id, autorNombre: x.profile.name, fecha: ahora, videoUrl: null, videoTrabajoId: null, videoAprobado: null, proyecto },
        ],
      };
      const w = await escribirGuionArchivo(x.admin, hijo);
      if (w.error) return { error: `Se crearon ${variaciones.length} de ${limpios.length} variaciones. La siguiente falló: ${w.error}` };
      // Cada hija arranca sola: encola lo nuevo (o va directo al armado si solo cambió texto).
      variaciones.push((await alDiaYAvanzar(x.admin, hijo, quien)).g);
    }
    revalidatePath("/videos");
    const detenidas = variaciones.filter((g) => g.versiones[0].proyecto?.auto.parada).length;
    return { ...estado(x), variaciones, aviso: `${variaciones.length} ${variaciones.length === 1 ? "variación creada" : "variaciones creadas"}${detenidas ? `; ${detenidas} quedaron detenidas (mira por qué en «Necesitan tu atención»)` : ""}. Aparecen en «Guiones guardados».` };
  });
}

// ------------------------------------------------- topes y automatización ----

export type EstadoConfig = { config: ConfigVideos; tope: TopeDiario; creditosHoy: number };

/** La configuración vigente y lo usado hoy. La ve cualquiera que opere videos; la cambia solo el CEO. */
export async function configVideos(): Promise<EstadoConfig | { error: string }> {
  return seguro(async () => {
    const profile = await requireProfile();
    if (!VIDEOS_ROLES.includes(profile.role)) return { error: "No tienes permiso para hacer esto." };
    const admin = createAdminClient();
    const [config, tope, creditosHoy] = await Promise.all([leerConfig(admin), topeDeHoy(admin), servidorVideoActivo() ? creditosDeHoy(admin) : Promise.resolve(0)]);
    return { config, tope, creditosHoy };
  });
}

export async function guardarConfigVideos(raw: unknown): Promise<EstadoConfig | { error: string }> {
  return seguro(async () => {
    const profile = await requireProfile();
    if (profile.role !== "ceo") return { error: "Solo el CEO puede cambiar los topes y la automatización." };
    const admin = createAdminClient();
    const config: ConfigVideos = { ...leerConfigVideos(raw), actualizadoPor: profile.name, actualizadoAt: new Date().toISOString() };
    const w = await escribirConfig(admin, config);
    if (w.error) return { error: w.error };
    return { config, tope: await topeDeHoy(admin), creditosHoy: servidorVideoActivo() ? await creditosDeHoy(admin) : 0 };
  });
}

// ------------------------------------------------------------- activos ----

/** Suma una foto real del producto al proyecto (ya subida con la subida firmada de siempre). */
export async function agregarFotoProyecto(id: string, url: string): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    const { p } = x;
    const limpia = enlaceSeguro(String(url ?? ""));
    if (!limpia?.startsWith("https://")) return { error: "La foto debe ser un enlace https." };
    if (p.contexto.fotos.includes(limpia)) return estado(x);
    if (p.contexto.fotos.length >= MAX_FOTOS_PROYECTO) return { error: `Un proyecto lleva hasta ${MAX_FOTOS_PROYECTO} fotos del producto.` };
    p.contexto.fotos = [...p.contexto.fotos, limpia];
    anotar(p, `Foto real del producto agregada por ${x.profile.name}.`);
    return guardar({ ...x, g: { ...x.g, fotosProducto: p.contexto.fotos } }, p);
  });
}

/**
 * «Ajustar a las reglas del video automático»: arregla el plan que ya existe SIN IA
 * (alarga o reparte las frases que no caben, dice el cierre en voz, pasa fotos con frase
 * a clip hasta que el 60 % sea clip generado, alterna las fotos). No encola nada: deja
 * el plan listo para lanzar. Las piezas ya generadas de las escenas que no cambian se conservan.
 */
export async function ajustarPlan(id: string): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    const { p } = x;
    if (hayTrabajoEnCurso(p)) return { error: "Hay algo generándose: espera a que termine para ajustar el plan." };
    const r = enriquecerPlan(p.escenas, { guion: x.version.guion, formato: x.formato, fotos: p.contexto.fotos, fichaTexto: p.contexto.analisisProducto, producto: p.contexto.producto, voz: p.contexto.voz, rico: true });
    if (!r.cambios.length) return { ...estado(x), aviso: "El plan ya cumple las reglas del video automático: no se cambió nada." };
    p.escenas = r.escenas;
    p.avisos = [`Plan ajustado a las reglas del video automático: ${r.cambios.join("; ")}. Revisa los prompts de las escenas nuevas.`, ...p.avisos.filter((a) => !/no cabe dicha con naturalidad|no se dice en voz|primera toma dura|Plan ajustado/.test(a))].slice(0, 8);
    finalPorRehacer(p);
    anotar(p, `Plan ajustado por ${x.profile.name}: ${r.cambios.join("; ")}.`);
    // Ajustar no lanza nada: quien decide lanzar pulsa «Seguir» o enciende el modo directo.
    const activo = p.auto.activo;
    p.auto = { ...p.auto, activo: false };
    const guardado = await guardar(x, p, `Plan ajustado: ${r.cambios.join("; ")}.`);
    if ("error" in guardado || !activo) return guardado;
    return guardado;
  });
}

// ------------------------------------------------- tiempos para la barra ----

let tiemposRecordados: { valor: TiemposVideo; hasta: number } | null = null;

/**
 * Cuánto tarda cada cosa, medido en los trabajos ya terminados (mediana por imagen,
 * por clip y por armado). Sin historia suficiente valen los tiempos por defecto.
 * Nunca falla: la barra de progreso no puede tumbar una pantalla.
 */
export async function tiemposVideo(): Promise<TiemposVideo> {
  try {
    const profile = await requireProfile();
    if (!VIDEOS_ROLES.includes(profile.role)) return TIEMPOS_BASE;
    if (tiemposRecordados && tiemposRecordados.hasta > Date.now()) return tiemposRecordados.valor;
    const { trabajos } = await listarTrabajos(createAdminClient(), 40);
    const muestras: Record<"imagenes" | "clips" | "armado", number[]> = { imagenes: [], clips: [], armado: [] };
    const precios: Record<"imagen" | "clip", number[]> = { imagen: [], clip: [] };
    for (const t of trabajos) {
      if (t.estado !== "listo" || !t.etapa || t.etapa === "analisis" || !t.tomadoAt || !t.terminadoAt) continue;
      // Lo que costó cada pieza entregada (los trabajos simulados reportan 0 y no cuentan).
      for (const r of t.reportes) if (!r.error && r.creditos > 0) precios[r.tipo].push(r.creditos);
      const seg = (Date.parse(t.terminadoAt) - Date.parse(t.tomadoAt)) / 1000;
      if (!Number.isFinite(seg) || seg < 5 || seg > 3600) continue;
      muestras[t.etapa as "imagenes" | "clips" | "armado"].push(t.etapa === "armado" ? seg : seg / Math.max(1, t.escenasEtapa.length));
    }
    const promedio = (l: number[], def: number) => (l.length ? Math.round((l.reduce((a, b) => a + b, 0) / l.length) * 10) / 10 : def);
    const mediana = (l: number[], def: number) => (l.length >= 2 ? Math.round([...l].sort((a, b) => a - b)[Math.floor(l.length / 2)]) : def);
    const valor: TiemposVideo = {
      ...TIEMPOS_BASE,
      imagen: mediana(muestras.imagenes, TIEMPOS_BASE.imagen),
      clip: mediana(muestras.clips, TIEMPOS_BASE.clip),
      armado: mediana(muestras.armado, TIEMPOS_BASE.armado),
      medidos: muestras.imagenes.length >= 2 && muestras.clips.length >= 2,
      creditosImagen: promedio(precios.imagen, TIEMPOS_BASE.creditosImagen),
      creditosClip: promedio(precios.clip, TIEMPOS_BASE.creditosClip),
    };
    tiemposRecordados = { valor, hasta: Date.now() + 5 * 60_000 };
    return valor;
  } catch (err) {
    unstable_rethrow(err);
    return TIEMPOS_BASE;
  }
}

// ------------------------------------------------------ cierre del video ----

/**
 * La tarjeta final: titular y detalle de la oferta (dos líneas) y el color de marca del botón.
 * Vacíos = salen solos de la oferta. No genera nada: si ya había video, queda «por armar de nuevo» (no cuesta).
 */
export async function guardarCierre(id: string, cierre: { titular?: unknown; detalle?: unknown; color?: unknown; urgencia?: unknown }): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    const { p } = x;
    if (p.final.estado === "en-cola" || p.final.estado === "generando") return { error: "El video se está armando: espera a que termine para cambiar el cierre." };
    const s = (v: unknown, max: number) => (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, max);
    const color = s(cierre?.color, 9);
    if (color && !COLOR_HEX.test(color)) return { error: "El color debe ser un código como #0553C9." };
    const antes = JSON.stringify(p.contexto.cierre);
    const { oferta, llamadoALaAccion } = p.contexto.cierre;
    p.contexto.cierre = {
      oferta,
      llamadoALaAccion,
      ...(s(cierre?.titular, 28) ? { titular: s(cierre?.titular, 28) } : {}),
      ...(s(cierre?.detalle, 70) ? { detalle: s(cierre?.detalle, 70) } : {}),
      ...(color ? { color: color.toUpperCase() } : {}),
      // La urgencia escrita por una persona manda (vacía = sin línea de urgencia); sin tocar, sale de la promoción de la oferta.
      ...(typeof cierre?.urgencia === "string" ? { urgencia: s(cierre.urgencia, 80) } : p.contexto.cierre.urgencia !== undefined ? { urgencia: p.contexto.cierre.urgencia } : {}),
    };
    if (JSON.stringify(p.contexto.cierre) === antes) return estado(x);
    finalPorRehacer(p);
    anotar(p, `Cierre del video cambiado por ${x.profile.name}.`);
    return guardar(x, p, "Cierre guardado. Si ya había video, ármalo de nuevo para verlo (no cuesta).");
  });
}

/** Estilo de edición del video: plantilla de subtítulos y ritmo del montaje. No genera nada: si ya había video, queda por armar de nuevo (no cuesta). */
export async function guardarEdicion(id: string, edicion: { subtitulos?: unknown; ritmo?: unknown }): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    const { p } = x;
    if (p.final.estado === "en-cola" || p.final.estado === "generando") return { error: "El video se está armando: espera a que termine para cambiar el estilo." };
    const nueva = leerEdicion({ ...leerEdicion(p.contexto.edicion, x.g.formato), ...(edicion && typeof edicion === "object" ? edicion : {}) }, x.g.formato);
    if (JSON.stringify(nueva) === JSON.stringify(p.contexto.edicion)) return estado(x);
    p.contexto.edicion = nueva;
    finalPorRehacer(p);
    anotar(p, `Estilo de edición cambiado por ${x.profile.name}: subtítulos «${nueva.subtitulos}», ritmo «${nueva.ritmo}».`);
    return guardar(x, p, "Estilo guardado. Si ya había video, ármalo de nuevo para verlo (no cuesta).");
  });
}

/**
 * «Cambiar gancho»: la apertura pasa a ser otro gancho del banco. La imagen y el clip de la
 * escena 1 dejan de valer (hay que generarlos: una imagen y un clip). No encola nada.
 */
export async function cambiarGancho(id: string, ganchoId: string): Promise<EstadoProyecto | { error: string }> {
  return bajoCandado(id, async () => {
    const x = await abrirProyecto(id);
    if ("error" in x) return x;
    const { p } = x;
    if (hayTrabajoEnCurso(p)) return { error: "Hay algo generándose: espera a que termine para cambiar el gancho." };
    const receta = buscarGancho(String(ganchoId ?? ""));
    const primera = p.escenas[0];
    if (!receta) return { error: "Ese gancho ya no está en el banco." };
    if (!primera || primera.tipo !== "generada") return { error: "La primera escena de este plan no es generada: cámbiala a «Generada» en el plan para ponerle un gancho." };
    const opciones = p.contexto.gancho?.opciones.length ? p.contexto.gancho.opciones : elegirGanchos([x.g.producto, x.g.analisisProducto, x.version.guion].join(" "), [], x.g.formato).opciones;
    p.escenas = [aplicarGancho(primera, receta, { producto: x.g.producto, dolor: primera.voz, fichaTexto: p.contexto.analisisProducto, relacion: x.formato.relacion_aspecto || "9:16" }), ...p.escenas.slice(1)];
    p.contexto.gancho = { id: receta.id, opciones: [...new Set([...opciones, receta.id])].slice(0, 4), porque: `«${receta.nombre}», elegido por ${x.profile.name}.` };
    finalPorRehacer(p);
    anotar(p, `Gancho de la apertura cambiado a «${receta.nombre}» por ${x.profile.name}: la escena 1 necesita imagen y clip nuevos.`);
    // Cambiar el gancho no lanza nada, aunque el modo automático esté encendido.
    p.auto = { ...p.auto, activo: false };
    return guardar(x, p, `Gancho cambiado a «${receta.nombre}». La escena 1 necesita una imagen y un clip nuevos (no se generó nada todavía).`);
  });
}
