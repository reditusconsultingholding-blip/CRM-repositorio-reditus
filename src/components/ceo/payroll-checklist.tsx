"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, Undo2 } from "lucide-react";
import { markPayrollPaid, unmarkPayrollPaid } from "@/app/(protected)/ceo/payroll-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ChecklistItem } from "@/lib/payroll-checklist";

function fmtUsd(n: number) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function PayrollChecklist({
  weekStart,
  weekEnd,
  limitDate,
  items,
}: {
  weekStart: string;
  weekEnd: string;
  limitDate: string;
  items: ChecklistItem[];
}) {
  const [pending, startTransition] = useTransition();

  const total = items.reduce((s, it) => s + it.amountUsd, 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Semana {weekStart} a {weekEnd} · plazo de pago hasta el lunes {limitDate} · total {fmtUsd(total)}
      </p>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.userId} className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {it.name} <span className="font-normal text-muted-foreground">— {it.role}</span>
              </p>
              <p className="text-xs text-muted-foreground">{it.detalle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="font-mono font-medium">{fmtUsd(it.amountUsd)}</span>
              {it.paid ? (
                <div className="flex items-center gap-2">
                  <Badge variant={it.isLate ? "destructive" : "default"} className="whitespace-nowrap">
                    {it.isLate ? `Pagado, ${it.daysLate}d tarde` : "Pagado a tiempo"}
                  </Badge>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={pending}
                    title="Deshacer"
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await unmarkPayrollPaid(it.userId, weekStart);
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
                        }
                      })
                    }
                  >
                    <Undo2 className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant={it.isLate ? "destructive" : "outline"}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await markPayrollPaid(it.userId, weekStart);
                        toast.success(`${it.name} marcado como pagado`);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "No se pudo marcar");
                      }
                    })
                  }
                >
                  <Check className="size-3.5" /> {it.isLate ? "Marcar pagado (tarde)" : "Marcar pagado"}
                </Button>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay personal activo con nómina esta semana.</p>
        )}
      </div>
    </div>
  );
}
