"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { aprobarSolicitud, rechazarSolicitud } from "@/app/(protected)/admin/usuarios/actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

/** Aceptar o rechazar a quien pidió acceso con Google. El rol llega con el que
 * la persona eligió; el CEO puede cambiarlo antes de aceptar. */
export function SolicitudControls({ userId, name, role }: { userId: string; name: string; role: UserRole }) {
  const [pending, startTransition] = useTransition();
  const [rol, setRol] = useState<UserRole>(role);

  function aceptar() {
    startTransition(async () => {
      const r = await aprobarSolicitud(userId, rol);
      if (r?.error) toast.error(r.error);
      else toast.success(`${name} ya puede entrar como ${ROLE_LABELS[rol]}`);
    });
  }

  function rechazar() {
    startTransition(async () => {
      const r = await rechazarSolicitud(userId);
      if (r?.error) toast.error(r.error);
      else toast.success(`Solicitud de ${name} rechazada`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={rol} onValueChange={(v) => setRol(v as UserRole)} disabled={pending}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(ROLE_LABELS) as UserRole[])
            .filter((r) => r !== "ceo")
            .map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={aceptar} disabled={pending}>
        <Check className="size-4" />
        Aceptar
      </Button>
      <Button size="sm" variant="outline" onClick={rechazar} disabled={pending}>
        <X className="size-4" />
        Rechazar
      </Button>
    </div>
  );
}
