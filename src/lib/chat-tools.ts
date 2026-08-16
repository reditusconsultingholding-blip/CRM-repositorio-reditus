import "server-only";
import { createClient } from "@/lib/supabase/server";
import { guessUnitPriceUsd } from "@/lib/pricing-catalog";
import { notifyNewIngreso } from "@/lib/notify-new-ingreso";

export type CotizacionItemInput = {
  servicio?: string;
  producto: string;
  cantidad: number;
  precio_unitario_usd?: number;
};

export type CrearCotizacionInput = {
  cliente_nombre: string;
  cliente_whatsapp: string;
  cliente_pais?: string;
  cliente_tax_id?: string;
  responsable_id?: string;
  items: CotizacionItemInput[];
};

/** Crea un ingreso real (mismo camino que el formulario "Nuevo ingreso" de
 * /ingresos) desde una conversación con el asistente del CEO. Genera de una
 * vez el número de cotización y el link del PDF. Si no se da precio unitario,
 * lo calcula con la tabla de precios oficial (src/lib/pricing-catalog.ts). */
export async function crearCotizacionDesdeChat(input: CrearCotizacionInput) {
  const supabase = await createClient();

  const whatsapp = input.cliente_whatsapp.trim();
  const nombre = input.cliente_nombre.trim();
  if (!whatsapp || !nombre) {
    throw new Error("Falta el nombre del cliente o su número de WhatsApp.");
  }
  if (!input.items?.length) {
    throw new Error("Falta al menos un servicio/producto para la cotización.");
  }

  const items = input.items.map((it) => {
    const cantidad = Math.max(1, Math.round(Number(it.cantidad) || 1));
    const precio =
      it.precio_unitario_usd != null && it.precio_unitario_usd > 0
        ? it.precio_unitario_usd
        : guessUnitPriceUsd(`${it.servicio ?? ""} ${it.producto}`, cantidad);
    if (precio == null) {
      throw new Error(
        `No pude adivinar el precio de "${it.producto}" — da un precio_unitario_usd explícito para este ítem.`,
      );
    }
    return { servicio: it.servicio?.trim() || null, producto: it.producto.trim(), cantidad, precio };
  });

  // Find-or-create cliente por WhatsApp (mismo identificador único que usa
  // el resto de la app).
  const { data: existingClient } = await supabase
    .from("clients")
    .select("id, tax_id")
    .eq("whatsapp_number", whatsapp)
    .maybeSingle();

  let clientId = existingClient?.id as string | undefined;
  const esClienteNuevo = !clientId;

  if (!clientId) {
    const { data: newClient, error: clientError } = await supabase
      .from("clients")
      .insert({
        whatsapp_number: whatsapp,
        name: nombre,
        country: input.cliente_pais?.trim() || null,
        tax_id: input.cliente_tax_id?.trim() || null,
      })
      .select("id")
      .single();
    if (clientError) throw new Error(clientError.message);
    clientId = newClient.id;
  } else if (input.cliente_tax_id && !existingClient?.tax_id) {
    await supabase.from("clients").update({ tax_id: input.cliente_tax_id.trim() }).eq("id", clientId);
  }

  const cantidadTotal = items.reduce((s, it) => s + it.cantidad, 0);
  const precioTotal = items.reduce((s, it) => s + it.cantidad * it.precio, 0);

  const { data: ingreso, error } = await supabase
    .from("ingresos")
    .insert({
      client_id: clientId,
      servicio: items.map((it) => it.servicio).filter(Boolean).join(", ") || null,
      pais: input.cliente_pais?.trim() || null,
      producto: items.map((it) => it.producto).join(", ") || null,
      cantidad: cantidadTotal,
      precio_total: precioTotal,
      precio_final_descuento: precioTotal,
      responsable_id: input.responsable_id || null,
    })
    .select("id, tracking_id, cotizacion_numero")
    .single();

  if (error) throw new Error(error.message);

  const { error: itemsError } = await supabase.from("ingreso_items").insert(
    items.map((it) => ({
      ingreso_id: ingreso.id,
      servicio: it.servicio,
      producto: it.producto,
      cantidad: it.cantidad,
      precio_unitario: it.precio,
    })),
  );
  if (itemsError) throw new Error(itemsError.message);

  await notifyNewIngreso({
    producto: items.map((it) => it.producto).join(", "),
    totalUsd: precioTotal,
    clienteNombre: nombre,
  });

  return {
    ingresoId: ingreso.id,
    trackingId: ingreso.tracking_id,
    cotizacionNumero: ingreso.cotizacion_numero,
    clienteEsNuevo: esClienteNuevo,
    totalUsd: precioTotal,
    items,
    pdfUrl: `/api/documentos/${ingreso.id}/cotizacion`,
  };
}
