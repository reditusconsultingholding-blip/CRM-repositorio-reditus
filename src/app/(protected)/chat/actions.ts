"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";

type Attachment = { url: string; name: string; size: number } | null;
type ActionResult = { error?: string } | undefined;

export async function sendChannelMessage(
  channelId: string,
  body: string,
  replyToId?: string | null,
  attachment?: Attachment,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado." };

    const text = body.trim() || attachment?.name || "";
    if (!text) return {};

    const { error } = await supabase.from("chat_messages").insert({
      channel_id: channelId,
      author_id: user.id,
      body: text,
      reply_to_id: replyToId || null,
      attachment_url: attachment?.url ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_size: attachment?.size ?? null,
    });
    if (error) return { error: error.message };

    revalidatePath("/chat");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo enviar el mensaje." };
  }
}

export async function sendDirectMessage(
  recipientId: string,
  body: string,
  replyToId?: string | null,
  attachment?: Attachment,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado." };

    const text = body.trim() || attachment?.name || "";
    if (!text) return {};

    const { error } = await supabase.from("chat_messages").insert({
      recipient_id: recipientId,
      author_id: user.id,
      body: text,
      reply_to_id: replyToId || null,
      attachment_url: attachment?.url ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_size: attachment?.size ?? null,
    });
    if (error) return { error: error.message };

    await notify(supabase, recipientId, "mensaje_directo", `Mensaje nuevo: ${text.slice(0, 80)}`, "/chat");

    revalidatePath("/chat");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo enviar el mensaje." };
  }
}

/** Marca el chat como leído "ahora" para el usuario actual — resetea la
 * burbuja de mensajes pendientes en la barra lateral. */
export async function markChatRead() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("users").update({ last_chat_read_at: new Date().toISOString() }).eq("id", user.id);
  } catch {
    // best-effort, no bloquea la UI si falla
  }
}

/** Marca como leído un canal o DM puntual (clave = "canal:<id>" o
 * "dm:<userId>") — a diferencia de markChatRead (global), esto es lo que
 * hace que la burbuja de "no leído" desaparezca solo para esa conversación
 * al entrar a ella, no para todo el chat. */
export async function markChatEntryRead(clave: string): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("chat_lecturas")
      .upsert({ user_id: user.id, clave, last_read_at: new Date().toISOString() }, { onConflict: "user_id,clave" });
  } catch {
    // best-effort
  }
}

export async function toggleReaction(messageId: string, emoji: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado." };

    const { data: existing } = await supabase
      .from("chat_message_reactions")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", user.id)
      .eq("emoji", emoji)
      .maybeSingle();

    if (existing) {
      await supabase.from("chat_message_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("chat_message_reactions").insert({ message_id: messageId, user_id: user.id, emoji });
    }
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo reaccionar." };
  }
}

export async function deleteMessage(messageId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado." };

    // Sin filtro de author_id aquí a propósito: el CEO puede moderar
    // cualquier mensaje. RLS (chat_messages_delete_own_or_ceo) es quien
    // realmente decide si el borrado se permite o no.
    const { error } = await supabase.from("chat_messages").delete().eq("id", messageId);
    if (error) return { error: error.message };

    revalidatePath("/chat");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo borrar el mensaje." };
  }
}

export async function editMessage(messageId: string, newBody: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado." };

    const text = newBody.trim();
    if (!text) return { error: "El mensaje no puede quedar vacío." };

    const { error } = await supabase
      .from("chat_messages")
      .update({ body: text, edited_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("author_id", user.id);
    if (error) return { error: error.message };

    revalidatePath("/chat");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo editar el mensaje." };
  }
}
