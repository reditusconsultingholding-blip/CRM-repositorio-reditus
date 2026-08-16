"use client";

import { useTransition } from "react";
import { toast } from "sonner";
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
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await updateRequerimientoEstado(requerimientoId, nextEstado);
            toast.success(`Pasó a "${nextEstado}"`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo avanzar");
          }
        })
      }
    >
      Pasar a &quot;{nextEstado}&quot; →
    </Button>
  );
}
