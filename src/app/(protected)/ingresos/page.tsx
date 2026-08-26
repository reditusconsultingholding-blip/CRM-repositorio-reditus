import { createClient } from "@/lib/supabase/server";
import { updateIngresoEstado, updateEstadoPago } from "./actions";
import { IngresoFormDialog } from "@/components/ingresos/ingreso-form-dialog";
import { DeleteIngresoButton } from "@/components/ingresos/delete-ingreso-button";
import { EstadoComercialCell } from "@/components/ingresos/estado-comercial-cell";
import { EstadoSelect } from "@/components/estado-select";
import { LiveSync } from "@/components/live-sync";
import { Bell } from "lucide-react";
import {
  INGRESO_ESTADOS,
  INGRESO_ESTADO_COLORS,
  ESTADOS_PAGO,
  ESTADO_PAGO_COLORS,
  type IngresoEstado,
  type EstadoPago,
  type EstadoComercial,
} from "@/lib/statuses";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type IngresoRow = {
  id: string;
  tracking_id: string;
  fecha: string;
  estado: IngresoEstado;
  servicio: string | null;
  pais: string | null;
  producto: string | null;
  precio_total: number | null;
  precio_final_descuento: number | null;
  comision_plataforma: number | null;
  plataforma_pago: string | null;
  comprobante_pago_url: string | null;
  comprobante_pago_nombre: string | null;
  recordatorio_fecha: string | null;
  recordatorio_nota: string | null;
  recordatorio_enviado: boolean;
  referido_por_client_id: string | null;
  comision_referido: number | null;
  modalidad_pago: "completo" | "parcial";
  monto_pagado: number | null;
  fecha_compromiso_saldo: string | null;
  moneda: "USD" | "COP";
  estado_pago: EstadoPago;
  estado_comercial: EstadoComercial;
  cotizacion_numero: string | null;
  cuenta_cobro_numero: string | null;
  responsable_id: string | null;
  client: { name: string; whatsapp_number: string; tax_id: string | null } | null;
  responsable: { name: string } | null;
  referido: { name: string; whatsapp_number: string } | { name: string; whatsapp_number: string }[] | null;
  ingreso_items: { servicio: string | null; producto: string; cantidad: number; precio_unitario: number }[] | null;
};

function normalizeJoin<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function IngresosPage() {
  const supabase = await createClient();

  const [{ data: ingresos }, { data: users }] = await Promise.all([
    supabase
      .from("ingresos")
      .select(
        "id, tracking_id, fecha, estado, servicio, pais, producto, precio_total, precio_final_descuento, comision_plataforma, plataforma_pago, comprobante_pago_url, comprobante_pago_nombre, recordatorio_fecha, recordatorio_nota, recordatorio_enviado, referido_por_client_id, comision_referido, modalidad_pago, monto_pagado, fecha_compromiso_saldo, moneda, estado_pago, estado_comercial, cotizacion_numero, cuenta_cobro_numero, responsable_id, client:clients!ingresos_client_id_fkey(name, whatsapp_number, tax_id), responsable:users(name), referido:clients!ingresos_referido_por_client_id_fkey(name, whatsapp_number), ingreso_items(servicio, producto, cantidad, precio_unitario)",
      )
      .order("created_at", { ascending: true })
      .returns<IngresoRow[]>(),
    supabase.from("users").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Ingresos</h1>
          <LiveSync tables={["ingresos"]} />
        </div>
        <IngresoFormDialog responsables={users ?? []} />
      </div>

      <div className="overflow-x-auto rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow className="[&>th]:border-r [&>th:last-child]:border-r-0">
              <TableHead>ID</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>País</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Precio final</TableHead>
              <TableHead>Comercial</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Documentos</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(ingresos ?? []).map((row) => {
              const referido = normalizeJoin(row.referido);
              return (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.tracking_id}</TableCell>
                <TableCell>{row.fecha}</TableCell>
                <TableCell>{row.client?.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.client?.whatsapp_number}
                </TableCell>
                <TableCell>{row.pais}</TableCell>
                <TableCell>
                  <div>{row.producto}</div>
                  {row.recordatorio_fecha && !row.recordatorio_enviado && (
                    <div
                      className="flex items-center gap-1 text-xs text-amber-700"
                      title={row.recordatorio_nota ?? ""}
                    >
                      <Bell className="size-3" />
                      {new Date(row.recordatorio_fecha).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div>
                    {row.precio_final_descuento != null
                      ? Number(row.precio_final_descuento).toLocaleString("es-CO", {
                          style: "currency",
                          currency: row.moneda ?? "USD",
                        })
                      : "—"}
                  </div>
                  {!!row.comision_plataforma && (
                    <div className="text-xs text-muted-foreground">
                      Comisión{row.plataforma_pago ? ` (${row.plataforma_pago})` : ""}:{" "}
                      {Number(row.comision_plataforma).toLocaleString("es-CO", {
                        style: "currency",
                        currency: row.moneda ?? "USD",
                      })}
                    </div>
                  )}
                  {row.comprobante_pago_url && (
                    <a
                      href={row.comprobante_pago_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Ver comprobante
                    </a>
                  )}
                  {referido && (
                    <div className="text-xs text-sky-700 dark:text-sky-400">
                      Referido por: {referido.name}
                      {row.comision_referido
                        ? ` (${Number(row.comision_referido).toLocaleString("es-CO", { style: "currency", currency: row.moneda ?? "USD" })})`
                        : ""}
                    </div>
                  )}
                  {row.modalidad_pago === "parcial" && (
                    <div className="text-xs text-amber-700 dark:text-amber-500">
                      Pago parcial: {Number(row.monto_pagado ?? 0).toLocaleString("es-CO", { style: "currency", currency: row.moneda ?? "USD" })}
                      {row.precio_final_descuento
                        ? ` (${Math.round(((row.monto_pagado ?? 0) / row.precio_final_descuento) * 100)}%)`
                        : ""}
                      {row.fecha_compromiso_saldo &&
                        ` · resto para el ${new Date(`${row.fecha_compromiso_saldo}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}`}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <EstadoComercialCell ingresoId={row.id} estado={row.estado_comercial} />
                </TableCell>
                <TableCell>
                  <EstadoSelect
                    value={row.estado_pago}
                    estados={ESTADOS_PAGO}
                    colors={ESTADO_PAGO_COLORS}
                    onChange={updateEstadoPago.bind(null, row.id)}
                  />
                </TableCell>
                <TableCell>{row.responsable?.name ?? "—"}</TableCell>
                <TableCell>
                  <EstadoSelect
                    value={row.estado as IngresoEstado}
                    estados={INGRESO_ESTADOS}
                    colors={INGRESO_ESTADO_COLORS}
                    onChange={updateIngresoEstado.bind(null, row.id)}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  <a
                    href={`/api/documentos/${row.id}/cotizacion`}
                    className="text-primary hover:underline"
                  >
                    Cotización
                  </a>
                  {row.cuenta_cobro_numero && (
                    <>
                      {" · "}
                      <a
                        href={`/api/documentos/${row.id}/cuenta_cobro`}
                        className="text-primary hover:underline"
                      >
                        Factura
                      </a>
                    </>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <IngresoFormDialog
                      responsables={users ?? []}
                      ingreso={{
                        id: row.id,
                        client_name: row.client?.name ?? "",
                        whatsapp_number: row.client?.whatsapp_number ?? "",
                        pais: row.pais,
                        client_tax_id: row.client?.tax_id ?? null,
                        moneda: row.moneda,
                        comision_plataforma: row.comision_plataforma,
                        plataforma_pago: row.plataforma_pago,
                        comprobante_pago_url: row.comprobante_pago_url,
                        comprobante_pago_nombre: row.comprobante_pago_nombre,
                        recordatorio_fecha: row.recordatorio_enviado ? null : row.recordatorio_fecha,
                        recordatorio_nota: row.recordatorio_nota,
                        referido_por_client_id: row.referido_por_client_id,
                        referido_por_nombre: referido?.name ?? null,
                        referido_por_whatsapp: referido?.whatsapp_number ?? null,
                        comision_referido: row.comision_referido,
                        modalidad_pago: row.modalidad_pago,
                        monto_pagado: row.monto_pagado,
                        fecha_compromiso_saldo: row.fecha_compromiso_saldo,
                        responsable_id: row.responsable_id,
                        items:
                          row.ingreso_items && row.ingreso_items.length > 0
                            ? row.ingreso_items.map((it) => ({
                                servicio: it.servicio ?? "",
                                producto: it.producto,
                                cantidad: it.cantidad,
                                precio_unitario: it.precio_unitario,
                              }))
                            : [{ servicio: row.servicio ?? "", producto: row.producto ?? "", cantidad: 1, precio_unitario: row.precio_final_descuento ?? 0 }],
                      }}
                    />
                    <DeleteIngresoButton ingresoId={row.id} trackingId={row.tracking_id} />
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
            {(ingresos ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={13} className="text-center text-muted-foreground">
                  Todavía no hay ingresos registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
