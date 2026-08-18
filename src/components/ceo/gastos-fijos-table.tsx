"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Check, Pencil } from "lucide-react";
import { addGastoFijo, updateGastoFijo, deleteGastoFijo } from "@/app/(protected)/ceo/payroll-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GastoFijo } from "@/lib/gastos-fijos";

function fmtUsd(n: number) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function Row({ item }: { item: GastoFijo }) {
  const [editing, setEditing] = useState(false);
  const [nombre, setNombre] = useState(item.nombre);
  const [monto, setMonto] = useState(String(item.montoUsd));
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateGastoFijo(item.id, nombre, Number(monto));
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Actualizado");
        setEditing(false);
      }
    });
  }

  function remove() {
    if (!confirm(`¿Quitar "${item.nombre}" de los gastos fijos?`)) return;
    startTransition(async () => {
      const result = await deleteGastoFijo(item.id);
      if (result?.error) toast.error(result.error);
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 border-b py-2 text-sm last:border-b-0">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-8 flex-1" />
        <Input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className="h-8 w-28" />
        <Button type="button" size="icon-sm" onClick={save} disabled={pending} title="Guardar">
          <Check className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 border-b py-2 text-sm last:border-b-0">
      <span>{item.nombre}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono">{fmtUsd(item.montoUsd)}/mes</span>
        <Button type="button" size="icon-sm" variant="outline" onClick={() => setEditing(true)} title="Editar">
          <Pencil className="size-3.5" />
        </Button>
        <Button type="button" size="icon-sm" variant="destructive" onClick={remove} disabled={pending} title="Quitar">
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function GastosFijosTable({ items }: { items: GastoFijo[] }) {
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const total = items.reduce((s, i) => s + i.montoUsd, 0);

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      const result = await addGastoFijo(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Agregado");
        formRef.current?.reset();
        setAdding(false);
      }
    });
  }

  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <Row key={item.id} item={item} />
      ))}
      {items.length === 0 && <p className="py-3 text-sm text-muted-foreground">Sin gastos fijos registrados.</p>}

      <div className="mt-2 flex items-center justify-between border-t pt-2">
        <span className="text-sm font-semibold">Total mensual</span>
        <span className="font-mono text-sm font-semibold">{fmtUsd(total)}/mes</span>
      </div>

      {adding ? (
        <form ref={formRef} action={handleAdd} className="mt-3 flex items-center gap-2">
          <Input name="nombre" placeholder="Nombre (ej. Magnific)" required className="h-8 flex-1" />
          <Input name="monto_usd" type="number" step="0.01" placeholder="USD/mes" required className="h-8 w-28" />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Guardando…" : "Agregar"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(false)}>
            Cancelar
          </Button>
        </form>
      ) : (
        <Button type="button" size="sm" variant="outline" className="mt-3 w-fit gap-1.5" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" /> Agregar gasto fijo
        </Button>
      )}
    </div>
  );
}
