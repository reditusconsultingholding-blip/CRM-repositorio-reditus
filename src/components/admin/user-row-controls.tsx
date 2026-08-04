"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setUserActive, updateUserRole } from "@/app/(protected)/admin/usuarios/actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

export function UserRowControls({
  userId,
  role,
  active,
}: {
  userId: string;
  role: UserRole;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();

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
    </div>
  );
}
