"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { IngresoEstado, EstadoPago } from "@/lib/statuses";

export async function createIngreso(formData: FormData) {
  const supabase = await createClient();

  const whatsappNumber = String(formData.get("whatsapp_number") ?? "").trim();
  const clientName = String(formData.get("client_name") ?? "").trim();
  const country = String(formData.get("pais") ?? "").trim() || null;
  const taxId = String(formData.get("client_tax_id") ?? "").trim() || null;

  if (!whatsappNumber || !clientName) {
    throw new Error("Número de WhatsApp y nombre del cliente son obligatorios.");
  }

  // Find-or-create the client by WhatsApp number (the unique client identifier).
  const { data: existingClient } = await supabase
    .from("clients")
    .select("id, tax_id")
    .eq("whatsapp_number", whatsappNumber)
    .maybeSingle();

  let clientId = existingClient?.id as string | undefined;

  if (!clientId) {
    const { data: newClient, error: clientError } = await supabase
      .from("clients")
      .insert({ whatsapp_number: whatsappNumber, name: clientName, country, tax_id: taxId })
      .select("id")
      .single();

    if (clientError) throw new Error(clientError.message);
    clientId = newClient.id;
  } else if (taxId && !existingClient?.tax_id) {
    // Backfill the NIT/Cédula on an existing client if we didn't have it yet.
    await supabase.from("clients").update({ tax_id: taxId }).eq("id", clientId);
  }

  const responsableId = String(formData.get("responsable_id") ?? "") || null;
  const cantidad = Number(formData.get("cantidad") ?? 1) || 1;

  const { error } = await supabase.from("ingresos").insert({
    client_id: clientId,
    servicio: String(formData.get("servicio") ?? "") || null,
    pais: country,
    producto: String(formData.get("producto") ?? "") || null,
    cantidad,
    precio_total: Number(formData.get("precio_total") ?? 0) || null,
    precio_final_descuento: Number(formData.get("precio_final_descuento") ?? 0) || null,
    responsable_id: responsableId,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/ingresos");
}

export async function updateEstadoPago(id: string, estadoPago: EstadoPago) {
  const supabase = await createClient();
  const { error } = await supabase.from("ingresos").update({ estado_pago: estadoPago }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/ingresos");
}

export async function updateIngresoEstado(id: string, estado: IngresoEstado) {
  const supabase = await createClient();
  const { error } = await supabase.from("ingresos").update({ estado }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/ingresos");
}
