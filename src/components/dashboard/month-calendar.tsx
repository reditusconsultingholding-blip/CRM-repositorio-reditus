"use client";

import { useState } from "react";
import { Bell, BellOff, Package, DollarSign } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export type DiaData = { count: number; total: number };

export type DiaDetalle = {
  ingresos: { cliente: string; producto: string; monto: number }[];
  entregas: { producto: string; cliente: string; pipeline: string; encargado: string | null }[];
  recordatorios: { nota: string | null; producto: string; cliente: string; enviado: boolean }[];
};

function fmtUsd(n: number) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "USD" });
}

export function MonthCalendar({
  year,
  month, // 0-indexed
  data, // key: "YYYY-MM-DD"
  detalle,
}: {
  year: number;
  month: number;
  data: Record<string, DiaData>;
  detalle?: Record<string, DiaDetalle>;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // getUTCDay: 0=domingo..6=sábado → convertimos a lunes=0..domingo=6
  const leadingBlanks = (firstOfMonth.getUTCDay() + 6) % 7;

  const todayKey = new Date().toISOString().slice(0, 10);

  const cells: { key: string | null; day: number | null; isWeekend: boolean }[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ key: null, day: null, isWeekend: false });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const weekday = new Date(Date.UTC(year, month, d)).getUTCDay(); // 0=domingo, 6=sábado
    cells.push({ key, day: d, isWeekend: weekday === 0 || weekday === 6 });
  }

  const diaSeleccionado = selected ? (detalle?.[selected] ?? { ingresos: [], entregas: [], recordatorios: [] }) : null;
  const hayAlgoEseDia =
    !!diaSeleccionado &&
    (diaSeleccionado.ingresos.length > 0 ||
      diaSeleccionado.entregas.length > 0 ||
      diaSeleccionado.recordatorios.length > 0);

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {DIAS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c.key) return <div key={i} className="aspect-square" />;
          const d = data[c.key];
          const det = detalle?.[c.key];
          const pendientes = (det?.entregas.length ?? 0) + (det?.recordatorios.filter((r) => !r.enviado).length ?? 0);
          const isToday = c.key === todayKey;
          return (
            <button
              type="button"
              key={c.key}
              onClick={() => setSelected(c.key)}
              className={`flex aspect-square flex-col items-center justify-center rounded-md border p-1 text-center transition-colors hover:border-primary/50 ${
                isToday ? "border-primary bg-primary/5" : "border-transparent bg-muted/40"
              }`}
              style={!isToday && c.isWeekend ? { background: "var(--brand-blue-tint)" } : undefined}
              title={
                d
                  ? `${d.count} pedido(s) · ${d.total.toLocaleString("es-CO", { style: "currency", currency: "USD" })}`
                  : undefined
              }
            >
              <span className={`text-xs ${isToday ? "font-semibold text-primary" : ""}`}>{c.day}</span>
              <div className="flex items-center gap-1">
                {d && d.count > 0 && (
                  <span className="text-[9px] font-medium text-green-700">{d.count}</span>
                )}
                {pendientes > 0 && (
                  <span className="flex items-center gap-0.5 text-[9px] font-medium text-amber-700">
                    <Bell className="size-2.5" />
                    {pendientes}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selected &&
                new Date(`${selected}T12:00:00`).toLocaleDateString("es-CO", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
            </DialogTitle>
          </DialogHeader>

          {!hayAlgoEseDia && (
            <p className="text-sm text-muted-foreground">Nada pendiente ni registrado para este día.</p>
          )}

          {diaSeleccionado && diaSeleccionado.entregas.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Package className="size-3.5" /> Por entregar
              </p>
              <div className="flex flex-col gap-1.5">
                {diaSeleccionado.entregas.map((e, i) => (
                  <div key={i} className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
                    <div className="font-medium">{e.producto}</div>
                    <div className="text-muted-foreground">
                      {e.cliente} · {e.pipeline}
                      {e.encargado ? ` · ${e.encargado}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diaSeleccionado && diaSeleccionado.recordatorios.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Bell className="size-3.5" /> Recordatorios
              </p>
              <div className="flex flex-col gap-1.5">
                {diaSeleccionado.recordatorios.map((r, i) => (
                  <div key={i} className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
                    <div className="flex items-center gap-1.5 font-medium">
                      {r.enviado ? (
                        <BellOff className="size-3 text-muted-foreground" />
                      ) : (
                        <Bell className="size-3 text-amber-700" />
                      )}
                      {r.nota || r.producto}
                    </div>
                    <div className="text-muted-foreground">
                      {r.cliente} · {r.producto}
                      {r.enviado ? " · ya avisado" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diaSeleccionado && diaSeleccionado.ingresos.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <DollarSign className="size-3.5" /> Ingresos registrados
              </p>
              <div className="flex flex-col gap-1.5">
                {diaSeleccionado.ingresos.map((r, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
                    <div>
                      <div className="font-medium">{r.cliente}</div>
                      <div className="text-muted-foreground">{r.producto}</div>
                    </div>
                    <div className="font-medium">{fmtUsd(r.monto)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
