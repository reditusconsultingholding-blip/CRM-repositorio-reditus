"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function requireClientesAccess() {
  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) {
    throw new Error("No tienes acceso a la base de datos de clientes.");
  }
}

export async function createClient_(formData: FormData) {
  await requireClientesAccess();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const whatsapp_number = String(formData.get("whatsapp_number") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const tax_id = String(formData.get("tax_id") ?? "").trim();

  if (!name || !whatsapp_number) {
    throw new Error("Nombre y WhatsApp son obligatorios.");
  }

  const { error } = await supabase.from("clients").insert({
    name,
    whatsapp_number,
    country: country || null,
    tax_id: tax_id || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
}

export async function updateClient(id: string, formData: FormData) {
  await requireClientesAccess();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const whatsapp_number = String(formData.get("whatsapp_number") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const tax_id = String(formData.get("tax_id") ?? "").trim();

  if (!name || !whatsapp_number) {
    throw new Error("Nombre y WhatsApp son obligatorios.");
  }

  const { error } = await supabase
    .from("clients")
    .update({ name, whatsapp_number, country: country || null, tax_id: tax_id || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
}

export async function deleteClient(id: string) {
  await requireClientesAccess();
  const supabase = await createClient();
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
}
