"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createProspectoManual } from "@/app/(protected)/prospectos/actions";
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

export function ProspectoFormDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createProspectoManual(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Prospecto agregado");
        formRef.current?.reset();
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Nuevo prospecto</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo prospecto</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" name="nombre" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="whatsapp_number">WhatsApp</Label>
            <Input id="whatsapp_number" name="whatsapp_number" placeholder="+57..." />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notas">Notas</Label>
            <Textarea id="notas" name="notas" />
          </div>
          <DialogFooter className="mt-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
