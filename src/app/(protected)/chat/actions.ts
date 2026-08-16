"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function sendChannelMessage(channelId: string, body: string, replyToId?: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("No autenticado.");

  const text = body.trim();
  if (!text) return;

  const { error } = await supabase.from("chat_messages").insert({
    channel_id: channelId,
    author_id: user.id,
    body: text,
    reply_to_id: replyToId || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/chat");
}

export async function sendDirectMessage(recipientId: string, body: string, replyToId?: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("No autenticado.");

  const text = body.trim();
  if (!text) return;

  const { error } = await supabase.from("chat_messages").insert({
    recipient_id: recipientId,
    author_id: user.id,
    body: text,
    reply_to_id: replyToId || null,
  });

  if (error) throw new Error(error.message);

  await supabase.from("notifications").insert({
    user_id: recipientId,
    type: "mensaje_directo",
    title: "Tienes un mensaje nuevo",
    link: "/chat",
  });

  revalidatePath("/chat");
}

/** Marca el chat como leído "ahora" para el usuario actual — resetea la
 * burbuja de mensajes pendientes en la barra lateral. */
export async function markChatRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("users").update({ last_chat_read_at: new Date().toISOString() }).eq("id", user.id);
}

export async function toggleReaction(messageId: string, emoji: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado.");

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
}

export async function deleteMessage(messageId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado.");

  const { error } = await supabase.from("chat_messages").delete().eq("id", messageId).eq("author_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/chat");
}
