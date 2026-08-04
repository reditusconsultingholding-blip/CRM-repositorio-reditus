"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { IngresoEstado } from "@/lib/statuses";

export async function createIngreso(formData: FormData) {
  const supabase = await createClient();

  const whatsappNumber = String(formData.get("whatsapp_number") ?? "").trim();
  const clientName = String(formData.get("client_name") ?? "").trim();
  const country = String(formData.get("pais") ?? "").trim() || null;

  if (!whatsappNumber || !clientName) {
    throw new Error("Número de WhatsApp y nombre del cliente son obligatorios.");
  }

  // Find-or-create the client by WhatsApp number (the unique client identifier).
  const { data: existingClient } = await supabase
    .from("clients")
    .select("id")
    .eq("whatsapp_number", whatsappNumber)
    .maybeSingle();

  let clientId = existingClient?.id as string | undefined;

  if (!clientId) {
    const { data: newClient, error: clientError } = await supabase
      .from("clients")
      .insert({ whatsapp_number: whatsappNumber, name: clientName, country })
      .select("id")
      .single();

    if (clientError) throw new Error(clientError.message);
    clientId = newClient.id;
  }

  const responsableId = String(formData.get("responsable_id") ?? "") || null;

  const { error } = await supabase.from("ingresos").insert({
    client_id: clientId,
    servicio: String(formData.get("servicio") ?? "") || null,
    pais: country,
    producto: String(formData.get("producto") ?? "") || null,
    precio_total: Number(formData.get("precio_total") ?? 0) || null,
    precio_final_descuento: Number(formData.get("precio_final_descuento") ?? 0) || null,
    estado_pago: String(formData.get("estado_pago") ?? "") || null,
    responsable_id: responsableId,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/ingresos");
}

export async function updateIngresoEstado(id: string, estado: IngresoEstado) {
  const supabase = await createClient();
  const { error } = await supabase.from("ingresos").update({ estado }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/ingresos");
}
