"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bookmark, StickyNote, AlarmClock, Plus, X } from "lucide-react";
import {
  addBookmark,
  removeBookmark,
  listBookmarks,
  type ChannelBookmark,
  type BookmarkTipo,
} from "@/app/(protected)/chat/channel-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAX_BOOKMARKS = 3;

const TIPO_META: Record<BookmarkTipo, { icon: typeof Bookmark; label: string }> = {
  link: { icon: Bookmark, label: "Link" },
  nota: { icon: StickyNote, label: "Nota" },
  recordatorio: { icon: AlarmClock, label: "Recordatorio" },
};

function fmtRecordatorio(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

export function BookmarksBar({ channelId, canManage }: { channelId: string; canManage: boolean }) {
  const [items, setItems] = useState<ChannelBookmark[]>([]);
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<BookmarkTipo>("link");
  const [nombre, setNombre] = useState("");
  const [contenido, setContenido] = useState("");
  const [recordatorioEn, setRecordatorioEn] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listBookmarks(channelId).then(setItems);
  }, [channelId]);

  function resetForm() {
    setTipo("link");
    setNombre("");
    setContenido("");
    setRecordatorioEn("");
  }

  function handleAdd() {
    startTransition(async () => {
      const result = await addBookmark(channelId, nombre, contenido, tipo, recordatorioEn || null);
      if (result?.error) {
        toast.error(result.error);
      } else {
        resetForm();
        setOpen(false);
        listBookmarks(channelId).then(setItems);
      }
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removeBookmark(id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setItems((prev) => prev.filter((b) => b.id !== id));
      }
    });
  }

  if (items.length === 0 && !canManage) return null;
  const atLimite = items.length >= MAX_BOOKMARKS;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 px-3 py-1.5">
      {items.map((b) => {
        const meta = TIPO_META[b.tipo];
        const Icon = meta.icon;
        const chip = (
          <span
            className="group flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs"
            title={b.tipo === "nota" ? (b.nota ?? undefined) : undefined}
          >
            {b.tipo === "link" ? (
              <a
                href={b.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <Icon className="size-3" />
                {b.nombre}
              </a>
            ) : (
              <span className="flex items-center gap-1">
                <Icon className="size-3" />
                {b.nombre}
                {b.tipo === "recordatorio" && b.recordatorio_en && (
                  <span className="text-muted-foreground">· {fmtRecordatorio(b.recordatorio_en)}</span>
                )}
              </span>
            )}
            {canManage && (
              <button onClick={() => handleRemove(b.id)} disabled={pending} className="text-muted-foreground hover:text-destructive">
                <X className="size-3" />
              </button>
            )}
          </span>
        );
        return <span key={b.id}>{chip}</span>;
      })}
      {canManage && (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger
            render={
              <button
                type="button"
                disabled={atLimite}
                className="flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              />
            }
          >
            <Plus className="size-3" /> {atLimite ? `Máximo ${MAX_BOOKMARKS}` : "Fijar"}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Fijar en este canal (máximo {MAX_BOOKMARKS})</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="grid gap-1.5">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as BookmarkTipo)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="link">🔗 Link</SelectItem>
                    <SelectItem value="nota">📝 Nota</SelectItem>
                    <SelectItem value="recordatorio">⏰ Recordatorio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bm-nombre">Nombre</Label>
                <Input
                  id="bm-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder={tipo === "link" ? "Ej. Manual operativo" : tipo === "nota" ? "Ej. Recordatorio de tono" : "Ej. Llamar al cliente"}
                />
              </div>
              {tipo === "link" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="bm-contenido">Link (Drive, doc, etc.)</Label>
                  <Input id="bm-contenido" value={contenido} onChange={(e) => setContenido(e.target.value)} placeholder="https://…" />
                </div>
              )}
              {tipo === "nota" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="bm-contenido">Nota</Label>
                  <Input id="bm-contenido" value={contenido} onChange={(e) => setContenido(e.target.value)} placeholder="Texto de la nota…" />
                </div>
              )}
              {tipo === "recordatorio" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="bm-fecha">Fecha y hora (opcional)</Label>
                  <Input id="bm-fecha" type="datetime-local" value={recordatorioEn} onChange={(e) => setRecordatorioEn(e.target.value)} />
                </div>
              )}
              <DialogFooter>
                <Button type="button" onClick={handleAdd} disabled={pending || !nombre || (tipo === "link" && !contenido)}>
                  {pending ? "Fijando…" : "Fijar"}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
