"use client";

import { useMemo, useState } from "react";
import { Check, Clock, Sparkles } from "lucide-react";
import type { FormatoTarjeta } from "@/lib/video-formatos";
import { cn } from "@/lib/utils";
import { Chip } from "@/components/prospectos/piezas";

// Galería de formatos: los de la biblioteca a la vista, para elegir de un vistazo.
// Todo lo que se muestra sale de la ficha de cada formato (`formatos.json`): nada se inventa aquí.

export type EstiloFormato = "realista" | "animado" | "caricatura";
const ESTILO_LABELS: Record<EstiloFormato, string> = { realista: "Realista", animado: "Animado", caricatura: "Caricatura" };

/** El estilo visual, leído de la descripción del formato. */
export function estiloDeFormato(f: Pick<FormatoTarjeta, "para_que_sirve" | "nombre">): EstiloFormato {
  const t = `${f.nombre} ${f.para_que_sirve}`;
  if (/plastilina|lana|tejid|esqueleto|con cara|caricatura|stop-motion/i.test(t)) return "caricatura";
  if (/animaci[oó]n|animad|\b3D\b/i.test(t)) return "animado";
  return "realista";
}

/** Sirve para trabajar objeciones (público tibio o caliente, o la ficha lo dice). */
export function paraObjeciones(f: Pick<FormatoTarjeta, "etapa_embudo" | "cuando_si">): boolean {
  return /MOFU|BOFU/.test(f.etapa_embudo) || f.cuando_si.some((x) => /objeci|ya prob|fallaron|duda|desconf|mito|explicaci/i.test(x));
}

/** La primera frase de «para qué sirve», tal cual. */
const primeraFrase = (t: string) => {
  const limpio = t.replace(/^\(Interpretación\)\s*/i, "").trim();
  const corte = limpio.search(/\.\s/);
  return corte > 0 ? limpio.slice(0, corte + 1) : limpio;
};

type Filtro = "todos" | "realista" | "animado" | "objeciones";
const FILTROS: { clave: Filtro; nombre: string }[] = [
  { clave: "todos", nombre: "Todos" },
  { clave: "realista", nombre: "Realista" },
  { clave: "animado", nombre: "Animado" },
  { clave: "objeciones", nombre: "Para objeciones" },
];

export function GaleriaFormatos({
  formatos,
  elegido,
  recomendados,
  porque,
  titulo,
  ayuda,
  onElegir,
  disabled,
}: {
  formatos: FormatoTarjeta[];
  elegido: string;
  recomendados: string[];
  /** Por qué la investigación recomienda un formato («» si no lo dice). */
  porque: (slug: string) => string;
  titulo: string;
  ayuda: string;
  onElegir: (slug: string) => void;
  disabled?: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const ordenados = useMemo(() => {
    const visibles = formatos.filter((f) => (filtro === "todos" ? true : filtro === "objeciones" ? paraObjeciones(f) : filtro === "animado" ? estiloDeFormato(f) !== "realista" : estiloDeFormato(f) === "realista"));
    // Primero los recomendados (en su orden), luego el resto como viene en la biblioteca.
    return [...visibles].sort((a, b) => (recomendados.includes(a.slug) ? recomendados.indexOf(a.slug) : 99) - (recomendados.includes(b.slug) ? recomendados.indexOf(b.slug) : 99));
  }, [formatos, filtro, recomendados]);

  return (
    <section className="flex flex-col gap-3" id="galeria-formatos" aria-label={titulo}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-60">
          <span className="block text-base font-semibold">{titulo}</span>
          <span className="block text-sm text-muted-foreground">{ayuda}</span>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1" role="group" aria-label="Filtrar formatos">
          {FILTROS.map((x) => (
            <button
              key={x.clave}
              type="button"
              aria-pressed={filtro === x.clave}
              onClick={() => setFiltro(x.clave)}
              className={cn("rounded-md px-2.5 py-1 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50", filtro === x.clave ? "bg-primary text-primary-foreground" : "text-foreground/75 hover:bg-card")}
            >
              {x.nombre}
            </button>
          ))}
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Formatos">
        {ordenados.map((f) => {
          const activo = f.slug === elegido;
          const recomendado = recomendados.includes(f.slug);
          const motivo = recomendado ? porque(f.slug) : "";
          return (
            <li key={f.slug}>
              <button
                type="button"
                data-formato={f.slug}
                aria-pressed={activo}
                disabled={disabled}
                onClick={() => onElegir(f.slug)}
                className={cn(
                  "flex h-full w-full flex-col gap-1.5 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
                  activo ? "border-primary bg-primary/10" : recomendado ? "border-primary/40 bg-card hover:border-primary" : "border-border bg-card hover:border-ring/60",
                )}
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[15px] font-semibold">{f.nombre}</span>
                  {activo && <Check className="size-4 text-primary" aria-label="Elegido" />}
                  {recomendado && (
                    <Chip tono="azul">
                      <Sparkles className="size-3" /> Recomendado
                    </Chip>
                  )}
                  {f.estado === "por confirmar" && <Chip tono="ambar">Por confirmar</Chip>}
                </span>
                <span className="text-sm leading-snug">{primeraFrase(f.para_que_sirve)}</span>
                {motivo && <span className="text-sm leading-snug text-primary">Por qué: {motivo}</span>}
                <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
                  <span>{ESTILO_LABELS[estiloDeFormato(f)]}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" /> {f.duracion}
                  </span>
                  <span>{f.etapa_embudo}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!ordenados.length && <p className="text-sm text-muted-foreground">Ningún formato con ese filtro.</p>}
    </section>
  );
}
