"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { setUserActive, updateUserRole, deleteUser } from "@/app/(protected)/admin/usuarios/actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

export function UserRowControls({
  userId,
  name,
  role,
  active,
}: {
  userId: string;
  name: string;
  role: UserRole;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteUser(userId);
        toast.success(`${name} eliminado`);
        setConfirmOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo borrar");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        items={ROLE_LABELS}
        value={role}
        disabled={pending}
        onValueChange={(next) =>
          startTransition(async () => {
            try {
              await updateUserRole(userId, next as UserRole);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "No se pudo cambiar el rol");
            }
          })
        }
      >
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await setUserActive(userId, !active);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
            }
          })
        }
      >
        {active ? "Desactivar" : "Activar"}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger render={<Button variant="destructive" size="icon" title="Borrar usuario" />}>
          <Trash2 className="size-3.5" />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Borrar a {name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta acción es permanente — {name} ya no podrá iniciar sesión y se elimina su cuenta por
            completo. No se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={pending}>
              {pending ? "Borrando…" : "Sí, borrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
