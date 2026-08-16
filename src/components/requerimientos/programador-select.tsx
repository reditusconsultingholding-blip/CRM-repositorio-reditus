"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { assignProgramador } from "@/app/(protected)/requerimientos/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Person = { id: string; name: string };

export function ProgramadorSelect({
  requerimientoId,
  currentProgramadorId,
  people,
}: {
  requerimientoId: string;
  currentProgramadorId: string | null;
  people: Person[];
}) {
  const [pending, startTransition] = useTransition();

  const items = Object.fromEntries(people.map((p) => [p.id, p.name]));

  return (
    <Select
      items={items}
      value={currentProgramadorId ?? undefined}
      disabled={pending}
      onValueChange={(next) =>
        startTransition(async () => {
          if (!next) return;
          try {
            await assignProgramador(requerimientoId, next);
            toast.success("Programador asignado");
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
