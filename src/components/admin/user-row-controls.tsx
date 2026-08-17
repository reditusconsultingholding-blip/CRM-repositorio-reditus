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
      const result = await deleteUser(userId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`${name} eliminado`);
        setConfirmOpen(false);
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
            const result = await updateUserRole(userId, next as UserRole);
            if (result?.error) toast.error(result.error);
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
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setUserActive(userId, !active);
            if (result?.error) toast.error(result.error);
          })
        }
      >
        {active ? "Desactivar" : "Activar"}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger render={<Button type="button" variant="destructive" size="icon" title="Borrar usuario" />}>
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
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={pending}>
              {pending ? "Borrando…" : "Sí, borrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
