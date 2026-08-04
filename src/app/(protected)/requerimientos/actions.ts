"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { RequerimientoEstado, Pipeline } from "@/lib/statuses";

async function notify(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  type: "nuevo_pedido" | "asignado" | "correccion" | "mencion" | "terminado",
  title: string,
  link: string,
) {
  await supabase.from("notifications").insert({ user_id: userId, type, title, link });
}

export async function createRequerimiento(formData: FormData) {
  const supabase = await createClient();

  const encargadoId = String(formData.get("encargado_id") ?? "") || null;
  const pipeline = String(formData.get("pipeline") ?? "") as Pipeline;

  const { data, error } = await supabase
    .from("requerimientos")
    .insert({
      pipeline,
      nombre_producto: String(formData.get("nombre_producto") ?? "") || null,
      requerimiento_texto: String(formData.get("requerimiento_texto") ?? "") || null,
      pais_acento: String(formData.get("pais_acento") ?? "") || null,
      carpeta_drive_url: String(formData.get("carpeta_drive_url") ?? "") || null,
      f_entrega_prometida: String(formData.get("f_entrega_prometida") ?? "") || null,
      encargado_id: encargadoId,
      estado: encargadoId ? "Asignado" : "Nuevo pedido",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  if (encargadoId) {
    await notify(
      supabase,
      encargadoId,
      "asignado",
      `Se te asignó un nuevo requerimiento: ${formData.get("nombre_producto")}`,
      `/requerimientos/${data.id}`,
    );
  }

  revalidatePath("/requerimientos");
}

export async function updateRequerimientoEstado(id: string, estado: RequerimientoEstado) {
  const supabase = await createClient();

  const { error } = await supabase.from("requerimientos").update({ estado }).eq("id", id);
  if (error) throw new Error(error.message);

  if (estado === "Terminado") {
    const { data: req } = await supabase
      .from("requerimientos")
      .select("nombre_producto")
      .eq("id", id)
      .single();

    const { data: directoras } = await supabase
      .from("users")
      .select("id")
      .eq("role", "directora_operativa")
      .eq("active", true);

    for (const d of directoras ?? []) {
      await notify(
        supabase,
        d.id,
        "terminado",
        `Listo para entregar: ${req?.nombre_producto ?? "requerimiento"}`,
        `/requerimientos/${id}`,
      );
    }
  }

  revalidatePath("/requerimientos");
  revalidatePath(`/requerimientos/${id}`);
}

export async function assignEncargado(id: string, encargadoId: string) {
  const supabase = await createClient();

  const { data: req, error } = await supabase
    .from("requerimientos")
    .update({ encargado_id: encargadoId, estado: "Asignado" })
    .eq("id", id)
    .select("nombre_producto")
    .single();

  if (error) throw new Error(error.message);

  await notify(
    supabase,
    encargadoId,
    "asignado",
    `Se te asignó: ${req?.nombre_producto ?? "requerimiento"}`,
    `/requerimientos/${id}`,
  );

  revalidatePath("/requerimientos");
  revalidatePath(`/requerimientos/${id}`);
}

export async function addComment(formData: FormData) {
  const supabase = await createClient();
  const requerimientoId = String(formData.get("requerimiento_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const mentionedUserId = String(formData.get("mentioned_user_id") ?? "") || null;

  if (!body) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("requerimiento_comments").insert({
    requerimiento_id: requerimientoId,
    author_id: user!.id,
    body,
    mentioned_user_id: mentionedUserId,
  });

  if (error) throw new Error(error.message);

  if (mentionedUserId) {
    await notify(
      supabase,
      mentionedUserId,
      "mencion",
      "Te mencionaron en un requerimiento",
      `/requerimientos/${requerimientoId}`,
    );
  }

  revalidatePath(`/requerimientos/${requerimientoId}`);
}
