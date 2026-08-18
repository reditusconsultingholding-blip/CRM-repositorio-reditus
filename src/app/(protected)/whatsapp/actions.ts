"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string } | undefined;

export async function updateBotKnowledge(contenido: string): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    if (profile.role !== "ceo") return { error: "Solo el CEO puede editar la base de conocimiento." };

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("bot_knowledge_base")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("bot_knowledge_base")
        .update({ contenido, updated_by: profile.id })
        .eq("id", existing.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase
        .from("bot_knowledge_base")
        .insert({ contenido, updated_by: profile.id });
      if (error) return { error: error.message };
    }
    revalidatePath("/whatsapp");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar." };
  }
}
