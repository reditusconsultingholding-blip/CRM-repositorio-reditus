"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Hash, Send, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendChannelMessage, sendDirectMessage, markChatRead } from "@/app/(protected)/chat/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Channel = { id: string; slug: string; name: string };
type Person = { id: string; name: string };
type Message = {
  id: string;
  channel_id: string | null;
  recipient_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
  author?: { name: string } | null;
};

type Selection = { type: "channel"; id: string } | { type: "dm"; userId: string };

export function ChatView({
  channels,
  people,
  currentUserId,
  currentUserName,
}: {
  channels: Channel[];
  people: Person[];
  currentUserId: string;
  currentUserName: string;
}) {
  const [selection, setSelection] = useState<Selection | null>(
    channels[0] ? { type: "channel", id: channels[0].id } : null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    markChatRead();
  }, []);

  useEffect(() => {
    if (!selection) return;
    let active = true;

    const query =
      selection.type === "channel"
        ? supabase
            .from("chat_messages")
            .select("id, channel_id, recipient_id, author_id, body, created_at, author:users!chat_messages_author_id_fkey(name)")
            .eq("channel_id", selection.id)
            .order("created_at", { ascending: true })
            .limit(200)
        : supabase
            .from("chat_messages")
            .select("id, channel_id, recipient_id, author_id, body, created_at, author:users!chat_messages_author_id_fkey(name)")
            .or(
              `and(author_id.eq.${currentUserId},recipient_id.eq.${selection.userId}),and(author_id.eq.${selection.userId},recipient_id.eq.${currentUserId})`,
            )
            .order("created_at", { ascending: true })
            .limit(200);

    query.then(({ data }) => {
      if (active && data) setMessages(data as unknown as Message[]);
    });

    // Realtime: para canales filtramos por channel_id; para DMs no se puede
    // filtrar por dos columnas a la vez, así que escuchamos todo lo dirigido
    // a mí y descartamos en el cliente lo que no sea de este hilo.
    const filter =
      selection.type === "channel" ? `channel_id=eq.${selection.id}` : `recipient_id=eq.${currentUserId}`;

    const channel = supabase
      .channel(`chat_messages:${selection.type}:${selection.type === "channel" ? selection.id : selection.userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter },
        async (payload) => {
          const row = payload.new as Message;
          if (selection.type === "dm" && row.author_id !== selection.userId) return;
          if (row.author_id === currentUserId) {
            row.author = { name: currentUserName };
          } else {
            const { data: author } = await supabase.from("users").select("name").eq("id", row.author_id).single();
            row.author = author;
          }
          setMessages((prev) => [...prev, row]);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.type, selection?.type === "channel" ? selection.id : selection?.userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text || !selection) return;
    setInput("");
    startTransition(async () => {
      if (selection.type === "channel") {
        await sendChannelMessage(selection.id, text);
      } else {
        await sendDirectMessage(selection.userId, text);
        // Los mensajes propios no llegan por el filtro de recipient_id —
        // se agregan aquí de una vez para verlos al instante.
        setMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            channel_id: null,
            recipient_id: selection.userId,
            author_id: currentUserId,
            body: text,
            created_at: new Date().toISOString(),
            author: { name: currentUserName },
          },
        ]);
      }
    });
  }

  const activeChannel = selection?.type === "channel" ? channels.find((c) => c.id === selection.id) : null;
  const activePerson = selection?.type === "dm" ? people.find((p) => p.id === selection.userId) : null;
  const headerLabel = activeChannel ? activeChannel.name : activePerson ? activePerson.name : "Selecciona un chat";

  return (
    <div className="flex flex-1 overflow-hidden rounded-md border bg-background">
      <div className="w-52 shrink-0 overflow-y-auto border-r p-2">
        <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">
          Canales
        </p>
        {channels.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelection({ type: "channel", id: c.id })}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              selection?.type === "channel" && selection.id === c.id && "bg-muted font-medium text-foreground",
            )}
          >
            <Hash className="size-3.5 shrink-0" />
            <span className="truncate">{c.name}</span>
          </button>
        ))}

        <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase text-muted-foreground">
          Mensajes directos
        </p>
        {people.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelection({ type: "dm", userId: p.id })}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              selection?.type === "dm" && selection.userId === p.id && "bg-muted font-medium text-foreground",
            )}
          >
            <User className="size-3.5 shrink-0" />
            <span className="truncate">{p.name}</span>
          </button>
        ))}
        {people.length === 0 && (
          <p className="px-2.5 py-2 text-xs text-muted-foreground">No hay más usuarios activos.</p>
        )}
      </div>

      <div className="flex flex-1 flex-col">
        <div className="border-b px-4 py-2 text-sm font-medium">
          {activeChannel ? <Hash className="mr-1 inline size-3.5" /> : <User className="mr-1 inline size-3.5" />}
          {headerLabel}
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
            <p className="text-sm text-muted-foreground">Sin mensajes todavía.</p>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 border-t p-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder={activeChannel ? `Mensaje en #${headerLabel}` : `Mensaje a ${headerLabel}`}
            disabled={pending || !selection}
          />
          <Button size="icon" onClick={send} disabled={pending || !selection}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
