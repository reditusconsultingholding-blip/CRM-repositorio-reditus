"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Hash, Send, User, Reply, Copy, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  sendChannelMessage,
  sendDirectMessage,
  markChatRead,
  toggleReaction,
  deleteMessage,
} from "@/app/(protected)/chat/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

type Channel = { id: string; slug: string; name: string };
type Person = { id: string; name: string; avatar_url?: string | null };
type Reaction = { emoji: string; user_id: string };
type Message = {
  id: string;
  channel_id: string | null;
  recipient_id: string | null;
  author_id: string;
  body: string;
  reply_to_id: string | null;
  created_at: string;
  author?: { name: string; avatar_url?: string | null } | null;
  reactions?: Reaction[];
};

type Selection = { type: "channel"; id: string } | { type: "dm"; userId: string };

function Avatar({ name, url }: { name: string; url?: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="size-7 shrink-0 rounded-full object-cover" />;
  }
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
      {initials}
    </span>
  );
}

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
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    markChatRead();
  }, []);

  async function loadReactions(messageIds: string[]) {
    if (!messageIds.length) return new Map<string, Reaction[]>();
    const { data } = await supabase
      .from("chat_message_reactions")
      .select("message_id, emoji, user_id")
      .in("message_id", messageIds);
    const map = new Map<string, Reaction[]>();
    for (const r of data ?? []) {
      const list = map.get(r.message_id) ?? [];
      list.push({ emoji: r.emoji, user_id: r.user_id });
      map.set(r.message_id, list);
    }
    return map;
  }

  useEffect(() => {
    if (!selection) return;
    let active = true;

    const baseSelect =
      "id, channel_id, recipient_id, author_id, body, reply_to_id, created_at, author:users!chat_messages_author_id_fkey(name, avatar_url)";

    const query =
      selection.type === "channel"
        ? supabase
            .from("chat_messages")
            .select(baseSelect)
            .eq("channel_id", selection.id)
            .order("created_at", { ascending: true })
            .limit(200)
        : supabase
            .from("chat_messages")
            .select(baseSelect)
            .or(
              `and(author_id.eq.${currentUserId},recipient_id.eq.${selection.userId}),and(author_id.eq.${selection.userId},recipient_id.eq.${currentUserId})`,
            )
            .order("created_at", { ascending: true })
            .limit(200);

    query.then(async ({ data }) => {
      if (!active || !data) return;
      const rows = data as unknown as Message[];
      const reactionMap = await loadReactions(rows.map((r) => r.id));
      if (!active) return;
      setMessages(rows.map((r) => ({ ...r, reactions: reactionMap.get(r.id) ?? [] })));
    });

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
            const { data: author } = await supabase
              .from("users")
              .select("name, avatar_url")
              .eq("id", row.author_id)
              .single();
            row.author = author;
          }
          setMessages((prev) => [...prev, { ...row, reactions: [] }]);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages" },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== (payload.old as { id: string }).id));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_message_reactions" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { message_id: string };
          if (!row) return;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== row.message_id) return m;
              if (payload.eventType === "INSERT") {
                const r = payload.new as Reaction;
                return { ...m, reactions: [...(m.reactions ?? []), { emoji: r.emoji, user_id: r.user_id }] };
              }
              if (payload.eventType === "DELETE") {
                const r = payload.old as Reaction;
                return {
                  ...m,
                  reactions: (m.reactions ?? []).filter(
                    (x) => !(x.emoji === r.emoji && x.user_id === r.user_id),
                  ),
                };
              }
              return m;
            }),
          );
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
  }, [messages.length]);

  function send() {
    const text = input.trim();
    if (!text || !selection) return;
    const replyToId = replyTo?.id ?? null;
    setInput("");
    setReplyTo(null);
    startTransition(async () => {
      if (selection.type === "channel") {
        await sendChannelMessage(selection.id, text, replyToId);
      } else {
        await sendDirectMessage(selection.userId, text, replyToId);
        setMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            channel_id: null,
            recipient_id: selection.userId,
            author_id: currentUserId,
            body: text,
            reply_to_id: replyToId,
            created_at: new Date().toISOString(),
            author: { name: currentUserName },
            reactions: [],
          },
        ]);
      }
    });
  }

  function findMessage(id: string | null) {
    return id ? messages.find((m) => m.id === id) : undefined;
  }

  const activeChannel = selection?.type === "channel" ? channels.find((c) => c.id === selection.id) : null;
  const activePerson = selection?.type === "dm" ? people.find((p) => p.id === selection.userId) : null;
  const headerLabel = activeChannel ? activeChannel.name : activePerson ? activePerson.name : "Selecciona un chat";

  return (
    <div className="flex flex-1 overflow-hidden rounded-md border bg-background">
      <div className="w-52 shrink-0 overflow-y-auto border-r p-2">
        <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">Canales</p>
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
            <Avatar name={p.name} url={p.avatar_url} />
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

        <div className="flex flex-1 flex-col overflow-y-auto p-4">
          {messages.map((m) => {
            const isOwn = m.author_id === currentUserId;
            const quoted = findMessage(m.reply_to_id);
            const reactionCounts = new Map<string, { count: number; mine: boolean }>();
            for (const r of m.reactions ?? []) {
              const cur = reactionCounts.get(r.emoji) ?? { count: 0, mine: false };
              cur.count += 1;
              if (r.user_id === currentUserId) cur.mine = true;
              reactionCounts.set(r.emoji, cur);
            }

            return (
              <div
                key={m.id}
                className="group flex gap-2 border-b border-border/40 py-2 last:border-b-0"
              >
                <Avatar name={m.author?.name ?? "?"} url={m.author?.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{m.author?.name ?? "—"}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(m.created_at).toLocaleTimeString("es-CO", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {m.reply_to_id && (
                    <div className="mb-1 border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground">
                      {quoted ? (
                        <>
                          <span className="font-medium">{quoted.author?.name}</span>: {quoted.body.slice(0, 80)}
                        </>
                      ) : (
                        "Mensaje anterior"
                      )}
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm">{m.body}</p>
                    <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                      {QUICK_EMOJIS.slice(0, 3).map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(m.id, emoji)}
                          className="rounded px-1 text-xs hover:bg-muted"
                          title="Reaccionar"
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        onClick={() => setReplyTo(m)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Responder"
                      >
                        <Reply className="size-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(m.body);
                          toast.success("Copiado");
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Copiar"
                      >
                        <Copy className="size-3.5" />
                      </button>
                      {isOwn && (
                        <button
                          onClick={() => deleteMessage(m.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Eliminar"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {reactionCounts.size > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {[...reactionCounts.entries()].map(([emoji, { count, mine }]) => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(m.id, emoji)}
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-xs",
                            mine ? "border-primary bg-primary/10" : "border-border bg-muted/50",
                          )}
                        >
                          {emoji} {count}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin mensajes todavía.</p>
          )}
          <div ref={bottomRef} />
        </div>

        {replyTo && (
          <div className="flex items-center justify-between gap-2 border-t bg-muted/40 px-3 py-1.5 text-xs">
            <span className="truncate text-muted-foreground">
              Respondiendo a <span className="font-medium">{replyTo.author?.name}</span>: {replyTo.body.slice(0, 60)}
            </span>
            <button onClick={() => setReplyTo(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
        )}

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
