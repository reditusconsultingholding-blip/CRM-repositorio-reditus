"use client";

import { useCallback, useState } from "react";
import { Check, Loader2, Pause } from "lucide-react";
import { tiempoRestante, type Progreso } from "@/lib/progreso-video";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Barra de progreso de un video: etapas, porcentaje y tiempo estimado que falta.
 * `compacta` es para listas (una línea); la completa muestra todas las etapas.
 */
export function BarraProgresoVideo({ progreso, compacta, medido }: { progreso: Progreso; compacta?: boolean; medido?: boolean }) {
  const actual = progreso.etapas.find((e) => e.estado === "en-curso" || e.estado === "detenida") ?? progreso.etapas.find((e) => e.estado === "pendiente") ?? progreso.etapas[progreso.etapas.length - 1];
  const falta = tiempoRestante(progreso.restanteSeg);
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-progreso={progreso.pct}>
      {!compacta && (
        <ol className="flex flex-wrap gap-x-1 gap-y-1" aria-label="Etapas del video">
          {progreso.etapas.map((e) => (
            <li
              key={e.clave}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                e.estado === "hecha" && "border-primary/40 bg-primary/15 text-primary",
                e.estado === "en-curso" && "border-primary bg-primary/10 text-foreground",
                e.estado === "detenida" && "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                e.estado === "pendiente" && "border-border text-muted-foreground",
              )}
            >
              {e.estado === "hecha" ? <Check className="size-3" /> : e.estado === "en-curso" ? <Loader2 className="size-3 animate-spin" /> : e.estado === "detenida" ? <Pause className="size-3" /> : null}
              {e.nombre}
            </li>
          ))}
        </ol>
      )}
      <div className="flex items-center gap-2">
        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progreso del video" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progreso.pct}>
          <div className={cn("h-full rounded-full bg-primary transition-[width] duration-700", progreso.espera && "bg-amber-500")} style={{ width: `${progreso.pct}%` }} />
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums">{progreso.pct}%</span>
      </div>
      <span className="text-xs leading-snug text-muted-foreground">
        {progreso.listo
          ? "Video armado."
          : progreso.espera
            ? `Detenido en «${actual.nombre}»: espera a una persona.${compacta ? "" : ` ${progreso.espera}`}`
            : `${actual.nombre}${falta ? ` · faltan ${falta}` : ""}${!compacta ? (medido ? " (según lo que tardaron los trabajos anteriores)" : " (estimado; se afina con los primeros videos)") : ""}`}
      </span>
    </div>
  );
}

type Pregunta = { titulo: string; texto: string; si: string; resolver: (v: boolean) => void };

/**
 * Confirmación con el diálogo del CRM (no el del navegador, que bloquea la
 * automatización y desentona). `const [confirmar, nodo] = useConfirmar()`;
 * `if (await confirmar("…")) …`, y `nodo` se pinta en el componente.
 */
export function useConfirmar(): [(texto: string, opciones?: { titulo?: string; si?: string }) => Promise<boolean>, React.ReactNode] {
  const [pregunta, setPregunta] = useState<Pregunta | null>(null);
  const confirmar = useCallback(
    (texto: string, opciones?: { titulo?: string; si?: string }) =>
      new Promise<boolean>((resolver) => setPregunta({ titulo: opciones?.titulo ?? "¿Continuar?", texto, si: opciones?.si ?? "Sí, continuar", resolver })),
    [],
  );
  const cerrar = (v: boolean) => {
    pregunta?.resolver(v);
    setPregunta(null);
  };
  const nodo = pregunta ? (
    <Dialog open onOpenChange={(abierto) => !abierto && cerrar(false)}>
      <DialogContent className="sm:max-w-md" data-confirmar>
        <DialogHeader className="pr-8">
          <DialogTitle>{pregunta.titulo}</DialogTitle>
          <DialogDescription>{pregunta.texto}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => cerrar(false)}>
            Cancelar
          </Button>
          <Button autoFocus onClick={() => cerrar(true)}>
            {pregunta.si}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;
  return [confirmar, nodo];
}
