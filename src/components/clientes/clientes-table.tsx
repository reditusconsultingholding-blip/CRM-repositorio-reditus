"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient_, updateClient, deleteClient } from "@/app/(protected)/clientes/actions";

export type ClienteRow = {
  id: string;
  name: string;
  whatsapp_number: string;
  country: string | null;
  tax_id: string | null;
  historico_pedidos_ajuste: number | null;
  historico_gasto_ajuste_usd: number | null;
  pedidosActuales: number;
  gastoActual: number;
  pedidosHistoricos: number;
  gastoHistorico: number;
  gastoTotal: number;
  comisionesReferidos: number;
};

function ClienteForm({
  cliente,
  onSubmit,
  onDone,
}: {
  cliente?: ClienteRow;
  onSubmit: (formData: FormData) => Promise<{ error?: string } | undefined>;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await onSubmit(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(cliente ? "Cliente actualizado" : "Cliente agregado");
        onDone();
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" defaultValue={cliente?.name} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="whatsapp_number">WhatsApp</Label>
        <Input id="whatsapp_number" name="whatsapp_number" defaultValue={cliente?.whatsapp_number} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="country">País</Label>
        <Input id="country" name="country" defaultValue={cliente?.country ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tax_id">NIT / Cédula</Label>
        <Input id="tax_id" name="tax_id" defaultValue={cliente?.tax_id ?? ""} />
      </div>
      {cliente && (
        <div className="grid gap-2 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">
            Ajuste manual del histórico (opcional) — corrige el pedido/gasto importado sin tocar el
            resto. Déjalo vacío para seguir mostrando el total calculado automáticamente. Los pedidos
            y el gasto registrados en la app se editan desde{" "}
            <span className="font-medium text-foreground">Ingresos</span>, no aquí.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="historico_pedidos_ajuste">Pedidos históricos</Label>
              <Input
                id="historico_pedidos_ajuste"
                name="historico_pedidos_ajuste"
                type="number"
                min={0}
                step="1"
                placeholder={String(cliente.pedidosHistoricos)}
                defaultValue={cliente.historico_pedidos_ajuste ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="historico_gasto_ajuste_usd">Gasto histórico (USD)</Label>
              <Input
                id="historico_gasto_ajuste_usd"
                name="historico_gasto_ajuste_usd"
                type="number"
                step="0.01"
                placeholder={cliente.gastoHistorico.toFixed(2)}
                defaultValue={cliente.historico_gasto_ajuste_usd ?? ""}
              />
            </div>
          </div>
        </div>
      )}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function fmtUsd(n: number) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function fmtCop(n: number) {
  return `${Math.round(n).toLocaleString("es-CO")} COP`;
}

function downloadCsv(rows: ClienteRow[]) {
  const headers = [
    "Nombre",
    "WhatsApp",
    "Pais",
    "NIT/Cedula",
    "Pedidos app",
    "Gasto app (USD)",
    "Pedidos historicos",
    "Gasto historico (USD)",
    "Gasto total (USD)",
    "Comisiones por referidos (USD)",
  ];
  const lines = rows.map((r) =>
    [r.name, r.whatsapp_number, r.country ?? "", r.tax_id ?? "", r.pedidosActuales, r.gastoActual.toFixed(2), r.pedidosHistoricos, r.gastoHistorico.toFixed(2), r.gastoTotal.toFixed(2), r.comisionesReferidos.toFixed(2)]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clientes-reditus-${new Date().toISOString().slice(0, 10)}.csv`;
  // Firefox (y algunos navegadores móviles) no dispara la descarga si el
  // <a> no está montado en el documento al hacer click — por eso antes no
  // funcionaba en algunos casos.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ClienteRowActions({ cliente }: { cliente: ClienteRow }) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`¿Borrar a ${cliente.name}? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      const result = await deleteClient(cliente.id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`${cliente.name} eliminado`);
      }
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger render={<Button type="button" size="icon-sm" variant="outline" title="Editar" />}>
          <Pencil className="size-3.5" />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {cliente.name}</DialogTitle>
          </DialogHeader>
          <ClienteForm cliente={cliente} onSubmit={(fd) => updateClient(cliente.id, fd)} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>
      <Button type="button" size="icon-sm" variant="destructive" onClick={handleDelete} disabled={pending} title="Borrar">
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

export function ClientesTable({ rows, rateCop }: { rows: ClienteRow[]; rateCop: number }) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => downloadCsv(rows)}>
          <Download className="size-3.5" />
          Descargar CSV
        </Button>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger render={<Button type="button" size="sm" className="gap-1.5" />}>
            <Plus className="size-3.5" />
            Agregar cliente
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo cliente</DialogTitle>
            </DialogHeader>
            <ClienteForm onSubmit={createClient_} onDone={() => setAddOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>País</TableHead>
              <TableHead>Pedidos (app)</TableHead>
              <TableHead>Gasto (app)</TableHead>
              <TableHead>Pedidos históricos</TableHead>
              <TableHead>Gasto histórico</TableHead>
              <TableHead>Gasto total</TableHead>
              <TableHead>Comisiones por referidos</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.whatsapp_number}</TableCell>
                <TableCell>{r.country ?? "—"}</TableCell>
                <TableCell>{r.pedidosActuales}</TableCell>
                <TableCell>{fmtUsd(r.gastoActual)}</TableCell>
                <TableCell>{r.pedidosHistoricos}</TableCell>
                <TableCell>
                  <div>{fmtUsd(r.gastoHistorico)}</div>
                  <div className="text-xs text-muted-foreground">{fmtCop(r.gastoHistorico * rateCop)}</div>
                </TableCell>
                <TableCell className="font-semibold">
                  <div>{fmtUsd(r.gastoTotal)}</div>
                </TableCell>
                <TableCell className={r.comisionesReferidos > 0 ? "font-medium text-sky-700 dark:text-sky-400" : "text-muted-foreground"}>
                  {r.comisionesReferidos > 0 ? fmtUsd(r.comisionesReferidos) : "—"}
                </TableCell>
                <TableCell>
                  <ClienteRowActions cliente={r} />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  Todavía no hay clientes registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
