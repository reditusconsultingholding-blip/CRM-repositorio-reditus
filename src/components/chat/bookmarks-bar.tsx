"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bookmark, Plus, X } from "lucide-react";
import { addBookmark, removeBookmark, listBookmarks } from "@/app/(protected)/chat/channel-actions";
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

type BookmarkItem = { id: string; nombre: string; url: string };

export function BookmarksBar({ channelId, canManage }: { channelId: string; canManage: boolean }) {
  const [items, setItems] = useState<BookmarkItem[]>([]);
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listBookmarks(channelId).then(setItems);
  }, [channelId]);

  function handleAdd() {
    startTransition(async () => {
      const result = await addBookmark(channelId, nombre, url);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setItems((prev) => [...prev, { id: `tmp-${Date.now()}`, nombre, url }]);
        setNombre("");
        setUrl("");
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

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 px-3 py-1.5">
      {items.map((b) => (
        <span
          key={b.id}
          className="group flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs"
        >
          <a href={b.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
            <Bookmark className="size-3" />
            {b.nombre}
          </a>
          {canManage && (
            <button onClick={() => handleRemove(b.id)} disabled={pending} className="text-muted-foreground hover:text-destructive">
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {canManage && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<button type="button" className="flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted" />}>
            <Plus className="size-3" /> Fijar link
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Fijar link o archivo en este canal</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bm-nombre">Nombre</Label>
                <Input id="bm-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Manual operativo" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bm-url">Link (Drive, doc, etc.)</Label>
                <Input id="bm-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              </div>
              <DialogFooter>
                <Button type="button" onClick={handleAdd} disabled={pending || !nombre || !url}>
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
