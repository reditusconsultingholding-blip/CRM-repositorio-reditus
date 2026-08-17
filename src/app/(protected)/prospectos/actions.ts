"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProspectoEstado } from "@/lib/statuses";

type ActionResult = { error?: string } | undefined;

export async function updateProspectoEstado(id: string, estado: ProspectoEstado): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("prospectos").update({ estado }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/prospectos");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function createProspectoManual(formData: FormData): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const nombre = String(formData.get("nombre") ?? "").trim();
    const whatsapp = String(formData.get("whatsapp_number") ?? "").trim() || null;
    const notas = String(formData.get("notas") ?? "").trim() || null;

    if (!nombre) return { error: "El nombre es obligatorio." };

    const { error } = await supabase.from("prospectos").insert({
      nombre,
      whatsapp_number: whatsapp,
      notas,
      origen: "manual",
    });
    if (error) return { error: error.message };
    revalidatePath("/prospectos");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}
