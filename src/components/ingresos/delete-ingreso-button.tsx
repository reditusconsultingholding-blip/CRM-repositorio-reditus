"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteIngreso } from "@/app/(protected)/ingresos/actions";
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

export function DeleteIngresoButton({ ingresoId, trackingId }: { ingresoId: string; trackingId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteIngreso(ingresoId, code);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`${trackingId} eliminado`);
        setOpen(false);
        setCode("");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setCode(""); }}>
      <DialogTrigger render={<Button type="button" size="icon-sm" variant="destructive" title="Borrar ingreso" />}>
        <Trash2 className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Borrar {trackingId}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Esta acción es permanente. Para confirmar, ingresa el código de 6 dígitos vigente — lo
          encuentras en Configuración.
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="totp-code">Código de borrado</Label>
          <Input
            id="totp-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            placeholder="000000"
            className="font-mono text-lg tracking-widest"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={pending || code.length !== 6}>
            {pending ? "Borrando…" : "Sí, borrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
