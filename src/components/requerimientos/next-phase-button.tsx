"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { updateRequerimientoEstado } from "@/app/(protected)/requerimientos/actions";
import { Button } from "@/components/ui/button";
import type { RequerimientoEstado } from "@/lib/statuses";

export function NextPhaseButton({
  requerimientoId,
  nextEstado,
}: {
  requerimientoId: string;
  nextEstado: RequerimientoEstado | null;
}) {
  const [pending, startTransition] = useTransition();

  if (!nextEstado) return null;

  return (
    <Button
      size="default"
      className="gap-1.5"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await updateRequerimientoEstado(requerimientoId, nextEstado);
          if (result?.error) {
            toast.error(result.error);
          } else {
            toast.success(`Tarea completada — pasó a "${nextEstado}"`);
          }
        })
      }
    >
      <Check className="size-4" />
      {pending ? "Guardando…" : "Tarea completada"}
    </Button>
  );
}
