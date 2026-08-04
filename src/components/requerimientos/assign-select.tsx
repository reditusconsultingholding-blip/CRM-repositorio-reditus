"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { assignEncargado } from "@/app/(protected)/requerimientos/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Person = { id: string; name: string };

export function AssignSelect({
  requerimientoId,
  currentEncargadoId,
  people,
}: {
  requerimientoId: string;
  currentEncargadoId: string | null;
  people: Person[];
}) {
  const [pending, startTransition] = useTransition();

  const items = Object.fromEntries(people.map((p) => [p.id, p.name]));

  return (
    <Select
      items={items}
      value={currentEncargadoId ?? undefined}
      disabled={pending}
      onValueChange={(next) =>
        startTransition(async () => {
          if (!next) return;
          try {
            await assignEncargado(requerimientoId, next);
            toast.success("Requerimiento asignado");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo asignar");
          }
        })
      }
    >
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Sin asignar" />
      </SelectTrigger>
      <SelectContent>
        {people.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
