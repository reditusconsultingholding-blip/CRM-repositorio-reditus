"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createRequerimiento } from "@/app/(protected)/requerimientos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Pipeline } from "@/lib/statuses";

type Encargado = { id: string; name: string };

export function RequerimientoFormDialog({
  pipeline,
  encargados,
}: {
  pipeline: Pipeline;
  encargados: Encargado[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    formData.set("pipeline", pipeline);
    startTransition(async () => {
      const result = await createRequerimiento(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Requerimiento creado");
        formRef.current?.reset();
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Nuevo requerimiento</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Nuevo requerimiento — {pipeline === "video" ? "Video" : "Landing"}
          </DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={handleSubmit} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="nombre_producto">Nombre del producto</Label>
            <Input id="nombre_producto" name="nombre_producto" required />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="requerimiento_texto">Requerimiento</Label>
            <Textarea id="requerimiento_texto" name="requerimiento_texto" rows={3} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pais_acento">País (acento/voz)</Label>
            <Input id="pais_acento" name="pais_acento" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="f_entrega_prometida">Entrega prometida</Label>
            <Input id="f_entrega_prometida" name="f_entrega_prometida" type="date" />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="carpeta_drive_url">Carpeta de Drive</Label>
            <Input id="carpeta_drive_url" name="carpeta_drive_url" placeholder="https://drive.google.com/..." />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label>Encargado</Label>
            <Select
              name="encargado_id"
              items={Object.fromEntries(encargados.map((e) => [e.id, e.name]))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                {encargados.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="col-span-2 mt-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Crear requerimiento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
