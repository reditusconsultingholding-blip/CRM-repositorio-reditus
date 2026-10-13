"use server";

import { randomBytes, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireProfile, INGRESOS_ROLES, type Profile } from "@/lib/auth";
import { RAIZ_COLA } from "@/lib/cola-raiz";
import { createAdminClient } from "@/lib/supabase/admin";
import { ID_LOTE, MAX_FILAS_LOTE, faltaEnFila, leerFila, leerLote, type FilaLote, type LoteVideos } from "@/lib/lotes-video";
import { ORIGEN_PROSPECCION, leerProspeccion } from "@/lib/prospeccion";
import { fichaConDatos } from "@/lib/proyecto-video";
import { alDiaYAvanzar, analizarFotosProducto } from "@/lib/proyecto-video-server";
import { BUCKET_TRABAJOS, corchetes, pasosDelGuion, selloBogota } from "@/lib/trabajos-video";
import { asegurarBucketTrabajos, topeDeHoy } from "@/lib/trabajos-video-server";
import { FORMATOS_VERSION, buscarFormato } from "@/lib/video-formatos";
import { VIDEOS_ROLES, codigoDePais, faltaEnElCierre, leerDatosVideo, rellenar, versionVigente, type DatosVideo, type GuionGuardado } from "@/lib/videos";
import { consultarFuentes, investigarProducto } from "@/lib/videos-investigacion";
import { escribirGuionArchivo, generarGuionVideo, leerGuionArchivo, regenerarCierreGuion } from "@/lib/videos-server";

// LOTES: una lista de productos, una fila por video. Cada fila hace sola lo
// que haría «Generar todo» (investigar, escribir el guion, guardarlo, mirar
// las fotos) y se detiene donde las reglas del dueño piden a una persona. La
// pantalla corre las filas una por una (cada llamada cabe en el tiempo de una
// función); si se cierra, el lote queda guardado y se continúa después.

type Almacen = ReturnType<typeof createAdminClient>;
const CARPETA = `${RAIZ_COLA}-lotes`;
const ruta = (id: string) => `${CARPETA}/${id}.json`;

async function seguro<T extends object>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

async function entrar(): Promise<{ profile: Profile; admin: Almacen } | { error: string }> {
  const profile = await requireProfile();
  if (!VIDEOS_ROLES.includes(profile.role)) return { error: "No tienes permiso para hacer esto." };
  return { profile, admin: createAdminClient() };
}

async function leer(id: string): Promise<LoteVideos | null> {
  if (!ID_LOTE.test(id)) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !llave) return null;
  try {
    const res = await fetch(`${base}/storage/v1/object/${BUCKET_TRABAJOS}/${ruta(id)}?sinCache=${Date.now()}${randomBytes(3).toString("hex")}`, {
      headers: { authorization: `Bearer ${llave}`, apikey: llave },
      cache: "no-store",
    });
    return res.ok ? leerLote(await res.json()) : null;
  } catch {
    return null;
  }
}

async function escribir(admin: Almacen, lote: LoteVideos): Promise<{ error?: string }> {
  const { error } = await admin.storage.from(BUCKET_TRABAJOS).upload(ruta(lote.id), JSON.stringify(lote, null, 1), { contentType: "application/json", upsert: true, cacheControl: "0" });
  return error ? { error: `No se pudo guardar el lote: ${error.message}` } : {};
}

/** Los lotes más recientes (hasta 8). */
export async function listarLotes(): Promise<{ lotes: LoteVideos[] } | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    const { data } = await x.admin.storage.from(BUCKET_TRABAJOS).list(CARPETA, { limit: 8, sortBy: { column: "name", order: "desc" } });
    const lotes = await Promise.all((data ?? []).filter((f) => f.name.endsWith(".json")).map((f) => leer(f.name.slice(0, -5))));
    return { lotes: lotes.filter((l): l is LoteVideos => !!l) };
  });
}

export type NuevoLote = { nombre: string; filas: unknown[]; prospectos?: string[] };

/** Crea el lote con sus filas (pegadas, subidas o tomadas de prospectos del embudo). No corre nada todavía. */
export async function crearLote(entrada: NuevoLote): Promise<{ lote: LoteVideos } | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    const b = await asegurarBucketTrabajos(x.admin);
    if (b.error) return { error: b.error };
    const filas: FilaLote[] = (Array.isArray(entrada?.filas) ? entrada.filas : []).slice(0, MAX_FILAS_LOTE).map((f, i) => ({ ...leerFila(f, i + 1), guionId: null, estado: "pendiente" as const, detalle: "" }));

    // Prospectos del embudo: sus datos de producción llenan la fila. Solo el equipo comercial.
    const ids = (Array.isArray(entrada?.prospectos) ? entrada.prospectos : []).filter((p): p is string => typeof p === "string" && /^[0-9a-f-]{36}$/i.test(p)).slice(0, MAX_FILAS_LOTE);
    if (ids.length) {
      if (!INGRESOS_ROLES.includes(x.profile.role)) return { error: "Solo el equipo comercial puede armar un lote con prospectos del embudo." };
      const { data } = await x.admin.from("prospectos").select("id, nombre, origen, respuestas_calificacion").in("id", ids);
      for (const fila of data ?? []) {
        const pros = fila.origen === ORIGEN_PROSPECCION ? leerProspeccion(fila.respuestas_calificacion) : null;
        if (!pros || filas.length >= MAX_FILAS_LOTE) continue;
        filas.push({ ...leerFila({ producto: pros.producto, enlace: pros.tienda, pais: codigoDePais(pros.pais) ?? "CO", cliente: fila.nombre, prospectoId: fila.id }, filas.length + 1) });
      }
    }
    if (!filas.length) return { error: "El lote no tiene filas: pega la lista o elige prospectos." };
    const ahora = new Date();
    const sello = selloBogota(ahora);
    const lote: LoteVideos = {
      id: `${sello.dia}-${sello.hora}-${randomBytes(4).toString("hex")}`,
      nombre: String(entrada?.nombre ?? "").trim().slice(0, 120) || `Lote del ${sello.dia.slice(6, 8)}/${sello.dia.slice(4, 6)}`,
      creadoPor: x.profile.name,
      creadoPorId: x.profile.id,
      creadoAt: ahora.toISOString(),
      filas: filas.map((f, i) => {
        const falta = faltaEnFila(f);
        return { ...f, n: i + 1, ...(falta.length ? { estado: "detenido" as const, detalle: `Falta ${falta.join(" y ")}: escríbelo en la fila y vuelve a correrla.` } : {}) };
      }),
    };
    const w = await escribir(x.admin, lote);
    if (w.error) return { error: w.error };
    return { lote };
  });
}

/** Completa a mano lo que le falta a una fila que todavía no tiene guion (oferta, llamado, fotos…). */
export async function editarFilaLote(loteId: string, n: number, cambio: unknown): Promise<{ lote: LoteVideos } | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    const lote = await leer(loteId);
    const fila = lote?.filas.find((f) => f.n === n);
    if (!lote || !fila) return { error: "No se encontró esa fila del lote." };
    if (fila.guionId) return { error: "Esa fila ya tiene su guion: edítalo abriéndolo." };
    const nueva = leerFila({ ...fila, ...(cambio && typeof cambio === "object" ? cambio : {}) }, n);
    const falta = faltaEnFila(nueva);
    lote.filas = lote.filas.map((f) =>
      f.n === n ? { ...nueva, prospectoId: fila.prospectoId, guionId: null, estado: falta.length ? ("detenido" as const) : ("pendiente" as const), detalle: falta.length ? `Falta ${falta.join(" y ")}.` : "" } : f,
    );
    const w = await escribir(x.admin, lote);
    return w.error ? { error: w.error } : { lote };
  });
}

export type FilaCorrida = { lote: LoteVideos; guion: GuionGuardado | null };

/**
 * Corre UNA fila: investiga, escribe el guion, lo guarda y mira las fotos. Se
 * detiene donde hace falta una persona (y lo deja escrito en la fila):
 * faltan datos, la IA no escribió el guion, faltan fotos, la ficha del
 * producto está sin confirmar. Con todo en orden crea el proyecto en modo
 * directo. Si el tope diario ya se alcanzó, deja esta y las demás «en espera
 * para mañana».
 */
export async function correrFilaLote(loteId: string, n: number): Promise<FilaCorrida | { error: string }> {
  return seguro(async () => {
    const x = await entrar();
    if ("error" in x) return x;
    const lote = await leer(loteId);
    const fila = lote?.filas.find((f) => f.n === n);
    if (!lote || !fila) return { error: "No se encontró esa fila del lote." };
    const cerrar = async (cambio: Partial<FilaLote>, guion: GuionGuardado | null = null): Promise<FilaCorrida | { error: string }> => {
      // Se relee: otra fila pudo guardarse mientras esta trabajaba.
      const fresco = (await leer(loteId)) ?? lote;
      fresco.filas = fresco.filas.map((f) => (f.n === n ? { ...f, ...cambio } : f));
      const w = await escribir(x.admin, fresco);
      return w.error ? { error: w.error } : { lote: fresco, guion };
    };

    // La fila ya tiene guion: solo se empuja su proyecto (si lo tiene).
    if (fila.guionId) {
      const g = await leerGuionArchivo(x.admin, fila.guionId);
      if (!g) return cerrar({ estado: "error", detalle: "El guion de esta fila ya no existe." });
      const r = await alDiaYAvanzar(x.admin, g, { id: x.profile.id, nombre: x.profile.name });
      return cerrar({ estado: versionVigente(r.g)?.proyecto ? "creado" : fila.estado }, r.g);
    }
    const falta = faltaEnFila(fila);
    if (falta.length) return cerrar({ estado: "detenido", detalle: `Falta ${falta.join(" y ")}: escríbelo en la fila y vuelve a correrla.` });

    // Tope diario de videos nuevos: lo que no alcanza hoy, espera a mañana.
    const tope = await topeDeHoy(x.admin);
    if (tope.usados >= tope.max) {
      const fresco = (await leer(loteId)) ?? lote;
      fresco.filas = fresco.filas.map((f) => (!f.guionId && (f.estado === "pendiente" || f.n === n) ? { ...f, estado: "espera-manana" as const, detalle: `Hoy ya se pidieron ${tope.usados} de ${tope.max} videos (tope diario). Mañana pulsa «Continuar lote».` } : f));
      const w = await escribir(x.admin, fresco);
      return w.error ? { error: w.error } : { lote: fresco, guion: null };
    }

    // 1) Investigación (fuentes + análisis). Nada de esto falla: lo que no hay, se dice.
    let datos: DatosVideo = leerDatosVideo({ producto: fila.producto, enlace: fila.enlace, pais: fila.pais, paisBusqueda: fila.pais, cliente: fila.cliente, oferta: fila.oferta, llamado: fila.llamado, formato: fila.formato, fotosProducto: fila.fotos });
    const fuentes = await consultarFuentes(datos);
    datos = { ...datos, anunciosHallados: fuentes.anuncios, fuentesInvestigacion: fuentes.fuentes, investigacionCache: fuentes.deCache ?? "", analisisLeyoPagina: fuentes.leyoPagina, fotosProducto: datos.fotosProducto.length ? datos.fotosProducto : fuentes.imagenes.slice(0, 4) };
    const analisis = await investigarProducto(datos);
    datos = { ...datos, analisisProducto: analisis.texto, formatosRecomendados: analisis.formatos };
    // 2) Formato: el pedido; si no, el que recomendó la investigación; si no hubo IA, el más barato (todo con foto real).
    const formato = buscarFormato(fila.formato) ?? buscarFormato(analisis.formatos[0] ?? "") ?? buscarFormato("usos-del-producto");
    if (!formato) return cerrar({ estado: "error", detalle: "No hay formatos en la biblioteca." });
    datos = { ...datos, formato: formato.slug };
    // 3) Guion, con el cierre obligatorio.
    const escrito = await generarGuionVideo(datos, formato);
    let texto = escrito.texto;
    if (escrito.origen === "ia" && faltaEnElCierre(texto, datos).length) texto = (await regenerarCierreGuion(datos, texto)).texto;
    // 4) Fotos: la IA de visión propone la ficha; confirmarla es de una persona.
    const ficha = datos.fotosProducto.length ? (await analizarFotosProducto(datos.fotosProducto, datos, datos.fichaProducto)).ficha : datos.fichaProducto;
    datos = { ...datos, fichaProducto: ficha };

    const ahora = new Date().toISOString();
    const g: GuionGuardado = {
      ...datos,
      id: randomUUID(),
      version: 1,
      formatoNombre: formato.nombre,
      formatosVersion: FORMATOS_VERSION,
      guion: texto,
      origen: escrito.origen,
      estado: "borrador",
      versiones: [
        { n: 1, guion: texto, escenas: formato.prompts.map((e) => ({ escena: e.escena, prompt: rellenar(e.prompt, datos) })), origen: escrito.origen, correccionId: null, correccion: "", queCambio: `Creado por el lote «${lote.nombre}».`, restauradaDe: null, autorId: x.profile.id, autorNombre: x.profile.name, fecha: ahora, videoUrl: null, videoTrabajoId: null, videoAprobado: null, proyecto: null },
      ],
      correcciones: [],
      prospectoId: fila.prospectoId,
      autorId: x.profile.id,
      autorNombre: x.profile.name,
      creadoAt: ahora,
      actualizadoAt: ahora,
    };
    const w = await escribirGuionArchivo(x.admin, g);
    if (w.error) return cerrar({ estado: "error", detalle: w.error });
    revalidatePath("/videos");

    // 5) Dónde se detiene, dicho exactamente. El guion ya quedó guardado: nada se pierde.
    const sinCompletar = corchetes(pasosDelGuion(texto).map((p) => p.voz).join(" "));
    const parada =
      escrito.origen !== "ia"
        ? `La IA no escribió el guion (${(escrito.aviso ?? "no está disponible").split(". ")[0].slice(0, 160)}). Quedó la plantilla del formato «${formato.nombre}»: ábrelo, complétalo y sigue.`
        : sinCompletar.length
          ? `Al guion le faltan datos del cliente: ${sinCompletar.slice(0, 4).join(", ")}. Ábrelo y complétalos.`
          : !datos.fotosProducto.length
            ? "Faltan las fotos reales del producto: ábrelo, súbelas y confirma la ficha."
            : `Confirma la ficha del producto${fichaConDatos(ficha) ? " (la IA ya propuso lo que se ve en las fotos)" : " (llénala a mano: la IA no pudo mirar las fotos)"} y pulsa «Seguir en modo directo».`;
    return cerrar({ guionId: g.id, estado: "detenido", detalle: parada, formato: formato.slug }, g);
  });
}
