"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { createIngreso, updateIngreso } from "@/app/(protected)/ingresos/actions";
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

export type EditableIngreso = {
  id: string;
  client_name: string;
  whatsapp_number: string;
  pais: string | null;
  client_tax_id: string | null;
  moneda: "USD" | "COP";
  precio_final_descuento: number | null;
  responsable_id: string | null;
  items: Item[];
};

export function IngresoFormDialog({
  responsables,
  ingreso,
}: {
  responsables: Responsable[];
  ingreso?: EditableIngreso;
}) {
  const isEdit = !!ingreso;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<Item[]>(ingreso?.items.length ? ingreso.items : [{ ...EMPTY_ITEM }]);
  const [moneda, setMoneda] = useState<"USD" | "COP">(ingreso?.moneda ?? "USD");
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
    formData.set("moneda", moneda);
    startTransition(async () => {
      const result = isEdit ? await updateIngreso(ingreso!.id, formData) : await createIngreso(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(isEdit ? "Ingreso actualizado" : "Ingreso creado");
        if (!isEdit) {
          formRef.current?.reset();
          setItems([{ ...EMPTY_ITEM }]);
        }
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button type="button" size="icon-sm" variant="outline" title="Editar ingreso" />
          ) : (
            <Button />
          )
        }
      >
        {isEdit ? <Pencil className="size-3.5" /> : "Nuevo ingreso"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar ingreso" : "Nuevo ingreso"}</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={handleSubmit} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="client_name">Nombre del cliente</Label>
            <Input id="client_name" name="client_name" defaultValue={ingreso?.client_name} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="whatsapp_number">Número de WhatsApp</Label>
            <Input
              id="whatsapp_number"
              name="whatsapp_number"
              defaultValue={ingreso?.whatsapp_number}
              required
              placeholder="+57..."
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pais">País</Label>
            <Input id="pais" name="pais" defaultValue={ingreso?.pais ?? ""} />
          </div>

          <div className="col-span-2 flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label>Servicios / productos</Label>
              <div className="flex items-center gap-2">
                <Select value={moneda} onValueChange={(v) => setMoneda(v as "USD" | "COP")}>
                  <SelectTrigger className="h-8 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="COP">COP</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  <Plus className="size-3.5" /> Agregar servicio
                </Button>
              </div>
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
              Total: {totalCalculado.toLocaleString("es-CO", { style: "currency", currency: moneda })}
            </p>
          </div>

          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="precio_final_descuento">
              Precio final en {moneda} (opcional — solo si aplica un descuento distinto a la suma)
            </Label>
            <Input
              id="precio_final_descuento"
              name="precio_final_descuento"
              type="number"
              step="0.01"
              defaultValue={ingreso?.precio_final_descuento ?? undefined}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="client_tax_id">NIT o Cédula del cliente (opcional)</Label>
            <Input
              id="client_tax_id"
              name="client_tax_id"
              placeholder="Para la cuenta de cobro/factura"
              defaultValue={ingreso?.client_tax_id ?? ""}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label>Responsable</Label>
            <Select
              name="responsable_id"
              items={Object.fromEntries(responsables.map((r) => [r.id, r.name]))}
              defaultValue={ingreso?.responsable_id ?? undefined}
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
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear ingreso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
