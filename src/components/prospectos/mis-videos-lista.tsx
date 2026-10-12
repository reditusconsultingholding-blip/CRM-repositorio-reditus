"use client";

import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import { SERVICIO_LABELS, urlTienda, type Servicio } from "@/lib/prospeccion";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip, ETIQUETA } from "./piezas";
import { SubirPieza } from "./subir-pieza";

export type PiezaAsignada = {
  id: string;
  nombre: string;
  servicio: Servicio;
  tienda: string;
  producto: string;
  pais: string;
  guion: string;
  videoUrl: string | null;
  videoNombre: string | null;
  terminado: boolean;
  /** Solo se llena para los roles de Ingresos, que ven las de todos. */
  encargado: string | null;
};

export function MisVideosLista({ piezas, vacio }: { piezas: PiezaAsignada[]; vacio: string }) {
  if (!piezas.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-10 text-center text-sm text-muted-foreground">
        {vacio}
      </p>
    );
  }
  const pendientes = piezas.filter((p) => !p.terminado);
  const listas = piezas.filter((p) => p.terminado);

  return (
    <div className="flex flex-col gap-6">
      {pendientes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className={ETIQUETA}>Por hacer · {pendientes.length}</h2>
          {pendientes.map((p) => (
            <Pieza key={p.id} p={p} />
          ))}
        </section>
      )}
      {listas.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className={ETIQUETA}>Terminadas · {listas.length}</h2>
          {listas.map((p) => (
            <Pieza key={p.id} p={p} />
          ))}
        </section>
      )}
    </div>
  );
}

function Pieza({ p }: { p: PiezaAsignada }) {
  const tienda = urlTienda(p.tienda);

  async function copiarGuion() {
    try {
      await navigator.clipboard.writeText(p.guion);
      toast.success("Guion copiado");
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-words">{p.nombre}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-1.5">
          <Chip tono="azul">{SERVICIO_LABELS[p.servicio]}</Chip>
          {p.pais && <Chip>{p.pais}</Chip>}
          {p.encargado && <Chip>{p.encargado}</Chip>}
          <span className="break-words">{p.producto}</span>
        </CardDescription>
        {tienda && (
          <CardAction>
            <a
              href={tienda}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-ring/60"
            >
              <ExternalLink className="size-3.5" /> Tienda
            </a>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className={ETIQUETA}>{p.servicio === "video" ? "Guion" : "Brief"}</span>
            {p.guion && (
              <Button variant="ghost" size="sm" onClick={copiarGuion}>
                <Copy /> Copiar
              </Button>
            )}
          </div>
          {p.guion ? (
            <pre className="max-h-[440px] overflow-y-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap">
              {p.guion}
            </pre>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
              Todavía no hay guion. Pídeselo al equipo comercial antes de empezar.
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className={ETIQUETA}>Entrega</span>
          <SubirPieza
            id={p.id}
            servicio={p.servicio}
            videoUrl={p.videoUrl}
            videoNombre={p.videoNombre}
            terminado={p.terminado}
          />
        </div>
      </CardContent>
    </Card>
  );
}
