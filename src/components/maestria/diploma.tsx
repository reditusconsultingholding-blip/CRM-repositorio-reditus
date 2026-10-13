"use client";

import { Award, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// Al imprimir solo sale el diploma, sin el menú ni el resto de la página.
const SOLO_DIPLOMA = `@media print {
  body * { visibility: hidden !important; }
  #diploma, #diploma * { visibility: visible !important; }
  #diploma { position: fixed; inset: 0; margin: 0; border-radius: 0; box-shadow: none; }
  @page { size: landscape; margin: 0; }
}`;

export function Diploma({ nombre, fecha, notaExamen, promedio }: { nombre: string; fecha: string; notaExamen: number; promedio: number }) {
  const dia = new Date(fecha).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" });
  return (
    <div className="flex flex-col gap-3">
      <style>{SOLO_DIPLOMA}</style>
      <div
        id="diploma"
        className="flex flex-col items-center gap-4 rounded-2xl border-4 border-double border-[#0072ff]/60 bg-[linear-gradient(160deg,#061226,#0b2447)] px-6 py-12 text-center text-white shadow-lg"
      >
        <Award className="size-12 text-[#00c6ff]" />
        <p className="rd-etiqueta text-[11px] text-white/60">Reditus Consulting · Programa privado de negociación</p>
        <p className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Maestría en Negociación</p>
        <p className="text-sm text-white/70">Método de empatía táctica de Chris Voss</p>
        <p className="mt-4 text-sm text-white/70">Se otorga a</p>
        <p className="font-heading text-2xl font-semibold sm:text-3xl">{nombre}</p>
        <p className="max-w-xl text-sm leading-relaxed text-white/75">
          por aprobar los doce módulos del programa, demostrar dominio sostenido en prácticas de negociación en vivo y superar el examen
          final sin ayudas con una nota de {notaExamen} sobre 100.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-x-10 gap-y-2 text-xs text-white/60">
          <span>{dia}</span>
          <span>Promedio en prácticas: {promedio}</span>
          <span>Evaluado por inteligencia artificial</span>
        </div>
      </div>
      <Button variant="outline" className="self-start" onClick={() => window.print()}>
        <Printer className="size-4" /> Imprimir o guardar como PDF
      </Button>
    </div>
  );
}
