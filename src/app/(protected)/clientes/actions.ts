"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Ver nota en admin/usuarios/actions.ts: Next.js oculta el mensaje real de
// cualquier throw en una Server Action en producción, así que aquí siempre
// se devuelve { error } en vez de lanzar.
type ActionResult = { error?: string } | undefined;

async function requireAccessOrError(): Promise<{ error: string } | null> {
  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) {
    return { error: "No tienes acceso a la base de datos de clientes." };
  }
  return null;
}

export async function createClient_(formData: FormData): Promise<ActionResult> {
  const denied = await requireAccessOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();

    const name = String(formData.get("name") ?? "").trim();
    const whatsapp_number = String(formData.get("whatsapp_number") ?? "").trim();
    const country = String(formData.get("country") ?? "").trim();
    const tax_id = String(formData.get("tax_id") ?? "").trim();

    if (!name || !whatsapp_number) {
      return { error: "Nombre y WhatsApp son obligatorios." };
    }

    const { error } = await supabase.from("clients").insert({
      name,
      whatsapp_number,
      country: country || null,
      tax_id: tax_id || null,
    });
    if (error) return { error: error.message };
    revalidatePath("/clientes");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function updateClient(id: string, formData: FormData): Promise<ActionResult> {
  const denied = await requireAccessOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();

    const name = String(formData.get("name") ?? "").trim();
    const whatsapp_number = String(formData.get("whatsapp_number") ?? "").trim();
    const country = String(formData.get("country") ?? "").trim();
    const tax_id = String(formData.get("tax_id") ?? "").trim();

    if (!name || !whatsapp_number) {
      return { error: "Nombre y WhatsApp son obligatorios." };
    }

    // Ajustes manuales al histórico — vacío = deja el total calculado tal
    // cual, tal como estaba antes de que existiera este campo.
    const pedidosRaw = String(formData.get("historico_pedidos_ajuste") ?? "").trim();
    const gastoRaw = String(formData.get("historico_gasto_ajuste_usd") ?? "").trim();
    const historico_pedidos_ajuste = pedidosRaw === "" ? null : Number(pedidosRaw);
    const historico_gasto_ajuste_usd = gastoRaw === "" ? null : Number(gastoRaw);

    const { error } = await supabase
      .from("clients")
      .update({
        name,
        whatsapp_number,
        country: country || null,
        tax_id: tax_id || null,
        historico_pedidos_ajuste,
        historico_gasto_ajuste_usd,
      })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/clientes");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function deleteClient(id: string): Promise<ActionResult> {
  const denied = await requireAccessOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/clientes");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}
