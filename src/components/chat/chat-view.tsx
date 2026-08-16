"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Hash, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendChatMessage } from "@/app/(protected)/chat/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Channel = { id: string; slug: string; name: string };
type Message = {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: { name: string } | null;
};

export function ChatView({
  channels,
  currentUserId,
  currentUserName,
}: {
  channels: Channel[];
  currentUserId: string;
  currentUserName: string;
}) {
  const [activeChannelId, setActiveChannelId] = useState(channels[0]?.id ?? "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!activeChannelId) return;
    let active = true;

    supabase
      .from("chat_messages")
      .select("id, channel_id, author_id, body, created_at, author:users(name)")
      .eq("channel_id", activeChannelId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (active && data) setMessages(data as unknown as Message[]);
      });

    const channel = supabase
      .channel(`chat_messages:${activeChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        async (payload) => {
          const row = payload.new as Message;
          // Realtime payloads don't include the joined author name — resolve
          // it locally when it's our own message, otherwise fetch it once.
          if (row.author_id === currentUserId) {
            row.author = { name: currentUserName };
            setMessages((prev) => [...prev, row]);
          } else {
            const { data: author } = await supabase
              .from("users")
              .select("name")
              .eq("id", row.author_id)
              .single();
            setMessages((prev) => [...prev, { ...row, author }]);
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text || !activeChannelId) return;
    setInput("");
    startTransition(async () => {
      await sendChatMessage(activeChannelId, text);
    });
  }

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  return (
    <div className="flex flex-1 overflow-hidden rounded-md border bg-background">
      <div className="w-48 shrink-0 border-r p-2">
        {channels.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveChannelId(c.id)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              c.id === activeChannelId && "bg-muted font-medium text-foreground",
            )}
          >
            <Hash className="size-3.5 shrink-0" />
            <span className="truncate">{c.name}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col">
        <div className="border-b px-4 py-2 text-sm font-medium">
          <Hash className="mr-1 inline size-3.5" />
          {activeChannel?.name ?? "Selecciona un canal"}
        </div>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          {messages.map((m) => (
            <div key={m.id} className="flex flex-col">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{m.author?.name ?? "—"}</span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(m.created_at).toLocaleTimeString("es-CO", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-sm">{m.body}</p>
            </div>
          ))}
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin mensajes todavía en este canal.</p>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 border-t p-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder={`Mensaje en #${activeChannel?.name ?? ""}`}
            disabled={pending}
          />
          <Button size="icon" onClick={send} disabled={pending}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
