import { CheckCircle2, CircleAlert, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Evaluacion } from "@/lib/negociacion";
import { cn } from "@/lib/utils";

export function tonoNota(nota: number, minima: number): string {
  return nota >= minima ? "text-emerald-600 dark:text-emerald-400" : nota >= minima - 15 ? "text-amber-600 dark:text-amber-400" : "text-destructive";
}

/** La calificación de una sesión: nota, qué falló (con la frase corregida),
 * qué salió bien y qué practicar después. */
export function ResultadoEvaluacion({
  titulo,
  evaluacion,
  minima,
  aprobado,
  graduado = false,
}: {
  titulo: string;
  evaluacion: Evaluacion;
  minima: number;
  aprobado: boolean;
  graduado?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <p className="rd-etiqueta text-[10px] text-muted-foreground">Calificación</p>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-4">
          <p className={cn("font-heading text-5xl font-semibold tabular-nums leading-none", tonoNota(evaluacion.nota, minima))}>
            {evaluacion.nota}
            <span className="text-lg font-normal text-muted-foreground">/100</span>
          </p>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {graduado ? "Aprobaste el examen final. Tu diploma ya está disponible." : aprobado ? "Aprobado" : `Todavía no: se aprueba con ${minima}`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{evaluacion.veredicto}</p>
          </div>
        </div>

        {evaluacion.fallos.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-1.5 font-heading text-sm font-semibold">
              <CircleAlert className="size-4 text-destructive" /> En qué fallaste y cómo decirlo
            </h3>
            {evaluacion.fallos.map((f, i) => (
              <div key={i} className="rounded-xl border px-3 py-2.5 text-sm">
                <p className="text-muted-foreground">
                  Dijiste: <span className="italic text-foreground">«{f.dijiste}»</span>
                </p>
                <p className="mt-1">{f.problema}</p>
                <p className="mt-1.5 rounded-md bg-emerald-500/10 px-2 py-1.5 text-emerald-900 dark:text-emerald-200">
                  <span className="font-medium">Mejor:</span> «{f.mejor}»
                </p>
              </div>
            ))}
          </section>
        )}

        {evaluacion.tecnicas.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="font-heading text-sm font-semibold">Técnica por técnica</h3>
            <ul className="flex flex-col divide-y rounded-xl border">
              {evaluacion.tecnicas.map((t, i) => (
                <li key={i} className="flex items-start gap-3 px-3 py-2 text-sm">
                  <span className={cn("w-9 shrink-0 font-heading text-base font-semibold tabular-nums", tonoNota(t.nota, minima))}>{t.nota}</span>
                  <span className="min-w-0">
                    <span className="block font-medium">{t.nombre}</span>
                    <span className="block text-muted-foreground">{t.comentario}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {evaluacion.aciertos.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="flex items-center gap-1.5 font-heading text-sm font-semibold">
              <CheckCircle2 className="size-4 text-emerald-600" /> Lo que hiciste bien
            </h3>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {evaluacion.aciertos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </section>
        )}

        {evaluacion.siguiente_paso && (
          <p className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
            <Target className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <span className="font-medium">Para la próxima:</span> {evaluacion.siguiente_paso}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
