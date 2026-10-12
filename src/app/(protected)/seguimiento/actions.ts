"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtPeso } from "@/lib/prospeccion";
import {
  BUCKET_SEGUIMIENTO,
  ENTREGA_VACIA,
  EXT_EVIDENCIA,
  MAX_EVIDENCIA_BYTES,
  contar,
  enlaceValido,
  esFecha,
  estadoDe,
  faltaPara,
  fechaCorta,
  hoyBogota,
  leerPlantilla,
  puedeSupervisar,
  type ArchivoDia,
  type DiaVista,
  type Entrega,
  type Persona,
  type Plantilla,
  type TareaVista,
} from "@/lib/seguimiento";
import {
  asegurarBucket,
  avisar,
  cambiarDia,
  cambiarRevision,
  carpetaEvidencias,
  cargarDia,
  equipoActivo,
  guardarPlantilla,
  leerPlantillaGuardada,
  supervisoresDe,
} from "@/lib/seguimiento-server";

// Acciones de «Seguimiento diario». Permisos, siempre en el servidor:
//  · cada quien escribe SOLO su propio día, y solo el de hoy (hora de Bogotá);
//  · revisan (aprobar / devolver) la supervisora del rol y el CEO;
//  · la plantilla la edita solo el CEO.
// Los errores esperados se devuelven como { error }, nunca con throw.

type Resultado = { error?: string; aviso?: string };

async function seguro<T extends object>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err); // deja pasar el redirect a /login de requireProfile
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

type Sesion = { admin: ReturnType<typeof createAdminClient>; yo: Persona; plantilla: Plantilla; hoy: string };

async function sesion(): Promise<Sesion> {
  const admin = createAdminClient();
  // El perfil y la plantilla se piden a la vez. Si no hay sesión,
  // requireProfile corta con el redirect y la plantilla leída se descarta.
  const [perfil, plantilla] = await Promise.all([requireProfile(), leerPlantillaGuardada(admin)]);
  return { admin, yo: { id: perfil.id, name: perfil.name, role: perfil.role }, plantilla, hoy: hoyBogota() };
}

function entregaDe(dia: ArchivoDia, tareaId: string): Entrega {
  if (!dia.entregas[tareaId]) dia.entregas[tareaId] = { ...ENTREGA_VACIA, evidencias: [] };
  return dia.entregas[tareaId];
}

function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-90);
  return limpio || "evidencia";
}

const idCorto = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Valida que la tarea sea de hoy, de la persona y que todavía se pueda tocar. */
function tareaAbierta(dia: DiaVista, tareaId: string): { error: string } | { tarea: TareaVista } {
  const tarea = dia.tareas.find((x) => x.id === tareaId);
  if (!tarea) return { error: "Esa tarea no está en tu secuencia de hoy. Recarga la página." };
  if (tarea.estado === "aprobada") return { error: "Esta tarea ya fue aprobada y quedó cerrada." };
  return { tarea };
}

/** Lo mismo leyendo el día: para lo que valida sin escribir (preparar una subida). */
async function tareaEditable(s: Sesion, tareaId: string) {
  return tareaAbierta(await cargarDia(s.admin, s.plantilla, s.yo, s.hoy), tareaId);
}

// ---------------------------------------------------------- evidencia ----

/** Paso 1 de un archivo: URL firmada para subirlo directo desde el navegador. */
export async function prepararEvidencia(
  tareaId: string,
  archivo: { nombre: string; tamano: number },
): Promise<{ error: string } | { path: string; token: string }> {
  return seguro(async () => {
    const s = await sesion();
    const t = await tareaEditable(s, String(tareaId));
    if ("error" in t) return { error: t.error as string };
    const nombre = String(archivo?.nombre ?? "");
    const tamano = Number(archivo?.tamano ?? 0);
    if (!EXT_EVIDENCIA.test(nombre)) return { error: "Sube una imagen (PNG, JPG, WebP), un video (MP4, MOV, WebM) o un PDF." };
    if (!tamano || tamano > MAX_EVIDENCIA_BYTES) {
      return { error: `El archivo pesa ${fmtPeso(tamano)} y el máximo es ${fmtPeso(MAX_EVIDENCIA_BYTES)}. Súbelo a Drive y pega el enlace.` };
    }
    if (t.tarea.entrega.evidencias.length >= 12) return { error: "Esta tarea ya tiene 12 evidencias. Quita alguna antes de subir otra." };
    const b = await asegurarBucket(s.admin);
    if (b.error) return { error: b.error };
    const path = `${carpetaEvidencias(s.hoy, s.yo.id)}/${t.tarea.id}/${Date.now()}-${nombreSeguro(nombre)}`;
    const { data, error } = await s.admin.storage.from(BUCKET_SEGUIMIENTO).createSignedUploadUrl(path);
    if (error || !data) return { error: `No se pudo preparar la subida: ${error?.message ?? "sin respuesta"}` };
    return { path: data.path, token: data.token };
  });
}

/** Paso 2: confirma que el archivo quedó en Storage y lo anota en la tarea. */
export async function registrarEvidencia(tareaId: string, archivo: { path: string; nombre: string }): Promise<Resultado> {
  return seguro(async () => {
    const s = await sesion();
    const id = String(tareaId);
    // La tarea se valida dentro de cambiarDia (existe hoy y sigue abierta).
    if (!id || id.includes("/") || id.includes("..")) return { error: "Archivo inválido." };
    const carpeta = `${carpetaEvidencias(s.hoy, s.yo.id)}/${id}`;
    const path = String(archivo?.path ?? "");
    const base = path.slice(carpeta.length + 1);
    if (!path.startsWith(`${carpeta}/`) || !base || base.includes("/")) return { error: "Archivo inválido." };
    const { data: lista, error } = await s.admin.storage.from(BUCKET_SEGUIMIENTO).list(carpeta, { search: base });
    if (error || !lista?.some((o) => o.name === base)) return { error: "La subida no terminó. Intenta de nuevo." };
    const r = await cambiarDia(s.admin, s.plantilla, s.yo, s.hoy, (dia, antes) => {
      const t = tareaAbierta(antes, id);
      if ("error" in t) return { error: t.error };
      const e = entregaDe(dia, t.tarea.id);
      if (e.evidencias.some((x) => x.path === path)) return;
      const ahora = new Date().toISOString();
      e.evidencias.push({ id: idCorto(), tipo: "archivo", path, nombre: String(archivo?.nombre ?? base).slice(0, 160), creado: ahora });
      dia.historial.push({ en: ahora, accion: "subió evidencia", tareaId: t.tarea.id, detalle: base });
    });
    if ("error" in r) return { error: r.error };
    revalidatePath("/seguimiento");
    return {};
  });
}

export async function agregarEnlace(tareaId: string, enlace: string): Promise<Resultado> {
  return seguro(async () => {
    const s = await sesion();
    const crudo = String(enlace ?? "").trim();
    const url = enlaceValido(/^https?:\/\//i.test(crudo) ? crudo : `https://${crudo}`);
    if (!crudo || !url || url.startsWith("/") || !/^https?:\/\/[^/]+\.[^/]+/.test(url)) {
      return { error: "Pega el enlace completo de la publicación (Instagram, TikTok o Drive)." };
    }
    const r = await cambiarDia(s.admin, s.plantilla, s.yo, s.hoy, (dia, antes) => {
      const t = tareaAbierta(antes, String(tareaId));
      if ("error" in t) return { error: t.error };
      const e = entregaDe(dia, t.tarea.id);
      if (e.evidencias.length >= 12) return { error: "Esta tarea ya tiene 12 evidencias." };
      if (e.evidencias.some((x) => x.url === url)) return { error: "Ese enlace ya está en esta tarea." };
      const ahora = new Date().toISOString();
      let nombre = url;
      try {
        nombre = new URL(url).hostname.replace(/^www\./, "");
      } catch {}
      e.evidencias.push({ id: idCorto(), tipo: "enlace", url, nombre, creado: ahora });
      dia.historial.push({ en: ahora, accion: "pegó enlace", tareaId: t.tarea.id, detalle: url.slice(0, 200) });
    });
    if ("error" in r) return { error: r.error };
    revalidatePath("/seguimiento");
    return {};
  });
}

export async function quitarEvidencia(tareaId: string, evidenciaId: string): Promise<Resultado> {
  return seguro(async () => {
    const s = await sesion();
    let ruta: string | null = null;
    const r = await cambiarDia(s.admin, s.plantilla, s.yo, s.hoy, (dia, antes) => {
      const t = tareaAbierta(antes, String(tareaId));
      if ("error" in t) return { error: t.error };
      const e = entregaDe(dia, t.tarea.id);
      const ev = e.evidencias.find((x) => x.id === evidenciaId);
      if (!ev) return { error: "Esa evidencia ya no está." };
      e.evidencias = e.evidencias.filter((x) => x.id !== evidenciaId);
      ruta = ev.path ?? null;
      const ahora = new Date().toISOString();
      // Si se queda sin la evidencia que exige, deja de estar hecha.
      if (e.hecha && faltaPara(t.tarea, e)) {
        e.hecha = false;
        e.hechaEn = null;
      }
      dia.historial.push({ en: ahora, accion: "quitó evidencia", tareaId: t.tarea.id, detalle: ev.nombre });
    });
    if ("error" in r) return { error: r.error };
    if (ruta) await s.admin.storage.from(BUCKET_SEGUIMIENTO).remove([ruta]);
    revalidatePath("/seguimiento");
    return {};
  });
}

// ------------------------------------------------------------- marcar ----

export async function guardarNota(tareaId: string, nota: string): Promise<Resultado> {
  return seguro(async () => {
    const s = await sesion();
    const r = await cambiarDia(s.admin, s.plantilla, s.yo, s.hoy, (dia, antes) => {
      const t = tareaAbierta(antes, String(tareaId));
      if ("error" in t) return { error: t.error };
      entregaDe(dia, t.tarea.id).nota = String(nota ?? "").trim().slice(0, 1000);
    });
    if ("error" in r) return { error: r.error };
    revalidatePath("/seguimiento");
    return {};
  });
}

/** Marca (o desmarca) una tarea. Sin la evidencia que exige la plantilla no se puede marcar. */
export async function marcarTarea(tareaId: string, hecha: boolean, nota?: string): Promise<Resultado> {
  return seguro(async () => {
    const s = await sesion();
    // Lo que se necesita después de guardar, tomado dentro del mismo cambio.
    const tras = { titulo: "", devueltaPor: null as string | null, completas: 0 };
    const r = await cambiarDia(s.admin, s.plantilla, s.yo, s.hoy, (dia, antes) => {
      const t = tareaAbierta(antes, String(tareaId));
      if ("error" in t) return { error: t.error };
      const e = entregaDe(dia, t.tarea.id);
      if (typeof nota === "string") e.nota = nota.trim().slice(0, 1000);
      const ahora = new Date().toISOString();
      if (hecha) {
        const falta = faltaPara(t.tarea, e);
        if (falta) return { error: falta };
        e.hecha = true;
        e.hechaEn = ahora;
        dia.historial.push({ en: ahora, accion: t.tarea.estado === "devuelta" ? "volvió a entregar" : "entregó", tareaId: t.tarea.id });
        tras.titulo = t.tarea.titulo;
        if (t.tarea.estado === "devuelta" && t.tarea.revision && t.tarea.revision.por !== s.yo.id) tras.devueltaPor = t.tarea.revision.por;
        // ¿Con esta quedó completo el día? Se anota en la MISMA escritura y
        // se avisa una sola vez a quien supervisa.
        if (!dia.completoAvisado) {
          const revisiones = new Map(antes.tareas.map((x) => [x.id, x.revision]));
          const c = contar(dia.tareas.map((x) => ({ opcional: x.opcional, estado: estadoDe(dia.entregas[x.id], revisiones.get(x.id)) })));
          if (c.total > 0 && c.sinHacer === 0 && c.devueltas === 0) {
            dia.completoAvisado = true;
            tras.completas = c.total;
          }
        }
      } else {
        e.hecha = false;
        e.hechaEn = null;
        dia.historial.push({ en: ahora, accion: "desmarcó", tareaId: t.tarea.id });
      }
    });
    if ("error" in r) return { error: r.error };

    let aviso: string | undefined;
    if (tras.completas > 0) {
      const supervisores = supervisoresDe(s.plantilla, await equipoActivo(s.admin), s.yo);
      for (const q of supervisores) {
        await avisar(
          s.admin,
          q.id,
          "terminado",
          `${s.yo.name.split(" ")[0]} completó su secuencia de hoy (${tras.completas} tareas). Revisa la evidencia.`,
          `/seguimiento?vista=supervision&persona=${s.yo.id}`,
        );
      }
      aviso = "Día completo. Ya se avisó para que revisen tu evidencia.";
    } else if (tras.devueltaPor) {
      // Volvió a entregar algo que le habían devuelto: se avisa a quien lo devolvió.
      await avisar(
        s.admin,
        tras.devueltaPor,
        "terminado",
        `${s.yo.name.split(" ")[0]} volvió a entregar «${tras.titulo.slice(0, 70)}». Revísala.`,
        `/seguimiento?vista=supervision&persona=${s.yo.id}`,
      );
    }
    revalidatePath("/seguimiento");
    return aviso ? { aviso } : {};
  });
}

// ------------------------------------------------------------ revisar ----

export async function revisarTarea(entrada: {
  userId: string;
  fecha: string;
  tareaId: string;
  veredicto: "aprobada" | "devuelta";
  nota?: string;
}): Promise<Resultado> {
  return seguro(async () => {
    const s = await sesion();
    const fecha = String(entrada?.fecha ?? "");
    if (!esFecha(fecha) || fecha > s.hoy) return { error: "Fecha inválida." };
    const veredicto = entrada?.veredicto;
    if (veredicto !== "aprobada" && veredicto !== "devuelta") return { error: "Elige aprobar o devolver." };
    const equipo = await equipoActivo(s.admin);
    const persona = equipo.find((p) => p.id === entrada?.userId);
    if (!persona) return { error: "Esa persona ya no está activa." };
    if (!puedeSupervisar(s.plantilla, s.yo, persona)) return { error: "No te corresponde revisar las tareas de esta persona." };
    const nota = String(entrada?.nota ?? "").trim().slice(0, 600);
    if (veredicto === "devuelta" && nota.length < 4) return { error: "Escribe qué debe corregir para poder devolverla." };

    const dia = await cargarDia(s.admin, s.plantilla, persona, fecha);
    const tarea = dia.tareas.find((x) => x.id === entrada?.tareaId);
    if (!tarea) return { error: "Esa tarea no existe en ese día." };
    if (!tarea.entrega.hecha) return { error: "Todavía no la ha entregado: no hay nada que revisar." };

    const ahora = new Date().toISOString();
    const r = await cambiarRevision(s.admin, fecha, persona.id, (rev) => {
      const nueva = { veredicto, nota, por: s.yo.id, porNombre: s.yo.name, en: ahora };
      rev.revisiones[tarea.id] = nueva;
      rev.historial.push({ ...nueva, tareaId: tarea.id });
    });
    if ("error" in r) return r;

    if (veredicto === "devuelta") {
      await avisar(
        s.admin,
        persona.id,
        "correccion",
        `${s.yo.name.split(" ")[0]} te devolvió «${tarea.titulo.slice(0, 70)}»${fecha === s.hoy ? "" : ` (${fechaCorta(fecha)})`}: ${nota}`,
        "/seguimiento",
      );
    }
    revalidatePath("/seguimiento");
    return {};
  });
}

// ---------------------------------------------------------- plantilla ----

export async function guardarPlantillaAccion(entrada: unknown): Promise<Resultado> {
  return seguro(async () => {
    const s = await sesion();
    if (s.yo.role !== "ceo") return { error: "Solo el CEO puede editar la plantilla." };
    const crudo = entrada as { tareas?: unknown[] } | null;
    const limpia = leerPlantilla(entrada);
    if (!limpia.tareas.length) return { error: "La plantilla quedó sin tareas válidas. Cada tarea necesita un título." };
    if (Array.isArray(crudo?.tareas) && crudo.tareas.length !== limpia.tareas.length) {
      return { error: "Hay tareas sin título o repetidas. Revísalas antes de guardar." };
    }
    limpia.actualizado = new Date().toISOString();
    limpia.actualizadoPor = s.yo.name;
    const g = await guardarPlantilla(s.admin, limpia);
    if (g.error) return g;
    revalidatePath("/seguimiento");
    return {};
  });
}
