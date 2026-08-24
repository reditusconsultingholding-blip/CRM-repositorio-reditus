"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string } | undefined;

export async function marcarItem(itemId: string, completado: boolean): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    const supabase = await createClient();

    if (completado) {
      const { error } = await supabase
        .from("checklist_marcas")
        .upsert(
          { user_id: profile.id, item_id: itemId, fecha: new Date().toISOString().slice(0, 10), completado: true },
          { onConflict: "user_id,item_id,fecha" },
        );
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase
        .from("checklist_marcas")
        .delete()
        .eq("user_id", profile.id)
        .eq("item_id", itemId)
        .eq("fecha", new Date().toISOString().slice(0, 10));
      if (error) return { error: error.message };
    }

    revalidatePath("/checklist");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

async function requireCeoOrError(): Promise<{ error: string } | null> {
  const profile = await requireProfile();
  if (profile.role !== "ceo") return { error: "Solo el CEO puede editar el checklist." };
  return null;
}

export async function crearItem(role: string, texto: string, orden: number): Promise<ActionResult> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    const limpio = texto.trim();
    if (!limpio) return { error: "Escribe una tarea." };
    const { error } = await supabase.from("checklist_items").insert({ role, texto: limpio, orden });
    if (error) return { error: error.message };
    revalidatePath("/checklist");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function editarItem(id: string, texto: string): Promise<ActionResult> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    const limpio = texto.trim();
    if (!limpio) return { error: "La tarea no puede quedar vacía." };
    const { error } = await supabase.from("checklist_items").update({ texto: limpio }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/checklist");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function eliminarItem(id: string): Promise<ActionResult> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("checklist_items").update({ activo: false }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/checklist");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}
