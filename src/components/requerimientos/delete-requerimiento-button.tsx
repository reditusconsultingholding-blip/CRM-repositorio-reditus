"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteRequerimiento } from "@/app/(protected)/requerimientos/actions";
import { Button } from "@/components/ui/button";

export function DeleteRequerimientoButton({
  requerimientoId,
  nombre,
  onDeleted,
}: {
  requerimientoId: string;
  nombre: string;
  onDeleted?: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`¿Borrar "${nombre}"? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      const result = await deleteRequerimiento(requerimientoId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Requerimiento eliminado");
        onDeleted?.();
      }
    });
  }

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="destructive"
      onClick={handleDelete}
      disabled={pending}
      title="Eliminar requerimiento"
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
