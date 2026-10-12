"use client";

import { useState } from "react";
import Link from "next/link";
import { Clapperboard, LayoutTemplate, UserRound } from "lucide-react";
import {
  CANAL_LABELS,
  ETAPAS,
  ETAPA_LABELS,
  PRODUCCION_LABELS,
  type Canal,
  type Etapa,
  type Produccion,
  type Servicio,
} from "@/lib/prospeccion";
import { cn } from "@/lib/utils";
import { Chip, ETIQUETA, Segmento } from "./piezas";

export type TarjetaProspecto = {
  id: string;
  nombre: string;
  servicio: Servicio;
  etapa: Etapa;
  producto: string;
  canal: Canal;
  produccion: Produccion;
  encargado: string | null;
  hace: string;
};

type Filtro = "todos" | Servicio;
const FILTROS: readonly Filtro[] = ["todos", "video", "landing"];
const FILTRO_LABELS: Record<Filtro, string> = { todos: "Todos", video: "Video", landing: "Landing / CRO" };

const AYUDA: Record<Etapa, string> = {
  falta_enviar_video: "Dijeron que sí. Guion, edición y envío.",
  video_enviado: "Esperando respuesta.",
  respondio: "Contestó o agendó la llamada.",
  convertido: "Ya es cliente.",
  descartado: "No siguió.",
};

const TONO_PRODUCCION: Record<Produccion, "ambar" | "azul" | "verde" | "neutro"> = {
  sin_guion: "ambar",
  sin_editor: "ambar",
  en_edicion: "azul",
  listo: "verde",
};

/** Tablero del embudo «video gratis»: una columna por etapa. */
export function TableroProspeccion({ tarjetas }: { tarjetas: TarjetaProspecto[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const visibles = filtro === "todos" ? tarjetas : tarjetas.filter((t) => t.servicio === filtro);

  return (
    <div className="flex flex-col gap-3">
      <Segmento value={filtro} onChange={setFiltro} opciones={FILTROS} etiquetas={FILTRO_LABELS} />

      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <div className="grid min-w-[1080px] grid-cols-5 gap-3">
          {ETAPAS.map((etapa, i) => {
            const lista = visibles.filter((t) => t.etapa === etapa);
            return (
              <section
                key={etapa}
                aria-label={ETAPA_LABELS[etapa]}
                className={cn(
                  "flex min-h-40 flex-col gap-2 rounded-2xl border border-border bg-card/60 p-2.5",
                  etapa === "descartado" && "opacity-80",
                )}
              >
                <header className="flex items-start justify-between gap-2 px-1 pt-0.5">
                  <div className="min-w-0">
                    <span className={cn(ETIQUETA, "text-primary")}>0{i + 1}</span>
                    <h2 className="font-heading text-sm leading-tight font-semibold">{ETAPA_LABELS[etapa]}</h2>
                    <p className="text-[11px] leading-snug text-muted-foreground">{AYUDA[etapa]}</p>
                  </div>
                  <span className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-xs tabular-nums">
                    {lista.length}
                  </span>
                </header>

                {lista.map((t) => (
                  <Link
                    key={t.id}
                    href={`/prospectos/${t.id}`}
                    className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-3 transition-colors outline-none hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-sm leading-tight font-semibold break-words group-hover:text-primary">
                        {t.nombre}
                      </span>
                      {t.servicio === "video" ? (
                        <Clapperboard className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Video" />
                      ) : (
                        <LayoutTemplate className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Landing / CRO" />
                      )}
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{t.producto}</p>
                    <div className="flex flex-wrap items-center gap-1">
                      {etapa === "falta_enviar_video" && (
                        <Chip tono={TONO_PRODUCCION[t.produccion]}>{PRODUCCION_LABELS[t.produccion]}</Chip>
                      )}
                      <Chip>{CANAL_LABELS[t.canal]}</Chip>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <UserRound className="size-3 shrink-0" />
                        <span className="truncate">{t.encargado ?? "Sin asignar"}</span>
                      </span>
                      <span className="shrink-0 font-mono">{t.hace}</span>
                    </div>
                  </Link>
                ))}

                {lista.length === 0 && (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nada aquí.</p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
