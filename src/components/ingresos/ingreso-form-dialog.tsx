"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { createIngreso } from "@/app/(protected)/ingresos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Responsable = { id: string; name: string };

type Item = {
  servicio: string;
  producto: string;
  cantidad: number;
  precio_unitario: number;
};

const EMPTY_ITEM: Item = { servicio: "", producto: "", cantidad: 1, precio_unitario: 0 };

export function IngresoFormDialog({ responsables }: { responsables: Responsable[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<Item[]>([{ ...EMPTY_ITEM }]);
  const formRef = useRef<HTMLFormElement>(null);

  function updateItem(index: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const totalCalculado = items.reduce((sum, it) => sum + it.cantidad * it.precio_unitario, 0);

  function handleSubmit(formData: FormData) {
    formData.set("items_json", JSON.stringify(items));
    startTransition(async () => {
      try {
        await createIngreso(formData);
        toast.success("Ingreso creado");
        formRef.current?.reset();
        setItems([{ ...EMPTY_ITEM }]);
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo crear el ingreso");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Nuevo ingreso</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo ingreso</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={handleSubmit} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="client_name">Nombre del cliente</Label>
            <Input id="client_name" name="client_name" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="whatsapp_number">Número de WhatsApp</Label>
            <Input id="whatsapp_number" name="whatsapp_number" required placeholder="+57..." />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pais">País</Label>
            <Input id="pais" name="pais" />
          </div>

          <div className="col-span-2 flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label>Servicios / productos</Label>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus className="size-3.5" /> Agregar servicio
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-3 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs text-muted-foreground">Servicio</Label>}
                    <Input
                      value={item.servicio}
                      onChange={(e) => updateItem(i, { servicio: e.target.value })}
                      placeholder="Landing page"
                    />
                  </div>
                  <div className="col-span-4 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs text-muted-foreground">Producto</Label>}
                    <Input
                      value={item.producto}
                      onChange={(e) => updateItem(i, { producto: e.target.value })}
                      placeholder="Ej. 10 landing pages"
                      required
                    />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs text-muted-foreground">Cant.</Label>}
                    <Input
                      type="number"
                      min={1}
                      step="1"
                      value={item.cantidad}
                      onChange={(e) => updateItem(i, { cantidad: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs text-muted-foreground">Precio c/u</Label>}
                    <Input
                      type="number"
                      step="0.01"
                      value={item.precio_unitario}
                      onChange={(e) =>
                        updateItem(i, { precio_unitario: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={items.length === 1}
                      onClick={() => removeItem(i)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-right text-sm text-muted-foreground">
              Total: {totalCalculado.toLocaleString("es-CO", { style: "currency", currency: "USD" })}
            </p>
          </div>

          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="precio_final_descuento">
              Precio final (opcional — solo si aplica un descuento distinto a la suma)
            </Label>
            <Input id="precio_final_descuento" name="precio_final_descuento" type="number" step="0.01" />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="client_tax_id">NIT o Cédula del cliente (opcional)</Label>
            <Input id="client_tax_id" name="client_tax_id" placeholder="Para la cuenta de cobro/factura" />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label>Responsable</Label>
            <Select
              name="responsable_id"
              items={Object.fromEntries(responsables.map((r) => [r.id, r.name]))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un responsable" />
              </SelectTrigger>
              <SelectContent>
                {responsables.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="col-span-2 mt-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Crear ingreso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
