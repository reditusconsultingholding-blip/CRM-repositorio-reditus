"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ChatBadge({ userId }: { userId: string }) {
  const [count, setCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    let active = true;
    let lastReadAt = new Date().toISOString();

    async function loadUnread() {
      const { data: profile } = await supabase
        .from("users")
        .select("last_chat_read_at")
        .eq("id", userId)
        .single();
      lastReadAt = profile?.last_chat_read_at ?? lastReadAt;

      const { count: unread } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .neq("author_id", userId)
        .gt("created_at", lastReadAt)
        .or(`channel_id.not.is.null,recipient_id.eq.${userId}`);

      if (active) setCount(unread ?? 0);
    }

    loadUnread();

    const channel = supabase
      .channel(`chat_badge:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const row = payload.new as { author_id: string; channel_id: string | null; recipient_id: string | null };
          if (row.author_id === userId) return;
          if (row.channel_id || row.recipient_id === userId) {
            setCount((c) => c + 1);
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (count === 0) return null;

  return (
    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}
