"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { colaVideos } from "@/app/(protected)/videos/actions";
import { ESTADO_TRABAJO_LABELS, TONO_TRABAJO, trabajoActivo, type TrabajoVista } from "@/lib/trabajos-video";
import type { TopeDiario } from "@/lib/trabajos-video-server";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Chip } from "@/components/prospectos/piezas";
import { costoTexto, fechaCorta } from "./generar-video";

type Props = { trabajos: TrabajoVista[]; tope: TopeDiario; aviso: string | null };

/** «Cola de videos»: lo que se le ha pedido al servidor, con estado y costo. Solo la ve el CEO. */
export function ColaVideos(props: Props) {
  const [trabajos, setTrabajos] = useState(props.trabajos);
  const [tope, setTope] = useState(props.tope);
  const [aviso, setAviso] = useState(props.aviso);
  const [cargando, setCargando] = useState(false);
  const hayActivo = trabajos.some((t) => trabajoActivo(t.estado));

  async function refrescar(silencioso: boolean) {
    if (!silencioso) setCargando(true);
    const r = await colaVideos();
    if (!silencioso) setCargando(false);
    if ("error" in r) {
      if (!silencioso) toast.error(r.error);
      return;
    }
    setTrabajos(r.trabajos);
    setTope(r.tope);
    setAviso(r.aviso ?? null);
  }

  // Mientras haya algo en proceso, la lista se pone al día sola.
  useEffect(() => {
    if (!hayActivo) return;
    const reloj = window.setInterval(() => {
      if (!document.hidden) void refrescar(true);
    }, 10000);
    return () => window.clearInterval(reloj);
  }, [hayActivo]);

  const costoTotal = trabajos.reduce((s, t) => s + (t.costoEstimadoUsd ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cola de videos</CardTitle>
        <CardDescription>
          Lo que se le pidió al servidor de videos: en qué va cada uno, cuántos intentos lleva y cuánto costó según lo
          que reporta el servidor (es un estimado, no la factura del proveedor).
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Chip tono={tope.usados >= tope.max ? "ambar" : "neutro"}>
            Hoy: {tope.usados} de {tope.max}
          </Chip>
          <Button variant="ghost" size="sm" disabled={cargando} onClick={() => refrescar(false)}>
            <RefreshCw className={cn(cargando && "animate-spin")} /> Actualizar
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {aviso && (
          <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {aviso}
          </p>
        )}
        {trabajos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se ha pedido ningún video.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Formato</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Intentos</TableHead>
                  <TableHead>Pidió</TableHead>
                  <TableHead>Costo estimado</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trabajos.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{fechaCorta(t.creadoAt)}</TableCell>
                    <TableCell className="max-w-48 truncate font-medium">
                      {t.producto} <span className="font-mono text-xs text-muted-foreground">v{t.version}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{t.formatoNombre || t.formato}</TableCell>
                    <TableCell>
                      <Chip tono={TONO_TRABAJO[t.estado]}>{ESTADO_TRABAJO_LABELS[t.estado]}</Chip>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {t.intentos}/{t.maxIntentos}
                    </TableCell>
                    <TableCell className="max-w-36 truncate text-muted-foreground">{t.pedidoPor.nombre || "—"}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{costoTexto(t)}</TableCell>
                    <TableCell className="max-w-72 text-xs whitespace-normal text-muted-foreground">
                      {t.estado === "listo"
                        ? `Entregado ${fechaCorta(t.terminadoAt)}${t.resultado?.sinVoz ? " · sin voz" : ""}`
                        : t.motivo || t.progreso?.detalle || (t.origen === "correccion" ? "Por corrección del cliente" : "—")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {costoTotal > 0 && (
          <p className="text-xs text-muted-foreground">
            Costo estimado de los {trabajos.length} trabajos de la lista: US$ {costoTotal.toFixed(2)}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
