"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createIngreso } from "@/app/(protected)/ingresos/actions";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Responsable = { id: string; name: string };

export function IngresoFormDialog({ responsables }: { responsables: Responsable[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await createIngreso(formData);
        toast.success("Ingreso creado");
        formRef.current?.reset();
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo crear el ingreso");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Nuevo ingreso</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo ingreso</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={handleSubmit} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="client_name">Nombre del cliente</Label>
            <Input id="client_name" name="client_name" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="whatsapp_number">Número de WhatsApp</Label>
            <Input id="whatsapp_number" name="whatsapp_number" required placeholder="+57..." />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pais">País</Label>
            <Input id="pais" name="pais" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="servicio">Servicio</Label>
            <Input id="servicio" name="servicio" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="producto">Producto</Label>
            <Input id="producto" name="producto" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="precio_total">Precio total</Label>
            <Input id="precio_total" name="precio_total" type="number" step="0.01" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="precio_final_descuento">Precio final (con descuento)</Label>
            <Input id="precio_final_descuento" name="precio_final_descuento" type="number" step="0.01" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="estado_pago">Estado de pago</Label>
            <Input id="estado_pago" name="estado_pago" placeholder="Ej. Pagado, Pendiente" />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label>Responsable</Label>
            <Select
              name="responsable_id"
              items={Object.fromEntries(responsables.map((r) => [r.id, r.name]))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un responsable" />
              </SelectTrigger>
              <SelectContent>
                {responsables.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="col-span-2 mt-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Crear ingreso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
