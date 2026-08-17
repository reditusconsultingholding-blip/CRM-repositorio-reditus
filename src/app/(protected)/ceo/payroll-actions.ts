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

/** Costos fijos mensuales de SaaS — no varían por persona. */
export async function updateSaasSettings(formData: FormData): Promise<ActionResult> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    const num = (key: string) => Number(formData.get(key) ?? 0) || 0;

    const { error } = await supabase
      .from("payroll_settings")
      .update({
        elevenlabs_usd_mes: num("elevenlabs_usd_mes"),
        google_storage_usd_mes: num("google_storage_usd_mes"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);

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
