"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { marcarUnidadCompletada, actualizarUnidadCampo } from "@/app/(protected)/requerimientos/actions";
import { cn } from "@/lib/utils";

export type Unidad = {
  id: string;
  unidad_numero: number;
  completado: boolean;
  link_entrega: string | null;
  notas: string | null;
};

function UnidadRow({ unidad }: { unidad: Unidad }) {
  const [completado, setCompletado] = useState(unidad.completado);
  const [link, setLink] = useState(unidad.link_entrega ?? "");
  const [notas, setNotas] = useState(unidad.notas ?? "");
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !completado;
    setCompletado(next);
    startTransition(async () => {
      const result = await marcarUnidadCompletada(unidad.id, next);
      if (result?.error) {
        toast.error(result.error);
        setCompletado(!next);
      }
    });
  }

  function saveCampo(campo: "link_entrega" | "notas", valor: string) {
    startTransition(async () => {
      const result = await actualizarUnidadCampo(unidad.id, campo, valor);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[auto_2rem_1fr_1fr] items-center gap-2 rounded-md border p-2 text-sm",
        completado && "border-green-300 bg-green-50 dark:border-green-900/50 dark:bg-green-950/20",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border",
          completado ? "border-green-500 bg-green-500 text-white" : "border-input",
        )}
        title={completado ? "Marcar como pendiente" : "Marcar como lista"}
      >
        {completado && <Check className="size-3.5" />}
      </button>
      <span className="text-xs font-medium text-muted-foreground">#{unidad.unidad_numero}</span>
      <Input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        onBlur={() => saveCampo("link_entrega", link)}
        placeholder="Link de entrega…"
        className="h-8 text-xs"
      />
      <Input
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        onBlur={() => saveCampo("notas", notas)}
        placeholder="Notas…"
        className="h-8 text-xs"
      />
    </div>
  );
}

export function UnidadesChecklist({ unidades, cantidad }: { unidades: Unidad[]; cantidad: number }) {
  const completadas = unidades.filter((u) => u.completado).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Unidades ({cantidad})</span>
          <span className="text-sm font-normal text-muted-foreground">
            {completadas}/{cantidad} listas
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {unidades.map((u) => (
          <UnidadRow key={u.id} unidad={u} />
        ))}
        {unidades.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin desglose todavía.</p>
        )}
      </CardContent>
    </Card>
  );
}
