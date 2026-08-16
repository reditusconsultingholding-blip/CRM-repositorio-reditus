"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { IngresoEstado, EstadoPago } from "@/lib/statuses";

type ItemInput = {
  servicio: string;
  producto: string;
  cantidad: number;
  precio_unitario: number;
};

export async function createIngreso(formData: FormData) {
  const supabase = await createClient();

  const whatsappNumber = String(formData.get("whatsapp_number") ?? "").trim();
  const clientName = String(formData.get("client_name") ?? "").trim();
  const country = String(formData.get("pais") ?? "").trim() || null;
  const taxId = String(formData.get("client_tax_id") ?? "").trim() || null;

  if (!whatsappNumber || !clientName) {
    throw new Error("Número de WhatsApp y nombre del cliente son obligatorios.");
  }

  // Servicios combinados: una o varias líneas (ej. 10 landing pages + 10
  // videos en un mismo pedido, cada una con su propio precio).
  let items: ItemInput[] = [];
  try {
    const raw = JSON.parse(String(formData.get("items_json") ?? "[]")) as unknown[];
    items = (Array.isArray(raw) ? raw : [])
      .map((it) => {
        const o = it as Record<string, unknown>;
        return {
          servicio: String(o.servicio ?? "").trim(),
          producto: String(o.producto ?? "").trim(),
          cantidad: Number(o.cantidad) || 1,
          precio_unitario: Number(o.precio_unitario) || 0,
        };
      })
      .filter((it) => it.producto);
  } catch {
    items = [];
  }

  if (items.length === 0) {
    throw new Error("Agrega al menos un servicio/producto al ingreso.");
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

  const cantidadTotal = items.reduce((sum, it) => sum + it.cantidad, 0);
  const precioTotal = items.reduce((sum, it) => sum + it.cantidad * it.precio_unitario, 0);
  const precioFinalOverride = Number(formData.get("precio_final_descuento") ?? 0) || null;

  const { data: ingreso, error } = await supabase
    .from("ingresos")
    .insert({
      client_id: clientId,
      servicio: items.map((it) => it.servicio).filter(Boolean).join(", ") || null,
      pais: country,
      producto: items.map((it) => it.producto).join(", ") || null,
      cantidad: cantidadTotal,
      precio_total: precioTotal,
      precio_final_descuento: precioFinalOverride ?? precioTotal,
      responsable_id: responsableId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const { error: itemsError } = await supabase.from("ingreso_items").insert(
    items.map((it) => ({
      ingreso_id: ingreso.id,
      servicio: it.servicio || null,
      producto: it.producto,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
    })),
  );

  if (itemsError) throw new Error(itemsError.message);

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
