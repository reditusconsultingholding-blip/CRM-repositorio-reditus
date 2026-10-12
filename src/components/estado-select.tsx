"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { ChevronDownIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
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
      {/* Disparador propio y no <SelectTrigger>: el genérico trae un fondo para
          el tema oscuro (dark:bg-input/30) que pisaba el color fijo del estado y
          dejaba el texto oscuro sobre fondo oscuro. Aquí la ficha conserva su
          color en los dos temas. */}
      <SelectPrimitive.Trigger
        data-slot="select-trigger"
        className={cn(
          "flex h-7 w-fit items-center justify-between gap-1.5 rounded-lg px-2 text-xs font-medium whitespace-nowrap outline-none select-none transition-[filter] hover:brightness-95 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center",
          colors[value],
        )}
      >
        <SelectValue />
        <SelectPrimitive.Icon render={<ChevronDownIcon className="pointer-events-none size-4 shrink-0 opacity-60" />} />
      </SelectPrimitive.Trigger>
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
