"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { updatePayrollSettings } from "@/app/(protected)/ceo/payroll-actions";
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

const FIELDS: { key: keyof PayrollSettings; label: string; name: string; step?: string }[] = [
  { key: "disenadoraLandingUsdDia", label: "Diseñadora Landing (USD/día)", name: "disenadora_landing_usd_dia", step: "0.01" },
  { key: "gerenteComercialUsdDia", label: "Gerente Comercial (USD/día)", name: "gerente_comercial_usd_dia", step: "0.01" },
  { key: "projectManagerUsdDia", label: "Directora Operativa (USD/día)", name: "project_manager_usd_dia", step: "0.01" },
  { key: "diasPorSemana", label: "Días por semana", name: "dias_por_semana", step: "1" },
  { key: "editorVideoUsdPorVideo", label: "Editor de Video (USD/video)", name: "editor_video_usd_por_video", step: "0.01" },
  { key: "programadorCopPorPagina", label: "Programador (COP/página)", name: "programador_cop_por_pagina", step: "1" },
  { key: "elevenLabsUsdMes", label: "ElevenLabs (USD/mes)", name: "elevenlabs_usd_mes", step: "0.01" },
  { key: "googleStorageUsdMes", label: "Google Storage (USD/mes)", name: "google_storage_usd_mes", step: "0.01" },
];

export function PayrollSettingsForm({ settings }: { settings: PayrollSettings }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updatePayrollSettings(formData);
        toast.success("Nómina actualizada");
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Pencil className="size-3.5" /> Editar nómina
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nómina y costos fijos</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={handleSubmit} className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.name} className="flex flex-col gap-1.5">
              <Label htmlFor={f.name} className="text-xs">
                {f.label}
              </Label>
              <Input
                id={f.name}
                name={f.name}
                type="number"
                step={f.step ?? "0.01"}
                defaultValue={settings[f.key]}
                required
              />
            </div>
          ))}
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
