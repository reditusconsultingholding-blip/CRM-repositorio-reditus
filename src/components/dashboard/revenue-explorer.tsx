"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRevenueForRange } from "@/app/(protected)/dashboard/revenue-actions";

function fmtUsd(n: number) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const today = () => new Date().toISOString().slice(0, 10);

export function RevenueExplorer() {
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [result, setResult] = useState<{ total: number; count: number; label: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(s: string, e: string, label: string) {
    startTransition(async () => {
      try {
        const r = await getRevenueForRange(s, e);
        setResult({ ...r, label });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo consultar");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Consultar ingresos por fecha</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="rev-start" className="text-xs">Desde</Label>
            <Input id="rev-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 w-40" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="rev-end" className="text-xs">Hasta</Label>
            <Input id="rev-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8 w-40" />
          </div>
          <Button type="button" size="sm" disabled={pending} onClick={() => run(start, end, `${start} → ${end}`)}>
            Consultar
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(today(), today(), "Hoy")}>
            Hoy
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(isoDaysAgo(6), today(), "Últimos 7 días")}>
            Últimos 7 días
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(isoDaysAgo(13), today(), "Últimos 14 días")}>
            Últimos 14 días
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(isoDaysAgo(29), today(), "Último mes")}>
            Último mes
          </Button>
        </div>

        {result && (
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">{result.label}</p>
            <p className="text-2xl font-semibold">{fmtUsd(result.total)}</p>
            <p className="text-xs text-muted-foreground">{result.count} pedido(s)</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
