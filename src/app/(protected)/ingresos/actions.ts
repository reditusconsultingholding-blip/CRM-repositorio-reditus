"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SERVICIO_TO_PIPELINE, type IngresoEstado, type EstadoPago, type IngresoServicio } from "@/lib/statuses";
import { notifyNewIngreso } from "@/lib/notify-new-ingreso";
import { verifyTotpCode } from "@/lib/totp";
import { getOrCreateClienteDriveFolders } from "@/lib/google-drive";

type ItemInput = {
  servicio: string;
  producto: string;
  cantidad: number;
  precio_unitario: number;
};

type ActionResult = { error?: string } | undefined;

// Máximo de requerimientos individuales que se auto-crean por línea de
// servicio, por seguridad (ej. si alguien escribe "500" por error).
const MAX_AUTO_REQUERIMIENTOS_POR_ITEM = 30;

// El servicio ahora viene de un desplegable cerrado (INGRESO_SERVICIOS),
// no de texto libre — así el mapeo a pipeline es exacto, no una
// adivinanza por palabras clave que podía fallar.
function inferPipeline(servicio: string) {
  return SERVICIO_TO_PIPELINE[servicio as IngresoServicio] ?? null;
}

/** Crea automáticamente un requerimiento por cada unidad de un ingreso
 * cuyo servicio se pueda identificar como video o landing — así queda
 * trazabilidad directa (ingreso_id) y el equipo puede empezar sin que
 * alguien tenga que crearlo a mano. Las líneas que no se puedan clasificar
 * se omiten (mejor no crear nada que crear algo mal). */
async function autoCrearRequerimientos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ingresoId: string,
  trackingId: string,
  items: ItemInput[],
  pais: string | null,
  clientName: string,
) {
  const { data: directoras } = await supabase
    .from("users")
    .select("id")
    .eq("role", "directora_operativa")
    .eq("active", true)
    .limit(1);
  const directoraId: string | null = directoras?.[0]?.id ?? null;

  // Carpeta de Drive del cliente (o su siguiente "Proyecto #N" si ya
  // existía) — si Drive no está configurado esto devuelve null y
  // simplemente se deja el campo vacío, no bloquea nada.
  const drive = await getOrCreateClienteDriveFolders(clientName);

  let creoAlguno = false;
  for (const item of items) {
    const pipeline = inferPipeline(item.servicio);
    if (!pipeline) continue;
    creoAlguno = true;

    const unidades = Math.min(Math.max(item.cantidad, 1), MAX_AUTO_REQUERIMIENTOS_POR_ITEM);
    const encargadoId = pipeline === "landing" ? directoraId : null;

    const rows = Array.from({ length: unidades }, (_, i) => ({
      pipeline,
      nombre_producto: unidades > 1 ? `${item.producto} (${i + 1}/${unidades}) — ${trackingId}` : `${item.producto} — ${trackingId}`,
      pais_acento: pais,
      encargado_id: encargadoId,
      estado: encargadoId ? "En progreso" : "Nuevo pedido",
      ingreso_id: ingresoId,
      carpeta_drive_url: drive?.proyectoFolderUrl ?? null,
    }));

    await supabase.from("requerimientos").insert(rows);
  }
  return creoAlguno;
}

export async function createIngreso(formData: FormData): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const whatsappNumber = String(formData.get("whatsapp_number") ?? "").trim();
    const clientName = String(formData.get("client_name") ?? "").trim();
    const country = String(formData.get("pais") ?? "").trim() || null;
    const taxId = String(formData.get("client_tax_id") ?? "").trim() || null;
    const moneda = String(formData.get("moneda") ?? "USD") === "COP" ? "COP" : "USD";

    if (!whatsappNumber || !clientName) {
      return { error: "Número de WhatsApp y nombre del cliente son obligatorios." };
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
      return { error: "Agrega al menos un servicio/producto al ingreso." };
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

      if (clientError) return { error: clientError.message };
      clientId = newClient.id;
    } else if (taxId && !existingClient?.tax_id) {
      // Backfill the NIT/Cédula on an existing client if we didn't have it yet.
      await supabase.from("clients").update({ tax_id: taxId }).eq("id", clientId);
    }

    // Si este cliente llegó como prospecto de WhatsApp, lo marca como
    // "convertido" y lo liga al cliente real — así la Línea de ventas
    // puede mostrar el pipeline completo (interesado → convertido).
    await supabase
      .from("prospectos")
      .update({ client_id: clientId, estado: "convertido" })
      .eq("whatsapp_number", whatsappNumber)
      .neq("estado", "convertido");

    const responsableId = String(formData.get("responsable_id") ?? "") || null;

    const cantidadTotal = items.reduce((sum, it) => sum + it.cantidad, 0);
    const precioTotal = items.reduce((sum, it) => sum + it.cantidad * it.precio_unitario, 0);
    const precioFinalOverride = Number(formData.get("precio_final_descuento") ?? 0) || null;

    // Etapa 2 vs 3 del flujo comercial: si es solo una cotización enviada
    // (el cliente no ha confirmado), no cuenta como ingreso real todavía
    // y no se dispara producción — eso pasa recién cuando se cierre.
    const esCotizacion = String(formData.get("es_cotizacion") ?? "") === "on";
    const estadoComercial = esCotizacion ? "Cotizado" : "Cerrado";

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
        moneda,
        responsable_id: responsableId,
        estado_comercial: estadoComercial,
      })
      .select("id, tracking_id")
      .single();

    if (error) return { error: error.message };

    const { error: itemsError } = await supabase.from("ingreso_items").insert(
      items.map((it) => ({
        ingreso_id: ingreso.id,
        servicio: it.servicio || null,
        producto: it.producto,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
      })),
    );
    if (itemsError) return { error: itemsError.message };

    if (!esCotizacion) {
      await autoCrearRequerimientos(supabase, ingreso.id, ingreso.tracking_id, items, country, clientName);
      await notifyNewIngreso({
        producto: items.map((it) => it.producto).join(", "),
        totalUsd: precioFinalOverride ?? precioTotal,
        clienteNombre: clientName,
      });
    }

    revalidatePath("/ingresos");
    revalidatePath("/requerimientos");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

/** Etapa 3 (Cierre): el cliente confirma una cotización que estaba
 * pendiente — recién aquí se dispara lo que antes pasaba siempre al
 * crear el ingreso (auto-crear requerimientos + notificar), porque hasta
 * ahora no era un pedido real todavía. */
export async function marcarIngresoCerrado(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: ingreso, error: fetchError } = await supabase
      .from("ingresos")
      .select(
        "id, tracking_id, pais, producto, precio_final_descuento, estado_comercial, client:clients(name)",
      )
      .eq("id", id)
      .single<{
        id: string;
        tracking_id: string;
        pais: string | null;
        producto: string | null;
        precio_final_descuento: number | null;
        estado_comercial: string;
        client: { name: string } | { name: string }[] | null;
      }>();
    if (fetchError || !ingreso) return { error: "Ese ingreso ya no existe." };
    if (ingreso.estado_comercial === "Cerrado") return {};

    const { data: items } = await supabase
      .from("ingreso_items")
      .select("servicio, producto, cantidad, precio_unitario")
      .eq("ingreso_id", id);

    const { error } = await supabase.from("ingresos").update({ estado_comercial: "Cerrado" }).eq("id", id);
    if (error) return { error: error.message };

    const clientName = (Array.isArray(ingreso.client) ? ingreso.client[0]?.name : ingreso.client?.name) ?? "Cliente";
    await autoCrearRequerimientos(
      supabase,
      ingreso.id,
      ingreso.tracking_id,
      (items ?? []).map((it) => ({
        servicio: it.servicio ?? "",
        producto: it.producto,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
      })),
      ingreso.pais,
      clientName,
    );
    await notifyNewIngreso({
      producto: ingreso.producto ?? "",
      totalUsd: Number(ingreso.precio_final_descuento ?? 0),
      clienteNombre: clientName,
    });

    revalidatePath("/ingresos");
    revalidatePath("/requerimientos");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

/** Edita un ingreso ya existente (cliente, servicios/productos, precio,
 * moneda, país, responsable) — antes solo se podía crear, sin forma de
 * corregir un error de digitación. Solo CEO/Gerente Comercial, igual que
 * el borrado, porque toca datos sensibles (precio, cliente). */
export async function updateIngreso(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    if (!(INGRESOS_ROLES as string[]).includes(profile.role)) {
      return { error: "No tienes permiso para editar ingresos." };
    }

    const supabase = await createClient();

    const whatsappNumber = String(formData.get("whatsapp_number") ?? "").trim();
    const clientName = String(formData.get("client_name") ?? "").trim();
    const country = String(formData.get("pais") ?? "").trim() || null;
    const taxId = String(formData.get("client_tax_id") ?? "").trim() || null;
    const moneda = String(formData.get("moneda") ?? "USD") === "COP" ? "COP" : "USD";

    if (!whatsappNumber || !clientName) {
      return { error: "Número de WhatsApp y nombre del cliente son obligatorios." };
    }

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
      return { error: "Agrega al menos un servicio/producto al ingreso." };
    }

    const { data: existingIngreso, error: fetchError } = await supabase
      .from("ingresos")
      .select("client_id")
      .eq("id", id)
      .single();
    if (fetchError || !existingIngreso) return { error: "Ese ingreso ya no existe." };

    const { error: clientError } = await supabase
      .from("clients")
      .update({ name: clientName, whatsapp_number: whatsappNumber, country, tax_id: taxId })
      .eq("id", existingIngreso.client_id);
    if (clientError) return { error: clientError.message };

    const responsableId = String(formData.get("responsable_id") ?? "") || null;
    const cantidadTotal = items.reduce((sum, it) => sum + it.cantidad, 0);
    const precioTotal = items.reduce((sum, it) => sum + it.cantidad * it.precio_unitario, 0);
    const precioFinalOverride = Number(formData.get("precio_final_descuento") ?? 0) || null;

    const { error } = await supabase
      .from("ingresos")
      .update({
        servicio: items.map((it) => it.servicio).filter(Boolean).join(", ") || null,
        pais: country,
        producto: items.map((it) => it.producto).join(", ") || null,
        cantidad: cantidadTotal,
        precio_total: precioTotal,
        precio_final_descuento: precioFinalOverride ?? precioTotal,
        moneda,
        responsable_id: responsableId,
      })
      .eq("id", id);
    if (error) return { error: error.message };

    // Reemplaza las líneas de servicio en vez de diferenciar item por item —
    // más simple y confiable, y son listas cortas.
    await supabase.from("ingreso_items").delete().eq("ingreso_id", id);
    const { error: itemsError } = await supabase.from("ingreso_items").insert(
      items.map((it) => ({
        ingreso_id: id,
        servicio: it.servicio || null,
        producto: it.producto,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
      })),
    );
    if (itemsError) return { error: itemsError.message };

    revalidatePath("/ingresos");
    revalidatePath("/clientes");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function updateEstadoPago(id: string, estadoPago: EstadoPago): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("ingresos").update({ estado_pago: estadoPago }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/ingresos");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function updateIngresoEstado(id: string, estado: IngresoEstado): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("ingresos").update({ estado }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/ingresos");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

/** Borra un ingreso — solo CEO/Gerente Comercial, y solo con el código de
 * autenticador vigente (Configuración → Código de borrado), para que no
 * sea un borrado de un solo clic por accidente. */
export async function deleteIngreso(id: string, code: string): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    if (!(INGRESOS_ROLES as string[]).includes(profile.role)) {
      return { error: "No tienes permiso para borrar ingresos." };
    }
    if (!verifyTotpCode(code)) {
      return { error: "Código incorrecto o vencido. Revisa el código actual en Configuración." };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("ingresos").delete().eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/ingresos");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}
