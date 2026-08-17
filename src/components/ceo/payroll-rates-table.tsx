"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, EyeOff, Eye } from "lucide-react";
import { updateUserPayrollRate, setPayrollRateActive } from "@/app/(protected)/ceo/payroll-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type PersonRate = {
  userId: string;
  name: string;
  role: string;
  modo: "semanal_fijo" | "por_pieza" | null;
  monto: number | null;
  moneda: "USD" | "COP" | null;
  activo: boolean;
};

const MODO_LABELS: Record<string, string> = {
  semanal_fijo: "Semanal fijo",
  por_pieza: "Por pieza",
};

function Row({ person }: { person: PersonRate }) {
  const [modo, setModo] = useState<"semanal_fijo" | "por_pieza">(person.modo ?? "semanal_fijo");
  const [monto, setMonto] = useState(String(person.monto ?? ""));
  const [moneda, setMoneda] = useState<"USD" | "COP">(person.moneda ?? "USD");
  const [activo, setActivo] = useState(person.activo);
  const [pending, startTransition] = useTransition();
  const [togglePending, startToggle] = useTransition();
  const tieneRate = person.monto !== null;

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

  function toggleActivo() {
    if (!tieneRate) {
      toast.error("Primero configura y guarda una tarifa para esta persona.");
      return;
    }
    const next = !activo;
    startToggle(async () => {
      const result = await setPayrollRateActive(person.userId, next);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setActivo(next);
        toast.success(next ? `${person.name} vuelve a contar en nómina` : `${person.name} excluido de nómina`);
      }
    });
  }

  return (
    <div
      className={cn(
        "grid grid-cols-12 items-end gap-2 border-b py-2 text-sm last:border-b-0",
        !activo && "opacity-50",
      )}
    >
      <div className="col-span-3">
        <p className="font-medium">{person.name}</p>
        <p className="text-xs text-muted-foreground">{person.role}</p>
        {!activo && <p className="text-[11px] font-medium text-amber-600">Excluido de nómina</p>}
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
        <Button
          size="icon-sm"
          type="button"
          variant="outline"
          onClick={toggleActivo}
          disabled={togglePending}
          title={activo ? "Excluir de nómina" : "Incluir de nuevo en nómina"}
          className="h-8 w-full"
        >
          {activo ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </Button>
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
      {people.map((p) => (
        <Row key={p.userId} person={p} />
      ))}
      {people.length === 0 && (
        <p className="py-3 text-sm text-muted-foreground">
          No hay personal activo (fuera del CEO). Créalos en Usuarios y aparecen aquí para configurar su
          tarifa.
        </p>
      )}
    </div>
  );
}
