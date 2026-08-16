"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function requireCeo() {
  const profile = await requireProfile();
  if (profile.role !== "ceo") throw new Error("Solo el CEO puede hacer esto.");
}

export async function updatePayrollSettings(formData: FormData) {
  await requireCeo();
  const supabase = await createClient();

  const num = (key: string) => Number(formData.get(key) ?? 0) || 0;

  const { error } = await supabase
    .from("payroll_settings")
    .update({
      disenadora_landing_usd_dia: num("disenadora_landing_usd_dia"),
      gerente_comercial_usd_dia: num("gerente_comercial_usd_dia"),
      project_manager_usd_dia: num("project_manager_usd_dia"),
      dias_por_semana: num("dias_por_semana"),
      editor_video_usd_por_video: num("editor_video_usd_por_video"),
      programador_cop_por_pagina: num("programador_cop_por_pagina"),
      elevenlabs_usd_mes: num("elevenlabs_usd_mes"),
      google_storage_usd_mes: num("google_storage_usd_mes"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

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
