"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roles";
import { contar, horaBogota, type DiaVista, type TareaVista } from "@/lib/seguimiento";
import { revisarTarea } from "@/app/(protected)/seguimiento/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Barra, Chip, ChipEstado, ListaEvidencias, PaginaDia, ResumenCuenta } from "./piezas";

/** Lo entregado por cada persona en un día, con su evidencia, para aprobar
 * o devolver con nota. Lo devuelto le vuelve a quedar pendiente a la persona. */
export function Supervision({ dias }: { dias: DiaVista[] }) {
  if (!dias.length) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">No hay nadie con secuencia asignada para revisar.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {dias.map((dia) => (
        <PersonaDia key={dia.userId} dia={dia} />
      ))}
    </div>
  );
}

function PersonaDia({ dia }: { dia: DiaVista }) {
  const c = contar(dia.tareas);
  return (
    <section className="flex flex-col gap-3" aria-label={`Entregas de ${dia.nombre}`}>
      <Card className="border-primary/40">
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="font-heading text-lg font-semibold leading-tight">{dia.nombre}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABELS[dia.rol]}</p>
            </div>
            <p className="font-heading text-2xl font-semibold tabular-nums">{c.pct} %</p>
          </div>
          <Barra pct={c.pct} />
          <ResumenCuenta c={c} />
          {!dia.conRegistro && <p className="text-xs text-amber-700 dark:text-amber-300">Sin registro: no ha abierto ni entregado nada este día.</p>}
          {dia.pagina && dia.tareas.some((x) => x.paginaDelDia) && <PaginaDia pagina={dia.pagina} compacta />}
        </CardContent>
      </Card>
      {dia.tareas.length === 0 && <p className="pl-1 text-sm text-muted-foreground">Este día no tenía tareas.</p>}
      {dia.tareas.map((tarea, i) => (
        <TareaRevisable key={tarea.id} dia={dia} tarea={tarea} numero={i + 1} />
      ))}
    </section>
  );
}

function TareaRevisable({ dia, tarea, numero }: { dia: DiaVista; tarea: TareaVista; numero: number }) {
  const [devolviendo, setDevolviendo] = useState(false);
  const [nota, setNota] = useState("");
  const [pending, startTransition] = useTransition();
  const entregada = tarea.entrega.hecha;

  function revisar(veredicto: "aprobada" | "devuelta") {
    startTransition(async () => {
      const r = await revisarTarea({ userId: dia.userId, fecha: dia.fecha, tareaId: tarea.id, veredicto, nota: veredicto === "devuelta" ? nota : "" });
      if (r.error) toast.error(r.error);
      else {
        toast.success(veredicto === "aprobada" ? "Aprobada" : "Devuelta: ya se le avisó");
        setDevolviendo(false);
        setNota("");
      }
    });
  }

  return (
    <Card className={tarea.estado === "devuelta" ? "border-destructive/40" : tarea.estado === "aprobada" ? "border-emerald-500/40" : undefined}>
      <CardContent className="flex flex-col gap-2.5">
        <div className="flex items-start gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-heading text-xs font-semibold">{numero}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug">{tarea.titulo}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <ChipEstado estado={tarea.estado} />
              <Chip>{tarea.bloque}</Chip>
              {tarea.evidencia && (
                <Chip tono={tarea.entrega.evidencias.length >= tarea.cantidad ? "verde" : "ambar"}>
                  {tarea.entrega.evidencias.length} de {tarea.cantidad} {tarea.cantidad === 1 ? "evidencia" : "evidencias"}
                </Chip>
              )}
              {tarea.opcional && <Chip>No cuenta para el %</Chip>}
              {tarea.entrega.hechaEn && <span className="text-xs text-muted-foreground">Entregada {horaBogota(tarea.entrega.hechaEn)}</span>}
            </div>
          </div>
        </div>

        <ListaEvidencias fecha={dia.fecha} userId={dia.userId} evidencias={tarea.entrega.evidencias} />
        {tarea.entrega.nota && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Nota de {dia.nombre.split(" ")[0]}: </span>
            {tarea.entrega.nota}
          </p>
        )}
        {tarea.revision && (tarea.estado === "aprobada" || tarea.estado === "devuelta") && (
          <p className="text-xs text-muted-foreground">
            {tarea.revision.veredicto === "aprobada" ? "Aprobó" : "Devolvió"} {tarea.revision.porNombre.split(" ")[0]} · {horaBogota(tarea.revision.en)}
            {tarea.revision.nota ? ` · «${tarea.revision.nota}»` : ""}
          </p>
        )}

        {entregada ? (
          devolviendo ? (
            <div className="flex flex-col gap-2">
              <Textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                maxLength={600}
                autoFocus
                placeholder="Qué debe corregir (ejemplo: falta el sticker del enlace en la historia final)"
                aria-label="Nota de la devolución"
              />
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button type="button" variant="destructive" size="lg" className="h-11 sm:h-9" disabled={pending || nota.trim().length < 4} onClick={() => revisar("devuelta")}>
                  <RotateCcw /> {pending ? "Enviando…" : "Devolver"}
                </Button>
                <Button type="button" variant="ghost" size="lg" className="h-11 sm:h-9" disabled={pending} onClick={() => setDevolviendo(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {tarea.estado !== "aprobada" && (
                <Button type="button" size="lg" className="h-11 sm:h-9" disabled={pending} onClick={() => revisar("aprobada")}>
                  <CheckCircle2 /> {pending ? "Guardando…" : "Aprobar"}
                </Button>
              )}
              {tarea.estado !== "devuelta" && (
                <Button type="button" variant="outline" size="lg" className="h-11 sm:h-9" disabled={pending} onClick={() => setDevolviendo(true)}>
                  <RotateCcw /> Devolver con nota
                </Button>
              )}
            </div>
          )
        ) : (
          tarea.estado !== "devuelta" && <p className="text-xs text-muted-foreground">Sin entregar: todavía no hay nada que revisar.</p>
        )}
      </CardContent>
    </Card>
  );
}
