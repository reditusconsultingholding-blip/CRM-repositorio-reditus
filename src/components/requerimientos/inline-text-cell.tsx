"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { updateRequerimientoTexto, type CampoTextoRequerimiento } from "@/app/(protected)/requerimientos/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function InlineTextCell({
  requerimientoId,
  campo,
  valor,
  placeholder,
  isLink = false,
  type = "text",
}: {
  requerimientoId: string;
  campo: CampoTextoRequerimiento;
  valor: string | null;
  placeholder?: string;
  isLink?: boolean;
  /** "date" para fecha de entrega — el resto de campos son texto/link. */
  type?: "text" | "date";
}) {
  const [value, setValue] = useState(valor ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = value !== (valor ?? "");

  function save() {
    if (!dirty) return;
    startTransition(async () => {
      const result = await updateRequerimientoTexto(requerimientoId, campo, value);
      if (result?.error) toast.error(result.error);
      else toast.success("Guardado");
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder={placeholder}
        disabled={pending}
        // Fondo/borde visibles a propósito — antes se confundía con texto
        // fijo porque no se notaba que era un campo editable.
        className={cn(
          "h-8 min-w-24 border-input bg-muted/40 px-2 text-xs hover:bg-muted/60 focus-visible:bg-background",
          dirty && "border-amber-400",
        )}
      />
      {dirty && (
        <Button
          type="button"
          size="icon-sm"
          className="size-7 shrink-0"
          onClick={save}
          disabled={pending}
          title="Guardar"
        >
          <Check className="size-3.5" />
        </Button>
      )}
      {isLink && valor && !dirty && (
        <a href={valor} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary hover:underline" title="Abrir link">
          ↗
        </a>
      )}
    </div>
  );
}
