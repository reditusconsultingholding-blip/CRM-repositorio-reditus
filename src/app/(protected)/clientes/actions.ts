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

type ImportRow = { name: string; whatsapp_number: string; country: string | null; tax_id: string | null };
type ImportResult = { error?: string; creados?: number; actualizados?: number; omitidos?: number };

/** Importa clientes desde el CSV que exporta esta misma pantalla — busca
 * por WhatsApp (igual que al crear un ingreso) para no duplicar a nadie
 * que ya exista, y solo rellena nombre/país/NIT si venían vacíos. */
export async function importClientsCsv(rows: ImportRow[]): Promise<ImportResult> {
  const denied = await requireAccessOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    let creados = 0;
    let actualizados = 0;
    let omitidos = 0;

    for (const row of rows) {
      const name = row.name.trim();
      const whatsapp_number = row.whatsapp_number.trim();
      if (!name || !whatsapp_number) {
        omitidos++;
        continue;
      }
      const country = row.country?.trim() || null;
      const tax_id = row.tax_id?.trim() || null;

      const { data: existing } = await supabase
        .from("clients")
        .select("id, name, country, tax_id")
        .eq("whatsapp_number", whatsapp_number)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from("clients").insert({ name, whatsapp_number, country, tax_id });
        if (error) {
          omitidos++;
          continue;
        }
        creados++;
      } else {
        const patch: Record<string, string> = {};
        if (!existing.name && name) patch.name = name;
        if (!existing.country && country) patch.country = country;
        if (!existing.tax_id && tax_id) patch.tax_id = tax_id;
        if (Object.keys(patch).length > 0) {
          await supabase.from("clients").update(patch).eq("id", existing.id);
          actualizados++;
        } else {
          omitidos++;
        }
      }
    }

    revalidatePath("/clientes");
    return { creados, actualizados, omitidos };
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
