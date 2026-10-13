"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cargarMaestria, contextoClase, contextoExamen, contextoPractica, evaluarSesion } from "@/lib/negociacion-server";
import {
  DIFICULTADES,
  ESCENARIOS,
  EXAMEN,
  MODULOS,
  MODULO_EXAMEN,
  PERFILES,
  TURNOS_MINIMOS,
  estadoMaestria,
  notaMinima,
  type Dificultad,
  type Evaluacion,
  type Mensaje,
  type PerfilId,
  type TipoSesion,
} from "@/lib/negociacion";

// Ninguna de estas acciones lanza: Next oculta el mensaje real de un throw en
// producción, así que los fallos se devuelven como `{ error }`.

type Pedido =
  | { tipo: "clase"; modulo: number }
  | { tipo: "practica"; escenarioId: string; personalizado?: string; perfil: PerfilId; dificultad: Dificultad }
  | { tipo: "examen" };

export type SesionNueva = { id: string; tipo: TipoSesion; titulo: string; modulo: number | null; dificultad: Dificultad };

async function soloCeo() {
  const profile = await requireProfile();
  return profile.role === "ceo" ? profile : null;
}

export async function iniciarSesion(pedido: Pedido): Promise<{ sesion: SesionNueva } | { error: string }> {
  const profile = await soloCeo();
  if (!profile) return { error: "No autorizado." };
  const datos = await cargarMaestria(profile.id);
  if (!datos) return { error: "Falta instalar las tablas de la maestría en la base de datos." };
  const estado = estadoMaestria(datos.progreso, datos.sesiones);

  let fila: { tipo: TipoSesion; modulo: number | null; escenario: string; contexto: string; dificultad: Dificultad };

  if (pedido.tipo === "clase") {
    const m = MODULOS.find((x) => x.n === pedido.modulo);
    if (!m) return { error: "Ese módulo no existe." };
    if (estado.moduloActual != null && m.n > estado.moduloActual) return { error: "Primero aprueba el módulo anterior." };
    fila = { tipo: "clase", modulo: m.n, escenario: `Módulo ${m.n}: ${m.titulo}`, contexto: contextoClase(m), dificultad: "facil" };
  } else if (pedido.tipo === "examen") {
    if (!estado.examenDisponible) return { error: "El examen se abre cuando cumplas los demás requisitos." };
    fila = { tipo: "examen", modulo: MODULO_EXAMEN, escenario: EXAMEN.titulo, contexto: contextoExamen(), dificultad: "dificil" };
  } else {
    const dificultad = DIFICULTADES.some((d) => d.id === pedido.dificultad) ? pedido.dificultad : "media";
    const perfil = PERFILES.some((x) => x.id === pedido.perfil) ? pedido.perfil : "sorpresa";
    const propio = (pedido.personalizado ?? "").trim().slice(0, 1200);
    const escenario = ESCENARIOS.find((e) => e.id === pedido.escenarioId);
    if (!propio && !escenario) return { error: "Elige una situación o describe la tuya." };
    const escena = propio
      ? `El alumno describió así la situación real que quiere ensayar; interpreta a la otra persona: «${propio}»`
      : escenario!.contexto;
    fila = {
      tipo: "practica",
      modulo: null,
      escenario: propio ? `Situación propia: ${propio.slice(0, 80)}${propio.length > 80 ? "…" : ""}` : escenario!.titulo,
      contexto: contextoPractica(escena, perfil, dificultad),
      dificultad,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("negociacion_sesiones")
    .insert({ user_id: profile.id, ...fila })
    .select("id")
    .single();
  if (error || !data) return { error: "No se pudo crear la sesión. Intenta de nuevo." };
  return { sesion: { id: data.id, tipo: fila.tipo, titulo: fila.escenario, modulo: fila.modulo, dificultad: fila.dificultad } };
}

/** «Volvamos»: borra el último intercambio (lo que dije y lo que me
 * respondieron) para repetirlo. */
export async function deshacerTurno(sesionId: string): Promise<{ mensajes: Mensaje[] } | { error: string }> {
  const profile = await soloCeo();
  if (!profile) return { error: "No autorizado." };
  const supabase = await createClient();
  const { data } = await supabase
    .from("negociacion_sesiones")
    .select("mensajes, nota")
    .eq("id", sesionId)
    .eq("user_id", profile.id)
    .single();
  if (!data) return { error: "No se encontró la sesión." };
  if (data.nota != null) return { error: "Esta sesión ya fue calificada." };
  const mensajes = [...((data.mensajes ?? []) as Mensaje[])];
  const ultimoMio = mensajes.map((m) => m.role).lastIndexOf("user");
  if (ultimoMio < 0) return { error: "Todavía no hay nada que deshacer." };
  const recortados = mensajes.slice(0, ultimoMio);
  const { error } = await supabase.from("negociacion_sesiones").update({ mensajes: recortados }).eq("id", sesionId).eq("user_id", profile.id);
  if (error) return { error: "No se pudo deshacer. Intenta de nuevo." };
  return { mensajes: recortados };
}

export async function calificarSesion(
  sesionId: string,
): Promise<{ evaluacion: Evaluacion; aprobado: boolean; minima: number; graduado: boolean } | { error: string }> {
  const profile = await soloCeo();
  if (!profile) return { error: "No autorizado." };
  const supabase = await createClient();
  const { data: sesion } = await supabase
    .from("negociacion_sesiones")
    .select("id, tipo, modulo, escenario, contexto, dificultad, mensajes, nota, evaluacion")
    .eq("id", sesionId)
    .eq("user_id", profile.id)
    .single();
  if (!sesion) return { error: "No se encontró la sesión." };

  const tipo = sesion.tipo as TipoSesion;
  const minima = notaMinima(tipo);
  if (sesion.nota != null && sesion.evaluacion) {
    return { evaluacion: sesion.evaluacion as Evaluacion, aprobado: sesion.nota >= minima, minima, graduado: false };
  }

  const mensajes = (sesion.mensajes ?? []) as Mensaje[];
  const turnos = mensajes.filter((m) => m.role === "user").length;
  if (turnos < TURNOS_MINIMOS) {
    return { error: `Todavía es muy corto para calificar: llevas ${turnos} de ${TURNOS_MINIMOS} intervenciones mínimas.` };
  }

  const r = await evaluarSesion({
    tipo,
    modulo: sesion.modulo,
    escenario: sesion.escenario,
    contexto: sesion.contexto,
    dificultad: sesion.dificultad as Dificultad,
    mensajes,
  });
  if ("error" in r) return r;
  const { evaluacion } = r;
  const aprobado = evaluacion.nota >= minima;
  const ahora = new Date().toISOString();

  const { error } = await supabase
    .from("negociacion_sesiones")
    .update({ nota: evaluacion.nota, evaluacion, calificada_en: ahora })
    .eq("id", sesionId)
    .eq("user_id", profile.id);
  if (error) return { error: "Se calificó pero no se pudo guardar. Intenta de nuevo." };

  if (sesion.modulo != null) {
    const { data: previo } = await supabase
      .from("negociacion_progreso")
      .select("mejor_nota, intentos, aprobado_en")
      .eq("user_id", profile.id)
      .eq("modulo", sesion.modulo)
      .maybeSingle();
    await supabase.from("negociacion_progreso").upsert({
      user_id: profile.id,
      modulo: sesion.modulo,
      mejor_nota: Math.max(previo?.mejor_nota ?? 0, evaluacion.nota),
      intentos: (previo?.intentos ?? 0) + 1,
      aprobado_en: previo?.aprobado_en ?? (aprobado ? ahora : null),
    });
  }

  revalidatePath("/maestria");
  return { evaluacion, aprobado, minima, graduado: tipo === "examen" && aprobado };
}
