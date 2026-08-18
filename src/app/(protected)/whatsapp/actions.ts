"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string } | undefined;

async function requireCeo() {
  const profile = await requireProfile();
  if (profile.role !== "ceo") return { error: "Solo el CEO puede editar la base de conocimiento." };
  return { profile, error: null as string | null };
}

export async function addBotKnowledgeSection(titulo: string): Promise<ActionResult> {
  const { profile, error: denied } = await requireCeo();
  if (denied) return { error: denied };
  try {
    if (!titulo.trim()) return { error: "Ponle un nombre a la sección." };
    const supabase = await createClient();
    const { count } = await supabase
      .from("bot_knowledge_sections")
      .select("id", { count: "exact", head: true });
    const { error } = await supabase.from("bot_knowledge_sections").insert({
      titulo: titulo.trim(),
      contenido: "",
      orden: count ?? 0,
      updated_by: profile!.id,
    });
    if (error) return { error: error.message };
    revalidatePath("/whatsapp");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo agregar la sección." };
  }
}

export async function updateBotKnowledgeSection(id: string, titulo: string, contenido: string): Promise<ActionResult> {
  const { profile, error: denied } = await requireCeo();
  if (denied) return { error: denied };
  try {
    if (!titulo.trim()) return { error: "El título no puede quedar vacío." };
    const supabase = await createClient();
    const { error } = await supabase
      .from("bot_knowledge_sections")
      .update({ titulo: titulo.trim(), contenido, updated_by: profile!.id })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/whatsapp");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar." };
  }
}

export async function deleteBotKnowledgeSection(id: string): Promise<ActionResult> {
  const { error: denied } = await requireCeo();
  if (denied) return { error: denied };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("bot_knowledge_sections").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/whatsapp");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo borrar." };
  }
}
