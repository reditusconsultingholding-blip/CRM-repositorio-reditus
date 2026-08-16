"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Pencil, Trash2, Plus, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createVaultEntry,
  updateVaultEntry,
  deleteVaultEntry,
  revealVaultPassword,
  type VaultEntry,
} from "@/lib/vault-actions";

function EntryForm({
  entry,
  onSubmit,
  onDone,
}: {
  entry?: VaultEntry;
  onSubmit: (formData: FormData) => Promise<void>;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await onSubmit(formData);
        toast.success(entry ? "Actualizado" : "Agregado a la bóveda");
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar");
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="app">App</Label>
        <Input id="app" name="app" defaultValue={entry?.app} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="correo">Correo</Label>
        <Input id="correo" name="correo" defaultValue={entry?.correo ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Contraseña{entry && " (déjalo vacío para no cambiarla)"}</Label>
        <Input id="password" name="password" type="text" required={!entry} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="utilidad">Utilidad / notas</Label>
        <Input id="utilidad" name="utilidad" defaultValue={entry?.utilidad ?? ""} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function VaultRow({ entry }: { entry: VaultEntry }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  async function toggleReveal() {
    if (revealed) {
      setRevealed(null);
      return;
    }
    setLoading(true);
    try {
      const pw = await revealVaultPassword(entry.id);
      setRevealed(pw);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo revelar");
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    if (!revealed) return;
    navigator.clipboard.writeText(revealed);
    toast.success("Copiada al portapapeles");
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteVaultEntry(entry.id);
        toast.success("Eliminado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
      }
    });
  }

  return (
    <div className="grid grid-cols-12 items-center gap-2 border-b py-2 text-sm last:border-b-0">
      <div className="col-span-2 font-medium">{entry.app}</div>
      <div className="col-span-3 truncate text-muted-foreground">{entry.correo || "—"}</div>
      <div className="col-span-3 font-mono text-xs">
        {loading ? "Cargando…" : revealed ?? "••••••••••••"}
      </div>
      <div className="col-span-2 truncate text-xs text-muted-foreground">{entry.utilidad || "—"}</div>
      <div className="col-span-2 flex justify-end gap-1">
        <Button type="button" size="icon-sm" variant="outline" onClick={toggleReveal} title="Mostrar/ocultar">
          {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </Button>
        <Button type="button" size="icon-sm" variant="outline" onClick={copy} disabled={!revealed} title="Copiar">
          <Copy className="size-3.5" />
        </Button>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger render={<Button type="button" size="icon-sm" variant="outline" title="Editar" />}>
            <Pencil className="size-3.5" />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar {entry.app}</DialogTitle>
            </DialogHeader>
            <EntryForm
              entry={entry}
              onSubmit={(fd) => updateVaultEntry(entry.id, fd)}
              onDone={() => setEditOpen(false)}
            />
          </DialogContent>
        </Dialog>
        <Button
          type="button"
          size="icon-sm"
          variant="destructive"
          onClick={handleDelete}
          disabled={pending}
          title="Eliminar"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function CredentialsVault({ entries }: { entries: VaultEntry[] }) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Contraseñas cifradas (AES-256) — solo tú puedes verlas.
        </p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger render={<Button type="button" size="sm" className="gap-1.5" />}>
            <Plus className="size-3.5" />
            Agregar
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva cuenta</DialogTitle>
            </DialogHeader>
            <EntryForm onSubmit={createVaultEntry} onDone={() => setAddOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-12 gap-2 border-b pb-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
        <div className="col-span-2">App</div>
        <div className="col-span-3">Correo</div>
        <div className="col-span-3">Contraseña</div>
        <div className="col-span-2">Utilidad</div>
        <div className="col-span-2"></div>
      </div>
      {entries.map((e) => (
        <VaultRow key={e.id} entry={e} />
      ))}
      {entries.length === 0 && <p className="py-3 text-sm text-muted-foreground">Sin cuentas guardadas.</p>}
    </div>
  );
}
