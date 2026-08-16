"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function sendChatMessage(channelId: string, body: string) {
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
