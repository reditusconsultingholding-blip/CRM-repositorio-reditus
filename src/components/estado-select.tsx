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
  onChange: (next: T) => Promise<{ error?: string } | undefined>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(next) =>
        startTransition(async () => {
          const result = await onChange(next as T);
          if (result?.error) toast.error(result.error);
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
