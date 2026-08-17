"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { UserPlus, X, Trash2, FileIcon } from "lucide-react";
import {
  addChannelMember,
  removeChannelMember,
  deleteChannel,
  getChannelDetails,
} from "@/app/(protected)/chat/channel-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Person = { id: string; name: string };

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChannelPanel({
  open,
  onOpenChange,
  channelId,
  channelName,
  allPeople,
  canManageChannels,
  isCeo,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  channelName: string;
  allPeople: Person[];
  canManageChannels: boolean;
  isCeo: boolean;
  onDeleted: () => void;
}) {
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [files, setFiles] = useState<{ name: string; url: string; size: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [addUserId, setAddUserId] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getChannelDetails(channelId).then((result) => {
      setMembers(result.members);
      setFiles(result.files);
      setLoading(false);
      if (result.error) toast.error(result.error);
    });
  }, [open, channelId]);

  const nonMembers = allPeople.filter((p) => !members.some((m) => m.id === p.id));

  function handleAdd() {
    if (!addUserId) return;
    startTransition(async () => {
      const result = await addChannelMember(channelId, addUserId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        const person = allPeople.find((p) => p.id === addUserId);
        if (person) setMembers((prev) => [...prev, person]);
        setAddUserId("");
      }
    });
  }

  function handleRemove(userId: string) {
    startTransition(async () => {
      const result = await removeChannelMember(channelId, userId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setMembers((prev) => prev.filter((m) => m.id !== userId));
      }
    });
  }

  function handleDeleteChannel() {
    if (!confirm(`¿Borrar el canal #${channelName}? Se pierden todos sus mensajes. No se puede deshacer.`)) return;
    startTransition(async () => {
      const result = await deleteChannel(channelId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Canal borrado");
        onOpenChange(false);
        onDeleted();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>#{channelName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                Miembros ({members.length})
              </p>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-muted/50">
                    <span>{m.name}</span>
                    {canManageChannels && (
                      <button
                        onClick={() => handleRemove(m.id)}
                        disabled={pending}
                        className="text-muted-foreground hover:text-destructive"
                        title="Quitar del canal"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {canManageChannels && nonMembers.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <Select value={addUserId} onValueChange={(v) => setAddUserId(v ?? "")}>
                    <SelectTrigger className="h-8 flex-1 text-xs">
                      <SelectValue placeholder="Agregar persona…" />
                    </SelectTrigger>
                    <SelectContent>
                      {nonMembers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" onClick={handleAdd} disabled={pending || !addUserId} className="gap-1">
                    <UserPlus className="size-3.5" /> Agregar
                  </Button>
                </div>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                Archivos compartidos ({files.length})
              </p>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {files.map((f, i) => (
                  <a
                    key={i}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-primary hover:bg-muted/50 hover:underline"
                  >
                    <FileIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{f.name}</span>
                    {f.size != null && <span className="shrink-0 text-xs text-muted-foreground">({fmtSize(f.size)})</span>}
                  </a>
                ))}
                {files.length === 0 && <p className="text-xs text-muted-foreground">Sin archivos todavía.</p>}
              </div>
            </div>

            {isCeo && (
              <Button type="button" variant="destructive" size="sm" className="gap-1.5 self-start" onClick={handleDeleteChannel} disabled={pending}>
                <Trash2 className="size-3.5" /> Borrar canal
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
