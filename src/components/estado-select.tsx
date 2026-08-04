"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function EstadoSelect<T extends string>({
  value,
  estados,
  colors,
  onChange,
}: {
  value: T;
  estados: readonly T[];
  colors: Record<T, string>;
  onChange: (next: T) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(next) =>
        startTransition(async () => {
          try {
            await onChange(next as T);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo actualizar el estado");
          }
        })
      }
    >
      <SelectTrigger className={cn("h-7 w-fit border-none px-2 text-xs font-medium", colors[value])}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {estados.map((estado) => (
          <SelectItem key={estado} value={estado}>
            <span className={cn("rounded px-1.5 py-0.5", colors[estado])}>{estado}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
