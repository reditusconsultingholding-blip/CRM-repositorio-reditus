"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateRequerimientoTexto, type CampoTextoRequerimiento } from "@/app/(protected)/requerimientos/actions";
import { Input } from "@/components/ui/input";

export function InlineTextCell({
  requerimientoId,
  campo,
  valor,
  placeholder,
  isLink = false,
}: {
  requerimientoId: string;
  campo: CampoTextoRequerimiento;
  valor: string | null;
  placeholder?: string;
  isLink?: boolean;
}) {
  const [value, setValue] = useState(valor ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    if (value === (valor ?? "")) return;
    startTransition(async () => {
      const result = await updateRequerimientoTexto(requerimientoId, campo, value);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        placeholder={placeholder}
        disabled={pending}
        className="h-7 min-w-24 border-transparent bg-transparent px-1.5 text-xs hover:border-input focus-visible:border-input"
      />
      {isLink && valor && (
        <a href={valor} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary hover:underline" title="Abrir link">
          ↗
        </a>
      )}
    </div>
  );
}
