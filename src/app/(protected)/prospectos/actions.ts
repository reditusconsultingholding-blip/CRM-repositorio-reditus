"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProspectoEstado } from "@/lib/statuses";

export async function updateProspectoEstado(id: string, estado: ProspectoEstado) {
  const supabase = await createClient();
  const { error } = await supabase.from("prospectos").update({ estado }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/prospectos");
}

export async function createProspectoManual(formData: FormData) {
  const supabase = await createClient();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp_number") ?? "").trim() || null;
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!nombre) throw new Error("El nombre es obligatorio.");

  const { error } = await supabase.from("prospectos").insert({
    nombre,
    whatsapp_number: whatsapp,
    notas,
    origen: "manual",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/prospectos");
}
