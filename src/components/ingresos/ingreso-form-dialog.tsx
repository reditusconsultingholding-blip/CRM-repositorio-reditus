"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Paperclip, FileIcon, X } from "lucide-react";
import { createIngreso, updateIngreso } from "@/app/(protected)/ingresos/actions";
import { createClient } from "@/lib/supabase/client";
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
import { INGRESO_SERVICIOS } from "@/lib/statuses";

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
  comision_plataforma: number | null;
  plataforma_pago: string | null;
  comprobante_pago_url: string | null;
  comprobante_pago_nombre: string | null;
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
  const [comprobante, setComprobante] = useState<{ url: string; nombre: string } | null>(
    ingreso?.comprobante_pago_url
      ? { url: ingreso.comprobante_pago_url, nombre: ingreso.comprobante_pago_nombre ?? "Comprobante" }
      : null,
  );
  const [uploadingComprobante, setUploadingComprobante] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const comprobanteInputRef = useRef<HTMLInputElement>(null);

  async function handleComprobante(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingComprobante(true);
    try {
      const supabase = createClient();
      const path = `${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("comprobantes-pago").upload(path, file);
      if (error) {
        toast.error(`No se pudo subir el comprobante: ${error.message}`);
        return;
      }
      const { data } = supabase.storage.from("comprobantes-pago").getPublicUrl(path);
      setComprobante({ url: data.publicUrl, nombre: file.name });
    } finally {
      setUploadingComprobante(false);
    }
  }

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
    if (comprobante) {
      formData.set("comprobante_pago_url", comprobante.url);
      formData.set("comprobante_pago_nombre", comprobante.nombre);
    }
    startTransition(async () => {
      const result = isEdit ? await updateIngreso(ingreso!.id, formData) : await createIngreso(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(isEdit ? "Ingreso actualizado" : "Ingreso creado");
        if (!isEdit) {
          formRef.current?.reset();
          setItems([{ ...EMPTY_ITEM }]);
          setComprobante(null);
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

          {!isEdit && (
            <label className="col-span-2 flex items-start gap-2 rounded-md border border-dashed p-3 text-sm">
              <input type="checkbox" name="es_cotizacion" className="mt-0.5" />
              <span>
                <span className="font-medium">Todavía es una cotización</span> — el cliente no ha
                confirmado. No cuenta como ingreso ni dispara producción hasta que la cierres (botón
                &quot;Marcar como cerrado&quot; en la tabla).
              </span>
            </label>
          )}

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
                    <Select value={item.servicio} onValueChange={(v) => updateItem(i, { servicio: v ?? "" })}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Elige uno" />
                      </SelectTrigger>
                      <SelectContent>
                        {INGRESO_SERVICIOS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

          <div className="col-span-2 grid grid-cols-2 gap-3 rounded-md border p-3">
            <div className="col-span-2 flex flex-col gap-1">
              <Label htmlFor="plataforma_pago">Plataforma donde pagó (opcional)</Label>
              <Input
                id="plataforma_pago"
                name="plataforma_pago"
                placeholder="Ej. Wompi, PayU, Nequi, transferencia…"
                defaultValue={ingreso?.plataforma_pago ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="comision_plataforma">Comisión de esa plataforma en {moneda}</Label>
              <Input
                id="comision_plataforma"
                name="comision_plataforma"
                type="number"
                step="0.01"
                placeholder="0.00"
                defaultValue={ingreso?.comision_plataforma ?? undefined}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Comprobante de pago (opcional)</Label>
              <input
                ref={comprobanteInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleComprobante}
              />
              {comprobante ? (
                <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
                  <a
                    href={comprobante.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-1.5 text-primary hover:underline"
                  >
                    <FileIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{comprobante.nombre}</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setComprobante(null)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    title="Quitar"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => comprobanteInputRef.current?.click()}
                  disabled={uploadingComprobante}
                >
                  <Paperclip className="size-3.5" />
                  {uploadingComprobante ? "Subiendo…" : "Adjuntar comprobante"}
                </Button>
              )}
            </div>
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
