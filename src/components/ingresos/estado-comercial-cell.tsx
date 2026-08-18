"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { marcarIngresoCerrado } from "@/app/(protected)/ingresos/actions";
import { Button } from "@/components/ui/button";
import { ESTADO_COMERCIAL_COLORS, type EstadoComercial } from "@/lib/statuses";

export function EstadoComercialCell({ ingresoId, estado }: { ingresoId: string; estado: EstadoComercial }) {
  const [pending, startTransition] = useTransition();

  if (estado === "Cerrado") {
    return (
      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${ESTADO_COMERCIAL_COLORS.Cerrado}`}>
        Cerrado
      </span>
    );
  }

  function handleCerrar() {
    startTransition(async () => {
      const result = await marcarIngresoCerrado(ingresoId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Ingreso cerrado — se crearon los requerimientos correspondientes");
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${ESTADO_COMERCIAL_COLORS.Cotizado}`}>
        Cotizado
      </span>
      <Button type="button" size="icon-sm" variant="outline" title="Marcar como cerrado" onClick={handleCerrar} disabled={pending}>
        <CheckCircle2 className="size-3.5" />
      </Button>
    </div>
  );
}
