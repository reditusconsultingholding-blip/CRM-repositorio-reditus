"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { updateSaasSettings } from "@/app/(protected)/ceo/payroll-actions";
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
import type { PayrollSettings } from "@/lib/payroll";

export function PayrollSettingsForm({ settings }: { settings: PayrollSettings }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updateSaasSettings(formData);
        toast.success("Costos fijos actualizados");
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Pencil className="size-3.5" /> Editar costos fijos
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Costos fijos mensuales (SaaS)</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={handleSubmit} className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="elevenlabs_usd_mes" className="text-xs">
              ElevenLabs (USD/mes)
            </Label>
            <Input
              id="elevenlabs_usd_mes"
              name="elevenlabs_usd_mes"
              type="number"
              step="0.01"
              defaultValue={settings.elevenLabsUsdMes}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="google_storage_usd_mes" className="text-xs">
              Google Storage (USD/mes)
            </Label>
            <Input
              id="google_storage_usd_mes"
              name="google_storage_usd_mes"
              type="number"
              step="0.01"
              defaultValue={settings.googleStorageUsdMes}
              required
            />
          </div>
          <DialogFooter className="col-span-2 mt-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
