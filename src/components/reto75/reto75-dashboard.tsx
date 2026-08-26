"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Reto75Dia } from "./reto75-grid";

const CAMPOS: { key: "dieta" | "entreno1" | "entreno2_outdoor" | "agua" | "lectura"; label: string }[] = [
  { key: "dieta", label: "Dieta" },
  { key: "entreno1", label: "Entrenamiento 1" },
  { key: "entreno2_outdoor", label: "Entrenamiento al aire libre" },
  { key: "agua", label: "Galón de agua" },
  { key: "lectura", label: "Lectura" },
];

function diaCompleto(d: Reto75Dia) {
  return d.dieta && d.entreno1 && d.entreno2_outdoor && d.agua && d.lectura;
}

function minutosDesdeMedianoche(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function fmtMinutos(min: number) {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  const ampm = h >= 12 ? "p. m." : "a. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Estabilidad de rutina: promedio de la hora a la que se marcó cada
 * regla, y qué tan disperso es ese horario (rango entre la más temprana
 * y la más tardía) — así se ve si la rutina es constante o errática, sin
 * exponer cada marca de tiempo individual en el checklist del día. */
function calcularEstabilidad(dias: Reto75Dia[], campo: (typeof CAMPOS)[number]["key"]) {
  const minutos = dias
    .map((d) => d[`${campo}_at`])
    .filter((v): v is string => !!v)
    .map(minutosDesdeMedianoche);
  if (minutos.length === 0) return null;
  const promedio = minutos.reduce((a, b) => a + b, 0) / minutos.length;
  const rango = Math.max(...minutos) - Math.min(...minutos);
  return { promedio, rango, muestras: minutos.length };
}

function estabilidadLabel(rangoMin: number) {
  if (rangoMin <= 60) return { texto: "Muy estable", color: "text-green-700 dark:text-green-400" };
  if (rangoMin <= 180) return { texto: "Algo variable", color: "text-amber-700 dark:text-amber-400" };
  return { texto: "Irregular", color: "text-red-700 dark:text-red-400" };
}

export function Reto75DashboardButton({ dias }: { dias: Reto75Dia[] }) {
  const [open, setOpen] = useState(false);
  const todayKey = new Date().toISOString().slice(0, 10);
  const diasHastaHoy = dias.filter((d) => d.fecha <= todayKey);

  const completados = diasHastaHoy.filter(diaCompleto).length;
  const tasaCumplimiento = diasHastaHoy.length > 0 ? Math.round((completados / diasHastaHoy.length) * 100) : 0;

  let rachaActual = 0;
  for (let i = diasHastaHoy.length - 1; i >= 0; i--) {
    if (diaCompleto(diasHastaHoy[i])) rachaActual++;
    else break;
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <BarChart3 className="size-3.5" />
        Dashboard
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tu dashboard del reto</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border p-3 text-center">
              <p className="text-2xl font-semibold">{rachaActual}</p>
              <p className="text-xs text-muted-foreground">racha actual</p>
            </div>
            <div className="rounded-md border p-3 text-center">
              <p className="text-2xl font-semibold">{completados}</p>
              <p className="text-xs text-muted-foreground">días 100% completos</p>
            </div>
            <div className="rounded-md border p-3 text-center">
              <p className="text-2xl font-semibold">{tasaCumplimiento}%</p>
              <p className="text-xs text-muted-foreground">cumplimiento hasta hoy</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Estabilidad de tu rutina</p>
            <p className="text-xs text-muted-foreground">
              A qué hora sueles marcar cada regla, y qué tan constante es ese horario.
            </p>
            <div className="flex flex-col gap-1.5">
              {CAMPOS.map((c) => {
                const stats = calcularEstabilidad(dias, c.key);
                if (!stats) {
                  return (
                    <div key={c.key} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span>{c.label}</span>
                      <span className="text-xs text-muted-foreground">Sin datos todavía</span>
                    </div>
                  );
                }
                const est = estabilidadLabel(stats.rango);
                return (
                  <div key={c.key} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>{c.label}</span>
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">~{fmtMinutos(stats.promedio)}</span>
                      <span className={`font-medium ${est.color}`}>{est.texto}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
