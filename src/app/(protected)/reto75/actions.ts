"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string } | undefined;

const DIAS_TOTAL = 75;
const CAMPOS_DIA = ["dieta", "entreno1", "entreno2_outdoor", "agua", "lectura"] as const;
type CampoDia = (typeof CAMPOS_DIA)[number];

export async function iniciarReto75(): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    const supabase = await createClient();

    const { data: activo } = await supabase
      .from("reto75_runs")
      .select("id")
      .eq("user_id", profile.id)
      .eq("estado", "activo")
      .maybeSingle();
    if (activo) return { error: "Ya tienes un intento activo." };

    const { data: ultimo } = await supabase
      .from("reto75_runs")
      .select("numero_intento")
      .eq("user_id", profile.id)
      .order("numero_intento", { ascending: false })
      .limit(1)
      .maybeSingle();
    const numeroIntento = (ultimo?.numero_intento ?? 0) + 1;

    const fechaInicio = new Date().toISOString().slice(0, 10);
    const { data: run, error } = await supabase
      .from("reto75_runs")
      .insert({ user_id: profile.id, numero_intento: numeroIntento, fecha_inicio: fechaInicio, estado: "activo" })
      .select("id")
      .single();
    if (error) return { error: error.message };

    const inicio = new Date(`${fechaInicio}T12:00:00`);
    const dias = Array.from({ length: DIAS_TOTAL }, (_, i) => {
      const fecha = new Date(inicio);
      fecha.setDate(fecha.getDate() + i);
      return { run_id: run.id, dia_numero: i + 1, fecha: fecha.toISOString().slice(0, 10) };
    });
    const { error: eDias } = await supabase.from("reto75_dias").insert(dias);
    if (eDias) return { error: eDias.message };

    revalidatePath("/reto75");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

/** El reto se reinicia si falla un día — no hay "editar" el fallo, se
 * archiva el intento actual como fallido y arranca uno nuevo desde el
 * día 1, tal como pide la regla original del 75 Hard. */
export async function reiniciarReto75(): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    const supabase = await createClient();
    await supabase
      .from("reto75_runs")
      .update({ estado: "fallido" })
      .eq("user_id", profile.id)
      .eq("estado", "activo");
    revalidatePath("/reto75");
    return await iniciarReto75();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function marcarDiaCampo(diaId: string, campo: CampoDia, valor: boolean): Promise<ActionResult> {
  try {
    await requireProfile();
    if (!CAMPOS_DIA.includes(campo)) return { error: "Campo no permitido." };
    const supabase = await createClient();

    // Guarda a qué hora se marcó cada regla — no se muestra en el
    // checklist del día, es la materia prima del Dashboard de estabilidad.
    const { error } = await supabase
      .from("reto75_dias")
      .update({
        [campo]: valor,
        [`${campo}_at`]: valor ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", diaId);
    if (error) return { error: error.message };

    // Si el día 75 quedó completo (las 5 reglas), marca el intento como
    // completado automáticamente.
    const { data: dia } = await supabase
      .from("reto75_dias")
      .select("run_id, dia_numero, dieta, entreno1, entreno2_outdoor, agua, lectura")
      .eq("id", diaId)
      .single();
    if (
      dia &&
      dia.dia_numero === DIAS_TOTAL &&
      dia.dieta &&
      dia.entreno1 &&
      dia.entreno2_outdoor &&
      dia.agua &&
      dia.lectura
    ) {
      await supabase.from("reto75_runs").update({ estado: "completado" }).eq("id", dia.run_id);
    }

    revalidatePath("/reto75");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function guardarFotoDia(diaId: string, fotoUrl: string | null): Promise<ActionResult> {
  try {
    await requireProfile();
    const supabase = await createClient();
    const { error } = await supabase
      .from("reto75_dias")
      .update({ foto_url: fotoUrl, updated_at: new Date().toISOString() })
      .eq("id", diaId);
    if (error) return { error: error.message };
    revalidatePath("/reto75");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}
