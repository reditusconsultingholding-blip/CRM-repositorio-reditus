"use client";

import { cn } from "@/lib/utils";

// Piezas pequeñas compartidas por las pantallas del embudo de prospección.

export const ETIQUETA = "font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground";

/** Selector de una sola opción, tipo pastillas. Si lleva `name`, viaja en el
 * formulario como un campo oculto. */
export function Segmento<T extends string>({
  name,
  value,
  onChange,
  opciones,
  etiquetas,
  disabled,
}: {
  name?: string;
  value: T;
  onChange: (v: T) => void;
  opciones: readonly T[];
  etiquetas: Record<T, string>;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {name && <input type="hidden" name={name} value={value} />}
      {opciones.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          disabled={disabled}
          onClick={() => onChange(o)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50",
            value === o
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {etiquetas[o]}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  tono = "neutro",
  children,
  className,
}: {
  tono?: "neutro" | "azul" | "ambar" | "verde" | "rojo";
  children: React.ReactNode;
  className?: string;
}) {
  const tonos = {
    neutro: "border-border bg-muted/60 text-muted-foreground",
    azul: "border-primary/30 bg-primary/10 text-primary",
    ambar: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    verde: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    rojo: "border-destructive/30 bg-destructive/10 text-destructive",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap",
        tonos[tono],
        className,
      )}
    >
      {children}
    </span>
  );
}
