"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireProfile, INGRESOS_ROLES, type Profile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarFormato, type FormatoVideo } from "@/lib/video-formatos";
import { VIDEOS_ROLES, enlaceSeguro, leerDatosVideo, versionVigente, type GuionGuardado, type VersionGuion } from "@/lib/videos";
import { ID_VALIDO, escribirGuionArchivo, leerGuionArchivo } from "@/lib/videos-server";
import {
  MAX_FOTOS_PROYECTO,
  TOPE_INTENTOS_ESCENA,
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
import { heredarProyecto, normalizarPlan, planDeCorreccion, vozSinCompletar, type CorreccionProyecto } from "@/lib/proyecto-video-plan";
import { analizarFotosProducto, datosDePlan, ponerAlDiaProyecto, proponerPlan, type AnalisisFotos } from "@/lib/proyecto-video-server";
import { ID_TRABAJO, type EtapaTrabajo, type TrabajoVista } from "@/lib/trabajos-video";
import { cancelarTrabajo, crearTrabajoEtapa, servidorVideoActivo } from "@/lib/trabajos-video-server";

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

type Abierto = { profile: Profile; admin: Almacen; g: GuionGuardado; formato: FormatoVideo; version: VersionGuion; trabajos: TrabajoVista[] };

/** Valida a quien llama y trae el guion AL DÍA con lo que reportó el trabajador. */
async function abrir(id: string): Promise<Abierto | { error: string }> {
  const profile = await requireProfile();
  if (!VIDEOS_ROLES.includes(profile.role)) return { error: "No tienes permiso para hacer esto." };
  if (typeof id !== "string" || !ID_VALIDO.test(id)) return { error: "Guion inválido." };
  const admin = createAdminClient();
  const leido = await leerGuionArchivo(admin, id);
  if (!leido) return { error: "No se encontró el guion." };
  const formato = buscarFormato(leido.formato);
  if (!formato) return { error: "El formato de este guion ya no existe en la biblioteca." };
  const alDia = await ponerAlDiaProyecto(admin, leido);
  const version = versionVigente(alDia.g);
  if (!version) return { error: "Este guion no tiene versiones." };
  return { profile, admin, g: alDia.g, formato, version, trabajos: alDia.trabajos };
}

type ConProyecto = Abierto & { p: ProyectoVideo };

/** Como `abrir`, pero exige que la versión vigente ya sea un proyecto. `p` es una copia que se puede modificar. */
async function abrirProyecto(id: string): Promise<ConProyecto | { error: string }> {
  const x = await abrir(id);
  if ("error" in x) return x;
  if (!x.version.proyecto) return { error: "Esta versión del guion todavía no es un proyecto por escenas: conviértela primero." };
  return { ...x, p: structuredClone(x.version.proyecto) };
}

/** Guarda el proyecto en su versión y devuelve el estado para la pantalla. */
async function guardar(x: Abierto, p: ProyectoVideo, aviso?: string, extra?: Partial<VersionGuion>, revalidar = false): Promise<EstadoProyecto | { error: string }> {
  const ahora = new Date().toISOString();
  const g: GuionGuardado = { ...x.g, versiones: x.g.versiones.map((v) => (v.n === x.version.n ? { ...v, ...extra, proyecto: p } : v)), actualizadoAt: ahora };
  const w = await escribirGuionArchivo(x.admin, g);
  if (w.error) return { error: w.error };
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
};

/**
 * Convierte la versión vigente del guion en un proyecto por escenas: guarda
 * las fotos y la ficha confirmada, y propone el plan (IA; si no está, la
 * plantilla del formato). No encola nada.
 */
export async function crearProyecto(id: string, pedido: PedidoProyecto): Promise<EstadoProyecto | { error: string }> {
  return seguro(async () => {
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
    };
    const g: GuionGuardado = { ...x.g, fotosProducto: fotos, fichaProducto: ficha };

    const origen = typeof pedido?.heredarDe === "number" ? g.versiones.find((v) => v.n === pedido.heredarDe && v.n !== x.version.n) : undefined;
    let p: ProyectoVideo;
    if (origen?.proyecto) {
      const h = heredarProyecto(origen.proyecto, origen.guion, x.version.guion, contexto);
      p = { ...h.proyecto, avisos: [`Proyecto traído de la v${origen.n}: lo aprobado se conserva.`, ...h.avisos].slice(0, 8) };
    } else {
      const plan = await proponerPlan(datosDePlan(g, x.version, x.formato, fotos, ficha), x.formato, g.pais);
      p = {
        contexto,
        escenas: plan.escenas,
        costo: { creditos: 0, segundosGenerados: 0, imagenes: 0 },
        final: { estado: "pendiente", url: null, armados: 0, trabajoId: null, nota: "" },
        opciones: previo?.opciones ?? { subtitulos: true, voz: true, musica: null, modelo: null },
        origenPlan: plan.origen,
        avisos: [...plan.avisos, ...(fichaConDatos(ficha) ? [] : ["No hay ficha del producto: revisa a mano que los prompts no digan nada del tamaño ni del uso que no sea cierto."])].slice(0, 8),
        // Lo que ya se gastó en un plan anterior de esta versión no desaparece al rehacerlo.
        gastos: previo?.gastos ?? {},
        trabajosAbiertos: [],
        creadoAt: ahora,
        creadoPor: x.profile.name,
      };
    }
    return guardar({ ...x, g }, p, undefined, undefined, true);
  });
}

// --------------------------------------------------------- consultar ----

/** Cómo va el proyecto. La pantalla la llama cada pocos segundos mientras hay algo en proceso. */
export async function consultarProyecto(id: string): Promise<EstadoProyecto | { error: string }> {
  return seguro(async () => {
    const x = await abrir(id);
    if ("error" in x) return x;
    return estado(x);
  });
}

// ----------------------------------------------------- editar el plan ----

export type PlanEditado = {
  escenas: unknown;
  opciones?: { subtitulos?: unknown; voz?: unknown; musica?: unknown; modelo?: unknown };
};

/**
 * Guarda el plan editado: textos, prompts, duración, tipo, foto, orden,
 * escenas nuevas o quitadas. Las piezas ya generadas de cada escena se
 * conservan (se reconocen por su número anterior). No encola nada.
 */
export async function guardarPlan(id: string, plan: PlanEditado): Promise<EstadoProyecto | { error: string }> {
  return seguro(async () => {
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
    const n = normalizarPlan(crudas, { guion: x.version.guion, formato: x.formato, fotos: p.contexto.fotos, fichaTexto: p.contexto.analisisProducto, producto: p.contexto.producto }, { verificarVoz: false });
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
    if (cambioElVideo) finalPorRehacer(p);
    return guardar(x, p, n.avisos.length ? n.avisos.join(" ") : undefined);
  });
}

// ------------------------------------------------------------ encolar ----

/**
 * Encola una etapa para las escenas dadas y deja marcadas las piezas (o el
 * final). Modifica `x.p`. Devuelve el motivo si no se pudo.
 */
async function encolar(x: ConProyecto, etapa: EtapaTrabajo, escenas: EscenaProyecto[]): Promise<string | null> {
  const { p } = x;
  if (etapa !== "imagenes") {
    const faltan = vozSinCompletar(p);
    if (faltan.length && (p.opciones.voz || p.opciones.subtitulos)) {
      return `Todavía hay datos por completar en lo que se dice: ${faltan.slice(0, 4).join(", ")}${faltan.length > 4 ? "…" : ""}. Complétalos en el plan antes de gastar en clips o armar.`;
    }
  }
  const campo: TipoPieza = etapa === "imagenes" ? "imagen" : "clip";
  if (etapa !== "armado") {
    const enTope = escenas.filter((e) => e[campo].intentos >= TOPE_INTENTOS_ESCENA);
    if (enTope.length) {
      return `La escena ${enTope.map((e) => e.n).join(", ")} ya llegó al tope de ${TOPE_INTENTOS_ESCENA} intentos de ${campo === "imagen" ? "imagen" : "clip"}. Para no seguir gastando: cámbiala a «Foto real animada», o reescribe su prompt y pide al CEO que reabra los intentos.`;
    }
  }
  const r = await crearTrabajoEtapa(x.admin, {
    g: x.g,
    version: x.version.n,
    formato: x.formato,
    proyecto: p,
    etapa,
    escenas,
    quien: { id: x.profile.id, nombre: x.profile.name },
  });
  if ("error" in r) return r.error;
  const idTrabajo = r.trabajo.id;
  if (etapa === "armado") {
    p.final = { ...p.final, estado: "en-cola", trabajoId: idTrabajo, armados: p.final.armados + 1, nota: "" };
  } else {
    const ns = new Set(escenas.map((e) => e.n));
    p.escenas = p.escenas.map((e) => {
      if (!ns.has(e.n)) return e;
      const pieza = { ...e[campo], estado: "en-cola" as const, intentos: e[campo].intentos + 1, trabajoId: idTrabajo, revisadaPor: "" };
      // Una imagen nueva deja sin valor el clip que salió de la anterior.
      return campo === "imagen" ? { ...e, imagen: pieza, clip: { ...e.clip, estado: "pendiente" as const, url: null, trabajoId: null, revisadaPor: "" } } : { ...e, clip: pieza };
    });
    finalPorRehacer(p);
  }
  p.trabajosAbiertos = [...p.trabajosAbiertos, idTrabajo].slice(-40);
  return null;
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
  return seguro(async () => {
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
  return seguro(async () => {
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
    return guardarTrasEncolar(x, antes);
  });
}

/** Cancela un trabajo del proyecto que el servidor todavía no tomó. El intento no se cuenta. */
export async function cancelarTrabajoProyecto(id: string, trabajoId: string): Promise<EstadoProyecto | { error: string }> {
  return seguro(async () => {
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
    return guardar(x, p);
  });
}

// ------------------------------------------------------------ revisar ----

export type Decision = "aprobar" | "rechazar";

/** El sí o el no de una persona a una imagen o a un clip. Rechazar exige decir por qué. */
export async function revisarPieza(id: string, n: number, tipo: TipoPieza, decision: Decision, nota?: string): Promise<EstadoProyecto | { error: string }> {
  return seguro(async () => {
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
    } else {
      if (pieza.estado !== "por-aprobar" && pieza.estado !== "aprobada") return { error: "Esa pieza no se puede rechazar ahora." };
      if (campo === "imagen" && piezaEnCurso(e.clip)) return { error: "El clip de esa escena se está generando: espera a que termine." };
      const limpia = String(nota ?? "").trim().slice(0, 600);
      if (!limpia) return { error: "Escribe qué está mal: esa nota es la que recibe el generador al regenerar." };
      e[campo] = { ...pieza, estado: "rechazada", nota: limpia, revisadaPor: x.profile.name };
      // Sin imagen válida, el clip que salió de ella tampoco vale.
      if (campo === "imagen" && e.clip.url) e.clip = { ...e.clip, estado: "pendiente", url: null, trabajoId: null, revisadaPor: "" };
      finalPorRehacer(p);
    }
    return guardar(x, p);
  });
}

/** Aprueba varias piezas de una vez. La pantalla solo lo ofrece después de haberlas visto todas. */
export async function aprobarPiezas(id: string, tipo: TipoPieza, ns: number[]): Promise<EstadoProyecto | { error: string }> {
  return seguro(async () => {
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
  return seguro(async () => {
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
  return seguro(async () => {
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
    if (c.oferta !== null) p.contexto.cierre.oferta = c.oferta;
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
