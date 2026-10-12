"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireProfile, INGRESOS_ROLES, type Profile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import {
  BUCKET_VIDEOS,
  CANALES,
  ETAPAS,
  ETAPA_A_ESTADO,
  ETAPA_LABELS,
  MAX_VIDEO_BYTES,
  ORIGEN_PROSPECCION,
  PIEZA,
  ROLES_ASIGNABLES,
  SERVICIOS,
  fmtPeso,
  leerProspeccion,
  type Canal,
  type Etapa,
  type Prospeccion,
  type Servicio,
} from "@/lib/prospeccion";
import {
  columnasContacto,
  crearProspectoProspeccion,
  enviarMensajeAutomatico,
  generarGuionIA,
  generarMensajeIA,
  guardarProspeccion,
  leerFila,
  mensajeBase,
  type FilaProspeccion,
} from "@/lib/prospeccion-server";

// Acciones del embudo de prospección «video gratis».
//
// Permisos: la tabla `prospectos` solo la ven por RLS los roles de Ingresos.
// El editor asignado no la ve, así que todas estas acciones validan a mano
// quién llama (rol de Ingresos, o el editor asignado para lo de producción)
// y recién entonces usan el cliente de servicio. Ninguna lanza errores
// esperados: devuelven `{ error }`.

type Resultado = { error?: string; aviso?: string };

type Acceso =
  | { error: string }
  | {
      profile: Profile;
      admin: ReturnType<typeof createAdminClient>;
      fila: FilaProspeccion;
      pros: Prospeccion;
      esIngresos: boolean;
    };

/** `ingresos`: solo CEO, gerente comercial y directora operativa.
 * `produccion`: además, quien tenga asignada la pieza. */
async function acceso(id: string, modo: "ingresos" | "produccion"): Promise<Acceso> {
  const profile = await requireProfile();
  const esIngresos = (INGRESOS_ROLES as string[]).includes(profile.role);
  if (modo === "ingresos" && !esIngresos) return { error: "No tienes permiso para hacer esto." };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { error: "Prospecto inválido." };

  const admin = createAdminClient();
  const fila = await leerFila(admin, id);
  const pros = fila ? leerProspeccion(fila.respuestas_calificacion) : null;
  if (!fila || !pros || fila.origen !== ORIGEN_PROSPECCION) {
    return { error: esIngresos ? "No se encontró el prospecto." : "No tienes permiso para hacer esto." };
  }
  if (!esIngresos && pros.editor_id !== profile.id) return { error: "No tienes permiso para hacer esto." };
  return { profile, admin, fila, pros, esIngresos };
}

async function seguro<T extends object>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err); // deja pasar el redirect a /login de requireProfile
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

function refrescar(id?: string) {
  revalidatePath("/prospectos");
  revalidatePath("/prospectos/mis-videos");
  if (id) revalidatePath(`/prospectos/${id}`);
}

// ------------------------------------------------------------ creación ----

export async function crearProspectoManualProspeccion(
  formData: FormData,
): Promise<{ error?: string; id?: string; aviso?: string }> {
  return seguro(async () => {
    const profile = await requireProfile();
    if (!(INGRESOS_ROLES as string[]).includes(profile.role)) return { error: "No tienes permiso para hacer esto." };

    const campo = (k: string) => String(formData.get(k) ?? "");
    const r = await crearProspectoProspeccion(
      {
        nombre: campo("nombre"),
        servicio: campo("servicio"),
        tienda: campo("tienda"),
        producto: campo("producto"),
        falencia: campo("falencia"),
        respuesta: campo("respuesta"),
        canal: campo("canal"),
        contacto: campo("contacto"),
        pais: campo("pais"),
        ads_library: campo("ads_library"),
        notas: campo("notas"),
      },
      { nombre: profile.name, fuente: "manual" },
    );
    if ("error" in r) return { error: r.error };
    refrescar();
    return { id: r.id, aviso: r.aviso };
  });
}

export async function actualizarDatos(id: string, formData: FormData): Promise<Resultado> {
  return seguro(async () => {
    const a = await acceso(id, "ingresos");
    if ("error" in a) return a;

    const campo = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
    const nombre = campo("nombre", 160);
    const tienda = campo("tienda", 300);
    const producto = campo("producto", 240);
    if (!nombre || !tienda || !producto) return { error: "Nombre, tienda y producto son obligatorios." };
    const servicio = campo("servicio", 20);
    const canal = campo("canal", 20);
    if (!(SERVICIOS as readonly string[]).includes(servicio)) return { error: "Elige el servicio." };
    if (!(CANALES as readonly string[]).includes(canal)) return { error: "Elige el canal." };
    const contacto = campo("contacto", 200);
    const whatsapp = campo("whatsapp_number", 40).replace(/[^\d+]/g, "");

    const columnas: Record<string, unknown> = {
      nombre,
      notas: campo("notas", 2000) || null,
      ...columnasContacto(canal as Canal, contacto),
    };
    // El WhatsApp que el prospecto da después (lo pide el mensaje) va en su
    // columna: por ahí Ingresos liga el prospecto con el cliente al cerrar.
    if (whatsapp) columnas.whatsapp_number = whatsapp;

    const r = await guardarProspeccion(
      a.admin,
      id,
      {
        servicio: servicio as Servicio,
        canal: canal as Canal,
        tienda,
        producto,
        contacto,
        falencia: campo("falencia", 2000),
        respuesta: campo("respuesta", 4000),
        pais: campo("pais", 60),
        ads_library: campo("ads_library", 500),
      },
      { columnas, evento: { quien: a.profile.name, accion: "Datos actualizados" } },
    );
    if (r.error) return r;
    refrescar(id);
    return {};
  });
}

// --------------------------------------------------------------- guion ----

export async function regenerarGuion(id: string, indicacion?: string): Promise<Resultado> {
  return seguro(async () => {
    const a = await acceso(id, "ingresos");
    if ("error" in a) return a;
    const g = await generarGuionIA(a.fila.nombre, a.pros, indicacion);
    if ("error" in g) return g;
    const r = await guardarProspeccion(
      a.admin,
      id,
      { guion: g.texto, guion_generado_at: new Date().toISOString() },
      { evento: { quien: a.profile.name, accion: a.pros.guion ? "Guion regenerado con IA" : "Guion generado con IA" } },
    );
    if (r.error) return r;
    refrescar(id);
    return {};
  });
}

export async function guardarGuion(id: string, texto: string): Promise<Resultado> {
  return seguro(async () => {
    const a = await acceso(id, "ingresos");
    if ("error" in a) return a;
    const r = await guardarProspeccion(
      a.admin,
      id,
      { guion: String(texto ?? "").slice(0, 12000) },
      { evento: { quien: a.profile.name, accion: "Guion editado a mano" } },
    );
    if (r.error) return r;
    refrescar(id);
    return {};
  });
}

// ---------------------------------------------------------- producción ----

export async function asignarEditor(id: string, editorId: string | null): Promise<Resultado> {
  return seguro(async () => {
    const a = await acceso(id, "ingresos");
    if ("error" in a) return a;

    let nombreEditor = "";
    if (editorId) {
      const { data: editor } = await a.admin
        .from("users")
        .select("id, name, role, active")
        .eq("id", editorId)
        .maybeSingle();
      if (!editor || !editor.active || !ROLES_ASIGNABLES[a.pros.servicio].includes(editor.role)) {
        return { error: "Esa persona no puede recibir esta pieza." };
      }
      nombreEditor = editor.name as string;
    }
    if ((editorId ?? null) === a.pros.editor_id) return {};

    const r = await guardarProspeccion(
      a.admin,
      id,
      { editor_id: editorId ?? null },
      {
        evento: {
          quien: a.profile.name,
          accion: editorId ? `Asignado a ${nombreEditor}` : "Se quitó la asignación",
        },
      },
    );
    if (r.error) return r;
    if (editorId && editorId !== a.profile.id) {
      await notify(
        a.admin,
        editorId,
        "asignado",
        `Te asignaron ${PIEZA[a.pros.servicio] === "video" ? "un video" : "una muestra de landing"} de prospección: ${a.fila.nombre}`,
        "/prospectos/mis-videos",
      );
    }
    refrescar(id);
    return {};
  });
}

function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-90);
  return limpio || "video";
}

const EXTENSIONES: Record<Servicio, RegExp> = {
  video: /\.(mp4|mov|m4v|webm)$/i,
  landing: /\.(mp4|mov|m4v|webm|png|jpe?g|webp|pdf)$/i,
};

/** Paso 1 de la subida: devuelve una URL firmada para que el navegador suba
 * el archivo directo a Storage (un video no cabe por una Server Action). */
export async function prepararSubida(
  id: string,
  archivo: { nombre: string; tamano: number },
): Promise<{ error: string } | { path: string; token: string }> {
  return seguro(async () => {
    const a = await acceso(id, "produccion");
    if ("error" in a) return a;
    const nombre = String(archivo?.nombre ?? "");
    const tamano = Number(archivo?.tamano ?? 0);
    if (!EXTENSIONES[a.pros.servicio].test(nombre)) {
      return {
        error:
          a.pros.servicio === "video"
            ? "Sube el video en MP4, MOV o WebM."
            : "Sube un video (MP4, MOV, WebM), una imagen (PNG, JPG, WebP) o un PDF.",
      };
    }
    if (!tamano || tamano > MAX_VIDEO_BYTES) {
      return {
        error: `El archivo pesa ${fmtPeso(tamano)} y el máximo es ${fmtPeso(MAX_VIDEO_BYTES)}. Expórtalo más liviano o pega un enlace de Drive.`,
      };
    }
    const path = `prospeccion/${id}/${Date.now()}-${nombreSeguro(nombre)}`;
    const { data, error } = await a.admin.storage.from(BUCKET_VIDEOS).createSignedUploadUrl(path);
    if (error || !data) return { error: `No se pudo preparar la subida: ${error?.message ?? "sin respuesta"}` };
    return { path: data.path, token: data.token };
  });
}

/** Paso 2: confirma que el archivo quedó en Storage y lo liga al prospecto. */
export async function registrarVideo(id: string, archivo: { path: string; nombre: string }): Promise<Resultado> {
  return seguro(async () => {
    const a = await acceso(id, "produccion");
    if ("error" in a) return a;
    const carpeta = `prospeccion/${id}`;
    const path = String(archivo?.path ?? "");
    const base = path.slice(carpeta.length + 1);
    if (!path.startsWith(`${carpeta}/`) || !base || base.includes("/")) return { error: "Archivo inválido." };

    const { data: lista, error: errLista } = await a.admin.storage.from(BUCKET_VIDEOS).list(carpeta, { search: base });
    if (errLista || !lista?.some((o) => o.name === base)) {
      return { error: "La subida no terminó. Intenta de nuevo." };
    }
    const { data: pub } = a.admin.storage.from(BUCKET_VIDEOS).getPublicUrl(path);
    const nombre = String(archivo?.nombre ?? base).slice(0, 160);
    const r = await guardarProspeccion(
      a.admin,
      id,
      { video_url: pub.publicUrl, video_nombre: nombre, video_path: path, video_terminado_at: null },
      { evento: { quien: a.profile.name, accion: `Subió «${nombre}»` } },
    );
    if (r.error) return r;
    refrescar(id);
    return {};
  });
}

/** Alternativa para archivos muy pesados: un enlace (Drive, Dropbox, Frame). */
export async function registrarEnlace(id: string, url: string): Promise<Resultado> {
  return seguro(async () => {
    const a = await acceso(id, "produccion");
    if ("error" in a) return a;
    let limpio: string;
    try {
      const u = new URL(String(url ?? "").trim());
      if (u.protocol !== "https:") return { error: "El enlace debe empezar por https://" };
      limpio = u.toString();
    } catch {
      return { error: "Ese enlace no es válido." };
    }
    const r = await guardarProspeccion(
      a.admin,
      id,
      { video_url: limpio, video_nombre: "Enlace externo", video_path: null, video_terminado_at: null },
      { evento: { quien: a.profile.name, accion: "Pegó un enlace a la pieza" } },
    );
    if (r.error) return r;
    refrescar(id);
    return {};
  });
}

export async function marcarTerminado(id: string): Promise<Resultado> {
  return seguro(async () => {
    const a = await acceso(id, "produccion");
    if ("error" in a) return a;
    if (!a.pros.video_url) return { error: "Primero sube la pieza." };
    if (a.pros.video_terminado_at) return {};

    const firma = "Equipo de Reditus Consulting";
    // Con la pieza lista, la IA deja redactado el mensaje de entrega. Si la
    // IA no está disponible queda el mensaje base, que se puede editar.
    let mensaje = a.pros.mensaje;
    let aviso: string | undefined;
    if (!mensaje.trim()) {
      const ia = await generarMensajeIA(a.fila.nombre, a.pros, firma);
      if ("error" in ia) {
        mensaje = mensajeBase(a.fila.nombre, a.pros, firma);
        aviso = a.esIngresos ? `El mensaje quedó con la plantilla base. ${ia.error}` : undefined;
      } else {
        mensaje = ia.texto;
      }
    }

    const r = await guardarProspeccion(
      a.admin,
      id,
      { video_terminado_at: new Date().toISOString(), mensaje },
      { evento: { quien: a.profile.name, accion: "Marcó la pieza como terminada" } },
    );
    if (r.error) return r;

    const { data: comerciales } = await a.admin
      .from("users")
      .select("id")
      .in("role", INGRESOS_ROLES)
      .eq("active", true);
    for (const u of comerciales ?? []) {
      if (u.id === a.profile.id) continue;
      await notify(
        a.admin,
        u.id as string,
        "terminado",
        `Listo para enviar: ${PIEZA[a.pros.servicio]} de ${a.fila.nombre}`,
        `/prospectos/${id}`,
      );
    }
    refrescar(id);
    return { aviso };
  });
}

/** Devuelve la pieza a edición (pidieron un cambio antes de enviarla). */
export async function reabrirPieza(id: string): Promise<Resultado> {
  return seguro(async () => {
    const a = await acceso(id, "ingresos");
    if ("error" in a) return a;
    const r = await guardarProspeccion(
      a.admin,
      id,
      { video_terminado_at: null },
      { evento: { quien: a.profile.name, accion: "Devolvió la pieza a edición" } },
    );
    if (r.error) return r;
    if (a.pros.editor_id && a.pros.editor_id !== a.profile.id) {
      await notify(
        a.admin,
        a.pros.editor_id,
        "correccion",
        `Hay que ajustar la pieza de prospección de ${a.fila.nombre}`,
        "/prospectos/mis-videos",
      );
    }
    refrescar(id);
    return {};
  });
}

// ------------------------------------------------------------- mensaje ----

export async function redactarMensaje(id: string, modo: "ia" | "base"): Promise<Resultado> {
  return seguro(async () => {
    const a = await acceso(id, "ingresos");
    if ("error" in a) return a;
    const firma = `${a.profile.name.trim().split(/\s+/)[0]} · Reditus Consulting`;
    let texto: string;
    if (modo === "base") {
      texto = mensajeBase(a.fila.nombre, a.pros, firma);
    } else {
      const ia = await generarMensajeIA(a.fila.nombre, a.pros, firma);
      if ("error" in ia) return ia;
      texto = ia.texto;
    }
    const r = await guardarProspeccion(
      a.admin,
      id,
      { mensaje: texto },
      { evento: { quien: a.profile.name, accion: modo === "ia" ? "Mensaje redactado con IA" : "Mensaje con plantilla base" } },
    );
    if (r.error) return r;
    refrescar(id);
    return {};
  });
}

export async function guardarMensaje(id: string, texto: string): Promise<Resultado> {
  return seguro(async () => {
    const a = await acceso(id, "ingresos");
    if ("error" in a) return a;
    const r = await guardarProspeccion(a.admin, id, { mensaje: String(texto ?? "").slice(0, 6000) });
    if (r.error) return r;
    refrescar(id);
    return {};
  });
}

// --------------------------------------------------------------- etapa ----

export async function cambiarEtapa(id: string, etapa: Etapa): Promise<Resultado> {
  return seguro(async () => {
    const a = await acceso(id, "ingresos");
    if ("error" in a) return a;
    if (!(ETAPAS as readonly string[]).includes(etapa)) return { error: "Etapa inválida." };
    if (etapa === "video_enviado" && !a.pros.video_url) {
      return { error: "Todavía no hay pieza subida: no se puede marcar como enviada." };
    }
    const cambio: Partial<Prospeccion> = { etapa };
    if (etapa === "video_enviado" && !a.pros.enviado_at) cambio.enviado_at = new Date().toISOString();
    const r = await guardarProspeccion(a.admin, id, cambio, {
      columnas: { estado: ETAPA_A_ESTADO[etapa] },
      evento: { quien: a.profile.name, accion: `Pasó a «${ETAPA_LABELS[etapa]}»` },
    });
    if (r.error) return r;
    refrescar(id);
    return {};
  });
}

/** El mensaje ya se envió: mueve el prospecto a «Video enviado». Hoy el
 * envío es manual (copiar y pegar). Cuando `enviarMensajeAutomatico`
 * (lib/prospeccion-server.ts) esté conectado, pasar `automatico = true`
 * hará el envío real antes de mover la etapa. */
export async function marcarEnviado(id: string, automatico = false): Promise<Resultado> {
  if (automatico) {
    const previo = await seguro(async () => {
      const a = await acceso(id, "ingresos");
      if ("error" in a) return a;
      const envio = await enviarMensajeAutomatico(a.fila, a.pros);
      return envio.enviado ? {} : { error: envio.motivo ?? "No se pudo enviar." };
    });
    if ("error" in previo && previo.error) return previo;
  }
  return cambiarEtapa(id, "video_enviado");
}
