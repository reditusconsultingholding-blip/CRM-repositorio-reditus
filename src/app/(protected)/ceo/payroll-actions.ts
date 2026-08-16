"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function requireCeo() {
  const profile = await requireProfile();
  if (profile.role !== "ceo") throw new Error("Solo el CEO puede hacer esto.");
}

/** Costos fijos mensuales de SaaS — no varían por persona. */
export async function updateSaasSettings(formData: FormData) {
  await requireCeo();
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

  if (error) throw new Error(error.message);

  revalidatePath("/ceo");
}

export async function updateUserPayrollRate(
  userId: string,
  modo: "semanal_fijo" | "por_pieza",
  monto: number,
  moneda: "USD" | "COP",
) {
  await requireCeo();
  const supabase = await createClient();

  const { error } = await supabase
    .from("user_payroll_rates")
    .upsert({ user_id: userId, modo, monto, moneda }, { onConflict: "user_id" });

  if (error) throw new Error(error.message);

  revalidatePath("/ceo");
}

export async function markPayrollPaid(userId: string, weekStart: string) {
  await requireCeo();
  const supabase = await createClient();

  const { error } = await supabase
    .from("payroll_payments")
    .update({ paid: true, paid_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("week_start", weekStart);

  if (error) throw new Error(error.message);

  revalidatePath("/ceo");
}

export async function unmarkPayrollPaid(userId: string, weekStart: string) {
  await requireCeo();
  const supabase = await createClient();

  const { error } = await supabase
    .from("payroll_payments")
    .update({ paid: false, paid_at: null })
    .eq("user_id", userId)
    .eq("week_start", weekStart);

  if (error) throw new Error(error.message);

  revalidatePath("/ceo");
}
