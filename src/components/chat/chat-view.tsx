"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Hash, Send, User, Reply, Copy, Trash2, X, Pencil, Paperclip, FileIcon, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  sendChannelMessage,
  sendDirectMessage,
  markChatRead,
  toggleReaction,
  deleteMessage,
  editMessage,
} from "@/app/(protected)/chat/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ChannelPanel } from "@/components/chat/channel-panel";
import { CreateChannelButton } from "@/components/chat/create-channel-button";

const QUICK_EMOJIS = ["👍", "❤️", "😂"];
// Adjuntos: tope razonable para el bucket de Supabase Storage. Para
// archivos más grandes (videos pesados, carpetas completas, 20GB+),
// comparte el link de Drive/Dropbox — se vuelve clicable solo.
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024; // 100MB
const URL_RE = /(https?:\/\/[^\s]+)/g;

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
  edited_at: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
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

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(name: string) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
}

/** Convierte URLs sueltas dentro del texto en links clicables. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        URL_RE.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-80"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function ChatView({
  channels,
  people,
  allPeople,
  currentUserId,
  currentUserName,
  canModerate = false,
  canManageChannels = false,
}: {
  channels: Channel[];
  people: Person[];
  allPeople?: { id: string; name: string }[];
  currentUserId: string;
  currentUserName: string;
  canModerate?: boolean;
  canManageChannels?: boolean;
}) {
  const [channelPanelOpen, setChannelPanelOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(
    channels[0] ? { type: "channel", id: channels[0].id } : null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    { localId: string; url: string; name: string; size: number; sending?: boolean }[]
  >([]);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
      "id, channel_id, recipient_id, author_id, body, reply_to_id, edited_at, attachment_url, attachment_name, attachment_size, created_at, author:users!chat_messages_author_id_fkey(name, avatar_url)";

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
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, reactions: [] }]));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages" },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row, reactions: m.reactions } : m)));
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
    // Cambiar de canal/DM descarta los adjuntos en borrador — evita mandarlos
    // sin querer al chat equivocado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingAttachments([]);
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
        const result = await sendChannelMessage(selection.id, text, replyToId);
        if (result?.error) toast.error(result.error);
      } else {
        const result = await sendDirectMessage(selection.userId, text, replyToId);
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            channel_id: null,
            recipient_id: selection.userId,
            author_id: currentUserId,
            body: text,
            reply_to_id: replyToId,
            edited_at: null,
            attachment_url: null,
            attachment_name: null,
            attachment_size: null,
            created_at: new Date().toISOString(),
            author: { name: currentUserName },
            reactions: [],
          },
        ]);
      }
    });
  }

  // Los archivos se suben de una vez (para no perder tiempo esperando) pero
  // quedan en un borrador — no se envían al chat hasta que la persona
  // presione "Enviar" en cada uno (o "Enviar todos"). Así se puede
  // seleccionar varios archivos al tiempo y revisarlos antes de mandarlos.
  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !selection) return;

    setUploading(true);
    try {
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.error(
            `"${file.name}" pesa ${fmtSize(file.size)} — el máximo por chat es 100MB. Para algo más grande, comparte un link de Drive o Dropbox.`,
          );
          continue;
        }
        const path = `${currentUserId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from("chat-files").upload(path, file);
        if (uploadError) {
          toast.error(`No se pudo subir "${file.name}": ${uploadError.message}`);
          continue;
        }
        const { data } = supabase.storage.from("chat-files").getPublicUrl(path);
        setPendingAttachments((prev) => [
          ...prev,
          { localId: `${Date.now()}-${file.name}`, url: data.publicUrl, name: file.name, size: file.size },
        ]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function sendPendingAttachment(localId: string) {
    const item = pendingAttachments.find((a) => a.localId === localId);
    if (!item || !selection) return;
    setPendingAttachments((prev) => prev.map((a) => (a.localId === localId ? { ...a, sending: true } : a)));

    const attachment = { url: item.url, name: item.name, size: item.size };
    const result =
      selection.type === "channel"
        ? await sendChannelMessage(selection.id, "", replyTo?.id ?? null, attachment)
        : await sendDirectMessage(selection.userId, "", replyTo?.id ?? null, attachment);

    if (result?.error) {
      toast.error(result.error);
      setPendingAttachments((prev) => prev.map((a) => (a.localId === localId ? { ...a, sending: false } : a)));
      return;
    }
    setReplyTo(null);
    setPendingAttachments((prev) => prev.filter((a) => a.localId !== localId));
  }

  async function sendAllPendingAttachments() {
    for (const a of pendingAttachments) {
      await sendPendingAttachment(a.localId);
    }
  }

  function discardPendingAttachment(localId: string) {
    setPendingAttachments((prev) => prev.filter((a) => a.localId !== localId));
  }

  function startEdit(m: Message) {
    setEditingId(m.id);
    setEditText(m.body);
  }

  function saveEdit() {
    if (!editingId) return;
    const text = editText.trim();
    if (!text) return;
    startTransition(async () => {
      const result = await editMessage(editingId, text);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === editingId ? { ...m, body: text, edited_at: new Date().toISOString() } : m)),
        );
      }
      setEditingId(null);
      setEditText("");
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
        <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Canales</p>
          {canManageChannels && <CreateChannelButton />}
        </div>
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
        <button
          type="button"
          onClick={() => activeChannel && setChannelPanelOpen(true)}
          disabled={!activeChannel}
          className={cn(
            "flex items-center border-b px-4 py-2 text-left text-sm font-medium",
            activeChannel && "hover:bg-muted/50",
          )}
        >
          {activeChannel ? <Hash className="mr-1 inline size-3.5" /> : <User className="mr-1 inline size-3.5" />}
          {headerLabel}
        </button>

        {activeChannel && (
          <ChannelPanel
            open={channelPanelOpen}
            onOpenChange={setChannelPanelOpen}
            channelId={activeChannel.id}
            channelName={activeChannel.name}
            allPeople={allPeople ?? people}
            canManageChannels={canManageChannels}
            isCeo={canModerate}
            onDeleted={() => setSelection(channels[0] ? { type: "channel", id: channels[0].id } : null)}
          />
        )}

        <div className="flex flex-1 flex-col overflow-y-auto p-4">
          {messages.map((m) => {
            const isOwn = m.author_id === currentUserId;
            const quoted = findMessage(m.reply_to_id);
            const isEditing = editingId === m.id;
            const reactionCounts = new Map<string, { count: number; mine: boolean }>();
            for (const r of m.reactions ?? []) {
              const cur = reactionCounts.get(r.emoji) ?? { count: 0, mine: false };
              cur.count += 1;
              if (r.user_id === currentUserId) cur.mine = true;
              reactionCounts.set(r.emoji, cur);
            }

            return (
              <div key={m.id} className="flex gap-2 border-b border-border/40 py-2 last:border-b-0">
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
                    {m.edited_at && <span className="text-[10px] text-muted-foreground">(editado)</span>}
                  </div>

                  {m.reply_to_id && (
                    <div className="mb-1 border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground">
                      {quoted ? (
                        <>
                          <span className="font-medium">{quoted.author?.name ?? "Usuario eliminado"}</span>: {quoted.body.slice(0, 80)}
                        </>
                      ) : (
                        "Mensaje anterior"
                      )}
                    </div>
                  )}

                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        className="h-7 text-sm"
                      />
                      <Button size="icon-sm" onClick={saveEdit} title="Guardar">
                        <Check className="size-3.5" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditingId(null)} title="Cancelar">
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      {m.body && (
                        <p className="text-sm break-words">
                          <Linkified text={m.body} />
                        </p>
                      )}

                      {m.attachment_url &&
                        (isImageFile(m.attachment_name ?? "") ? (
                          <a href={m.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-1 block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={m.attachment_url}
                              alt={m.attachment_name ?? "imagen"}
                              className="max-h-56 max-w-full rounded-md border object-contain"
                            />
                          </a>
                        ) : (
                          <a
                            href={m.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 flex w-fit items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs hover:bg-muted"
                          >
                            <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="max-w-48 truncate font-medium">{m.attachment_name}</span>
                            {m.attachment_size != null && (
                              <span className="text-muted-foreground">{fmtSize(m.attachment_size)}</span>
                            )}
                          </a>
                        ))}

                      <div className="mt-1 flex items-center gap-1">
                        {QUICK_EMOJIS.map((emoji) => (
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
                            onClick={() => startEdit(m)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Editar"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        )}
                        {(isOwn || canModerate) && (
                          <button
                            onClick={async () => {
                              if (!confirm("¿Borrar este mensaje? No se puede deshacer.")) return;
                              const result = await deleteMessage(m.id);
                              if (result?.error) toast.error(result.error);
                            }}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Eliminar"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </>
                  )}

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
              Respondiendo a <span className="font-medium">{replyTo.author?.name ?? "Usuario eliminado"}</span>: {replyTo.body.slice(0, 60)}
            </span>
            <button onClick={() => setReplyTo(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                {pendingAttachments.length} archivo(s) listo(s) — revisa y envía
              </p>
              <Button type="button" size="sm" variant="outline" onClick={sendAllPendingAttachments}>
                Enviar todos
              </Button>
            </div>
            {pendingAttachments.map((a) => (
              <div key={a.localId} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{a.name}</span>
                  <span className="shrink-0 text-muted-foreground">({fmtSize(a.size)})</span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => sendPendingAttachment(a.localId)}
                    disabled={a.sending}
                  >
                    <Check className="size-3" /> {a.sending ? "Enviando…" : "Enviar"}
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => discardPendingAttachment(a.localId)}
                    disabled={a.sending}
                    title="Descartar"
                  >
                    <X className="size-3.5" />
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 border-t p-3">
          <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFilePick} />
          <Button
            size="icon"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={pending || uploading || !selection}
            title="Adjuntar archivo (máx. 100MB)"
          >
            <Paperclip className="size-4" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder={
              uploading
                ? "Subiendo archivo…"
                : activeChannel
                  ? `Mensaje en #${headerLabel}`
                  : `Mensaje a ${headerLabel}`
            }
            disabled={pending || uploading || !selection}
          />
          <Button size="icon" onClick={send} disabled={pending || uploading || !selection}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
