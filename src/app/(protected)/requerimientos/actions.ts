"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { maybeGenerarEncuestaCalidad } from "@/lib/encuesta";
import type { RequerimientoEstado, Pipeline, PruebaSocialEstado, RequerimientoPagadoEstado } from "@/lib/statuses";

type ActionResult = { error?: string } | undefined;

export async function updatePruebaSocial(id: string, estado: PruebaSocialEstado): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    if (!["ceo", "gerente_comercial"].includes(profile.role)) {
      return { error: "Solo Gerente Comercial o el CEO pueden marcar prueba social." };
    }
    const supabase = await createClient();
    const { error } = await supabase.from("requerimientos").update({ prueba_social: estado }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/requerimientos");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function updateRequerimientoPagado(id: string, pagado: RequerimientoPagadoEstado): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    if (!["ceo", "gerente_comercial"].includes(profile.role)) {
      return { error: "Solo Gerente Comercial o el CEO pueden marcar el pago." };
    }
    const supabase = await createClient();
    const { error } = await supabase.from("requerimientos").update({ pagado }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/requerimientos");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function createRequerimiento(formData: FormData): Promise<ActionResult> {
  try {
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
        estado: encargadoId ? "En progreso" : "Nuevo pedido",
      })
      .select("id")
      .single();

    if (error) return { error: error.message };

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
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function updateRequerimientoEstado(id: string, estado: RequerimientoEstado): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.from("requerimientos").update({ estado }).eq("id", id);
    if (error) return { error: error.message };

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

    if (estado === "POR SUBIR") {
      const { data: req } = await supabase
        .from("requerimientos")
        .select("nombre_producto, pipeline, programador_id")
        .eq("id", id)
        .single();

      if (req?.pipeline === "landing") {
        if (req.programador_id) {
          await notify(
            supabase,
            req.programador_id,
            "asignado",
            `Lista para subir: ${req.nombre_producto ?? "landing page"}`,
            `/requerimientos/${id}`,
          );
        } else {
          const { data: programadores } = await supabase
            .from("users")
            .select("id")
            .eq("role", "programador")
            .eq("active", true);

          for (const p of programadores ?? []) {
            await notify(
              supabase,
              p.id,
              "asignado",
              `Lista para subir: ${req.nombre_producto ?? "landing page"}`,
              `/requerimientos/${id}`,
            );
          }
        }
      }
    }

    // Si con este cambio todo el pedido queda terminado, genera (una sola
    // vez) la encuesta de calidad y avisa al equipo comercial.
    await maybeGenerarEncuestaCalidad(supabase, id);

    revalidatePath("/requerimientos");
    revalidatePath(`/requerimientos/${id}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function assignProgramador(id: string, programadorId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: req, error } = await supabase
      .from("requerimientos")
      .update({ programador_id: programadorId })
      .eq("id", id)
      .select("nombre_producto")
      .single();

    if (error) return { error: error.message };

    await notify(
      supabase,
      programadorId,
      "asignado",
      `Se te asignó para subir: ${req?.nombre_producto ?? "requerimiento"}`,
      `/requerimientos/${id}`,
    );

    revalidatePath("/requerimientos");
    revalidatePath(`/requerimientos/${id}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function assignEncargado(id: string, encargadoId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: req, error } = await supabase
      .from("requerimientos")
      .update({ encargado_id: encargadoId, estado: "En progreso" })
      .eq("id", id)
      .select("nombre_producto")
      .single();

    if (error) return { error: error.message };

    await notify(
      supabase,
      encargadoId,
      "asignado",
      `Se te asignó: ${req?.nombre_producto ?? "requerimiento"}`,
      `/requerimientos/${id}`,
    );

    revalidatePath("/requerimientos");
    revalidatePath(`/requerimientos/${id}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function addComment(formData: FormData): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const requerimientoId = String(formData.get("requerimiento_id") ?? "");
    const body = String(formData.get("body") ?? "").trim();
    const mentionedUserId = String(formData.get("mentioned_user_id") ?? "") || null;

    if (!body) return {};

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado." };

    const { error } = await supabase.from("requerimiento_comments").insert({
      requerimiento_id: requerimientoId,
      author_id: user.id,
      body,
      mentioned_user_id: mentionedUserId,
    });
    if (error) return { error: error.message };

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
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}
