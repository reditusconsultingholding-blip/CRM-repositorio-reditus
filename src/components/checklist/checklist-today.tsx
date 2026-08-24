"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { marcarItem } from "@/app/(protected)/checklist/actions";
import { cn } from "@/lib/utils";

export type ChecklistItem = { id: string; texto: string };

export function ChecklistToday({ items, marcadosIniciales }: { items: ChecklistItem[]; marcadosIniciales: string[] }) {
  const [marcados, setMarcados] = useState(new Set(marcadosIniciales));
  const [, startTransition] = useTransition();

  function toggle(id: string) {
    const yaMarcado = marcados.has(id);
    setMarcados((prev) => {
      const next = new Set(prev);
      if (yaMarcado) next.delete(id);
      else next.add(id);
      return next;
    });
    startTransition(async () => {
      const result = await marcarItem(id, !yaMarcado);
      if (result?.error) {
        toast.error(result.error);
        setMarcados((prev) => {
          const next = new Set(prev);
          if (yaMarcado) next.add(id);
          else next.delete(id);
          return next;
        });
      }
    });
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay tareas configuradas para tu rol.</p>;
  }

  const completas = items.filter((i) => marcados.has(i.id)).length;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {completas}/{items.length} tareas de hoy
      </p>
      {items.map((item) => {
        const hecho = marcados.has(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => toggle(item.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-md border p-2.5 text-left text-sm transition-colors",
              hecho
                ? "border-green-300 bg-green-50 text-muted-foreground line-through dark:border-green-900/50 dark:bg-green-950/20"
                : "hover:bg-muted/40",
            )}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border",
                hecho ? "border-green-500 bg-green-500 text-white" : "border-input",
              )}
            >
              {hecho && <Check className="size-3" />}
            </span>
            {item.texto}
          </button>
        );
      })}
    </div>
  );
}
