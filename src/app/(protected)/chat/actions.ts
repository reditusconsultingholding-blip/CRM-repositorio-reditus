"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function sendChannelMessage(channelId: string, body: string) {
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
  });

  if (error) throw new Error(error.message);

  revalidatePath("/chat");
}

export async function sendDirectMessage(recipientId: string, body: string) {
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
