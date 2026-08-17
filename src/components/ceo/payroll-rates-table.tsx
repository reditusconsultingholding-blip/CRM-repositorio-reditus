"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, EyeOff, Eye, ChevronDown, ChevronRight } from "lucide-react";
import { updateUserPayrollRate, setIncluirEnNomina } from "@/app/(protected)/ceo/payroll-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PersonRate = {
  userId: string;
  name: string;
  role: string;
  modo: "semanal_fijo" | "por_pieza" | null;
  monto: number | null;
  moneda: "USD" | "COP" | null;
  incluirEnNomina: boolean;
};

const MODO_LABELS: Record<string, string> = {
  semanal_fijo: "Semanal fijo",
  por_pieza: "Por pieza",
};

function VisibilityButton({ person }: { person: PersonRate }) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !person.incluirEnNomina;
    startTransition(async () => {
      const result = await setIncluirEnNomina(person.userId, next);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(next ? `${person.name} vuelve a contar en nómina` : `${person.name} escondido de nómina`);
      }
    });
  }

  return (
    <Button
      size="icon-sm"
      type="button"
      variant="outline"
      onClick={toggle}
      disabled={pending}
      title={person.incluirEnNomina ? "Esconder de nómina" : "Mostrar de nuevo en nómina"}
      className="h-8 w-full"
    >
      {person.incluirEnNomina ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
    </Button>
  );
}

function Row({ person }: { person: PersonRate }) {
  const [modo, setModo] = useState<"semanal_fijo" | "por_pieza">(person.modo ?? "semanal_fijo");
  const [monto, setMonto] = useState(String(person.monto ?? ""));
  const [moneda, setMoneda] = useState<"USD" | "COP">(person.moneda ?? "USD");
  const [pending, startTransition] = useTransition();

  function save() {
    const n = Number(monto);
    if (!n || n <= 0) {
      toast.error("Ingresa un monto válido.");
      return;
    }
    startTransition(async () => {
      const result = await updateUserPayrollRate(person.userId, modo, n, moneda);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`Tarifa de ${person.name} guardada`);
      }
    });
  }

  return (
    <div className="grid grid-cols-12 items-end gap-2 border-b py-2 text-sm last:border-b-0">
      <div className="col-span-3">
        <p className="font-medium">{person.name}</p>
        <p className="text-xs text-muted-foreground">{person.role}</p>
      </div>
      <div className="col-span-2">
        <Select
          items={MODO_LABELS}
          value={modo}
          onValueChange={(v) => setModo(v as "semanal_fijo" | "por_pieza")}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semanal_fijo">Semanal fijo</SelectItem>
            <SelectItem value="por_pieza">Por pieza (video/página)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2">
        <Input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className="h-8" />
      </div>
      <div className="col-span-2">
        <Select items={{ USD: "USD", COP: "COP" }} value={moneda} onValueChange={(v) => setMoneda(v as "USD" | "COP")}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="COP">COP</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-1">
        <VisibilityButton person={person} />
      </div>
      <div className="col-span-2">
        <Button size="sm" type="button" onClick={save} disabled={pending} className="h-8 w-full gap-1 px-2 text-xs">
          <Check className="size-3.5" />
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}

export function PayrollRatesTable({ people }: { people: PersonRate[] }) {
  const [showHidden, setShowHidden] = useState(false);
  const visibles = people.filter((p) => p.incluirEnNomina);
  const escondidos = people.filter((p) => !p.incluirEnNomina);

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-12 gap-2 border-b pb-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
        <div className="col-span-3">Persona</div>
        <div className="col-span-2">Modo</div>
        <div className="col-span-2">Monto</div>
        <div className="col-span-2">Moneda</div>
        <div className="col-span-1">En nómina</div>
        <div className="col-span-2"></div>
      </div>
      {visibles.map((p) => (
        <Row key={p.userId} person={p} />
      ))}
      {visibles.length === 0 && (
        <p className="py-3 text-sm text-muted-foreground">
          No hay personal visible en nómina. Créalos en Usuarios y aparecen aquí para configurar su
          tarifa.
        </p>
      )}

      {escondidos.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showHidden ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {escondidos.length} escondido(s) de nómina
          </button>
          {showHidden && (
            <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-dashed p-2">
              {escondidos.map((p) => (
                <div key={p.userId} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <span className="font-medium">{p.name}</span>{" "}
                    <span className="text-xs text-muted-foreground">— {p.role}</span>
                  </div>
                  <VisibilityButton person={p} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
