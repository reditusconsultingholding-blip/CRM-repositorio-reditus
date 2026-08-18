"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Ver nota en admin/usuarios/actions.ts: Next.js oculta el mensaje real de
// cualquier throw en una Server Action en producción, así que aquí siempre
// se devuelve { error } en vez de lanzar.
type ActionResult = { error?: string } | undefined;

async function requireCeoOrError(): Promise<{ error: string } | null> {
  const profile = await requireProfile();
  if (profile.role !== "ceo") return { error: "Solo el CEO puede hacer esto." };
  return null;
}

/** Gastos fijos mensuales (SaaS y similares) — lista libre, el CEO agrega
 * o quita lo que quiera sin que nadie tenga que tocar código. */
export async function addGastoFijo(formData: FormData): Promise<ActionResult> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    const nombre = String(formData.get("nombre") ?? "").trim();
    const montoUsd = Number(formData.get("monto_usd") ?? 0);
    if (!nombre || !montoUsd || montoUsd <= 0) return { error: "Nombre y monto válido son obligatorios." };

    const supabase = await createClient();
    const { error } = await supabase.from("gastos_fijos").insert({ nombre, monto_usd: montoUsd });
    if (error) return { error: error.message };
    revalidatePath("/ceo");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function updateGastoFijo(id: string, nombre: string, montoUsd: number): Promise<ActionResult> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    if (!nombre.trim() || !montoUsd || montoUsd <= 0) return { error: "Nombre y monto válido son obligatorios." };
    const supabase = await createClient();
    const { error } = await supabase
      .from("gastos_fijos")
      .update({ nombre: nombre.trim(), monto_usd: montoUsd })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/ceo");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function deleteGastoFijo(id: string): Promise<ActionResult> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("gastos_fijos").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/ceo");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function updateUserPayrollRate(
  userId: string,
  modo: "semanal_fijo" | "por_pieza",
  monto: number,
  moneda: "USD" | "COP",
): Promise<ActionResult> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("user_payroll_rates")
      .upsert({ user_id: userId, modo, monto, moneda }, { onConflict: "user_id" });

    if (error) return { error: error.message };
    revalidatePath("/ceo");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

/** Esconde/muestra a alguien en la tabla de Nómina y lo excluye/incluye del
 * cálculo de costos y rentabilidad — funciona tenga o no una tarifa
 * configurada todavía. No toca su cuenta (sigue pudiendo iniciar sesión
 * normalmente, esto es solo de cara a la nómina). */
export async function setIncluirEnNomina(userId: string, incluir: boolean): Promise<ActionResult> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("users").update({ incluir_en_nomina: incluir }).eq("id", userId);
    if (error) return { error: error.message };
    revalidatePath("/ceo");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function markPayrollPaid(userId: string, weekStart: string): Promise<ActionResult> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("payroll_payments")
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("week_start", weekStart);

    if (error) return { error: error.message };
    revalidatePath("/ceo");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function unmarkPayrollPaid(userId: string, weekStart: string): Promise<ActionResult> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("payroll_payments")
      .update({ paid: false, paid_at: null })
      .eq("user_id", userId)
      .eq("week_start", weekStart);

    if (error) return { error: error.message };
    revalidatePath("/ceo");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}
