"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react";
import {
  ESTADO_PIEZA_LABELS,
  NOMBRE_PASO,
  TONO_PIEZA,
  CRITERIOS_IMAGEN,
  VEREDICTO_LABELS,
  type Criterio,
  piezaEnCurso,
  type EscenaProyecto,
  type TipoPieza,
} from "@/lib/proyecto-video";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ETIQUETA, Segmento } from "@/components/prospectos/piezas";

type Props = {
  tipo: TipoPieza;
  /** Escenas generadas del proyecto, en orden. */
  escenas: EscenaProyecto[];
  /** Escena en la que se abre. */
  inicial: number;
  puedeAprobar: boolean;
  /** Intentos permitidos por escena y tipo (configuración del CEO). */
  tope: number;
  /** Hay servidor para regenerar. */
  activo: boolean;
  ocupado: boolean;
  onCerrar: () => void;
  /** Pasar de mirar la imagen a mirar el clip de la misma escena, y al revés. */
  onTipo: (tipo: TipoPieza) => void;
  onAprobar: (n: number) => Promise<boolean>;
  onRechazar: (n: number, nota: string) => Promise<boolean>;
  onRegenerar: (n: number, nota: string) => Promise<boolean>;
  onAprobarTodas: (ns: number[]) => Promise<boolean>;
};

/**
 * Revisión rápida, una pieza a la vez y en grande. Teclado: ← → para pasar,
 * A aprueba, R rechaza con nota, G regenera. En celular se desliza a los
 * lados. «Aprobar todas» solo se enciende cuando ya se vieron todas.
 */
export function RevisionPiezas({ tipo, escenas, inicial, puedeAprobar, tope, activo, ocupado, onCerrar, onTipo, onAprobar, onRechazar, onRegenerar, onAprobarTodas }: Props) {
  const lista = useMemo(() => escenas.filter((e) => e.tipo === "generada"), [escenas]);
  const [n, setN] = useState(inicial);
  const [modo, setModo] = useState<"ver" | "rechazar" | "regenerar">("ver");
  const [nota, setNota] = useState("");
  const [vistas, setVistas] = useState<Set<number>>(() => new Set([inicial]));
  const toque = useRef<number | null>(null);

  const i = Math.max(0, lista.findIndex((e) => e.n === n));
  const escena = lista[i] ?? null;
  const pieza = escena?.[tipo] ?? null;
  const porAprobar = lista.filter((e) => e[tipo].estado === "por-aprobar");
  const todasVistas = porAprobar.length > 0 && porAprobar.every((e) => vistas.has(e.n));
  const enTope = !!pieza && pieza.intentos >= tope;
  const nombre = tipo === "imagen" ? "imagen" : "clip";
  const enCurso = !!pieza && piezaEnCurso(pieza);
  // Lo mismo que encienden los botones: el teclado no abre nada que el botón tenga apagado.
  const puedeRechazar = puedeAprobar && !ocupado && !!pieza && (pieza.estado === "por-aprobar" || pieza.estado === "aprobada");
  const puedeRegenerar = activo && !ocupado && !enCurso && !enTope;

  const ir = useCallback(
    (destino: number) => {
      const e = lista[(destino + lista.length) % lista.length];
      if (!e) return;
      setN(e.n);
      setModo("ver");
      setNota("");
      setVistas((v) => new Set(v).add(e.n));
    },
    [lista],
  );

  /** Tras decidir, salta a la siguiente pieza que falte por revisar. */
  const siguientePendiente = useCallback(() => {
    const resto = [...lista.slice(i + 1), ...lista.slice(0, i)].find((e) => e[tipo].estado === "por-aprobar");
    if (resto) ir(lista.indexOf(resto));
    else setModo("ver");
  }, [lista, i, tipo, ir]);

  const aprobar = useCallback(async () => {
    if (!escena || !puedeAprobar || pieza?.estado !== "por-aprobar" || ocupado) return;
    if (await onAprobar(escena.n)) siguientePendiente();
  }, [escena, puedeAprobar, pieza, ocupado, onAprobar, siguientePendiente]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const en = e.target as HTMLElement | null;
      if (en && (en.tagName === "TEXTAREA" || en.tagName === "INPUT")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") ir(i + 1);
      else if (e.key === "ArrowLeft") ir(i - 1);
      else if (e.key.toLowerCase() === "a") void aprobar();
      else if (e.key.toLowerCase() === "r" && puedeRechazar) setModo("rechazar");
      else if (e.key.toLowerCase() === "g" && puedeRegenerar) setModo("regenerar");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [i, ir, aprobar, puedeRechazar, puedeRegenerar]);

  if (!escena || !pieza) return null;

  async function confirmar() {
    if (!escena) return;
    const ok = modo === "rechazar" ? await onRechazar(escena.n, nota) : await onRegenerar(escena.n, nota);
    if (ok) {
      setNota("");
      siguientePendiente();
    }
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="gap-3 p-3 sm:max-w-3xl sm:p-4">
        <DialogHeader className="pr-8">
          <DialogTitle>
            {tipo === "imagen" ? "Imagen base" : "Clip"} · escena {escena.n} de {escenas.length}
          </DialogTitle>
          <DialogDescription>
            Paso {escena.paso} · {NOMBRE_PASO[escena.paso]}
            {escena.titulo && escena.titulo !== NOMBRE_PASO[escena.paso] ? ` · ${escena.titulo}` : ""} · {escena.duracion} s · {i + 1} de {lista.length} generadas
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
          <div
            className="relative mx-auto w-full max-w-[17rem] touch-pan-y select-none"
            onPointerDown={(e) => {
              toque.current = e.clientX;
            }}
            onPointerUp={(e) => {
              const x0 = toque.current;
              toque.current = null;
              if (x0 === null || e.pointerType === "mouse") return;
              const dx = e.clientX - x0;
              if (Math.abs(dx) > 48) ir(dx < 0 ? i + 1 : i - 1);
            }}
          >
            <div className="flex aspect-[9/16] max-h-[58vh] w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-black">
              {pieza.url && tipo === "clip" ? (
                <video key={pieza.url} src={pieza.url} controls autoPlay loop muted playsInline className="size-full object-contain" aria-label={`Clip de la escena ${escena.n}`} />
              ) : pieza.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={pieza.url} src={pieza.url} alt={`Imagen base de la escena ${escena.n}`} className={cn("size-full object-contain", enCurso && "opacity-40")} draggable={false} />
              ) : (
                <span className="px-4 text-center text-xs text-white/70">{enCurso ? "Generando…" : "Todavía no hay " + nombre}</span>
              )}
            </div>
            <Button variant="outline" size="icon" className="absolute top-1/2 left-1 -translate-y-1/2" aria-label="Anterior" onClick={() => ir(i - 1)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon" className="absolute top-1/2 right-1 -translate-y-1/2" aria-label="Siguiente" onClick={() => ir(i + 1)}>
              <ChevronRight />
            </Button>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            {(escena.imagen.url || escena.clip.url) && (
              <Segmento
                value={tipo}
                onChange={(t) => {
                  setModo("ver");
                  setNota("");
                  onTipo(t);
                }}
                opciones={["imagen", "clip"] as const}
                etiquetas={{ imagen: "Imagen base", clip: "Clip" }}
              />
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tono={TONO_PIEZA[pieza.estado]}>{ESTADO_PIEZA_LABELS[pieza.estado]}</Chip>
              <Chip tono={enTope ? "rojo" : "neutro"}>
                Intento {pieza.intentos} de {tope}
              </Chip>
              {pieza.revisadaPor && pieza.estado !== "por-aprobar" && <span className="text-xs text-muted-foreground">por {pieza.revisadaPor}</span>}
            </div>
            {tipo === "imagen" && pieza.revision && (
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-xs" data-revision={pieza.revision.veredicto}>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Chip tono={pieza.revision.veredicto === "aprobada-auto" ? "verde" : pieza.revision.veredicto === "rechazada-auto" ? "rojo" : "ambar"}>{VEREDICTO_LABELS[pieza.revision.veredicto]}</Chip>
                  {pieza.revision.veredicto === "aprobada-auto" && pieza.estado === "aprobada" && <span className="text-muted-foreground">Puedes revertirlo: «Rechazar».</span>}
                </span>
                {pieza.revision.motivo && <span className="leading-relaxed break-words">{pieza.revision.motivo}</span>}
                {Object.keys(pieza.revision.criterios).length > 0 && (
                  <ul className="flex flex-col gap-0.5 text-muted-foreground">
                    {(Object.keys(CRITERIOS_IMAGEN) as Criterio[]).map((k) => {
                      const v = pieza.revision?.criterios[k];
                      return v ? (
                        <li key={k}>
                          {v === "ok" ? "✓" : v === "mal" ? "✗" : v === "duda" ? "?" : "–"} {CRITERIOS_IMAGEN[k]}
                        </li>
                      ) : null;
                    })}
                  </ul>
                )}
              </div>
            )}
            {pieza.nota && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs leading-relaxed break-words text-amber-700 dark:text-amber-300">
                <strong className="font-medium">{pieza.estado === "fallo" ? "Motivo del fallo: " : "Nota: "}</strong>
                {pieza.nota}
              </p>
            )}
            {escena.voz && (
              <p className="text-sm leading-relaxed">
                <span className={cn(ETIQUETA, "mr-2")}>Se dice</span>«{escena.voz}»
              </p>
            )}
            <details className="rounded-lg border border-border bg-muted/30">
              <summary className="cursor-pointer px-2 py-1.5 text-xs font-medium">Qué se pidió</summary>
              <p className="border-t border-border px-2 py-1.5 text-xs leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
                {tipo === "imagen" ? escena.promptImagen : escena.promptVideo}
              </p>
            </details>

            {modo === "ver" ? (
              <div className="mt-auto flex flex-col gap-2">
                {enTope && pieza.estado !== "aprobada" && (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs leading-relaxed text-destructive">
                    Esta escena llegó al tope de {tope} intentos de {nombre}: ya no se regenera. Apruébala, cámbiala a «Foto real animada» en el plan o pide al CEO que la reabra.
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <Button disabled={!puedeAprobar || ocupado || pieza.estado !== "por-aprobar"} onClick={() => void aprobar()} title="Tecla A">
                    <Check /> Aprobar
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={!puedeRechazar}
                    onClick={() => setModo("rechazar")}
                    title="Tecla R"
                  >
                    <X /> Rechazar
                  </Button>
                  <Button variant="outline" disabled={!puedeRegenerar} onClick={() => setModo("regenerar")} title="Tecla G">
                    <RefreshCw /> Regenerar
                  </Button>
                </div>
                {!puedeAprobar && <p className="text-xs text-muted-foreground">Aprueban el CEO, el gerente comercial o la directora operativa.</p>}
                {puedeAprobar && porAprobar.length > 1 && (
                  <Button variant="outline" disabled={!todasVistas || ocupado} onClick={() => void onAprobarTodas(porAprobar.map((e) => e.n))}>
                    <Check /> {todasVistas ? `Aprobar las ${porAprobar.length} que faltan` : `Aprobar todas: primero míralas (${porAprobar.filter((e) => vistas.has(e.n)).length} de ${porAprobar.length} vistas)`}
                  </Button>
                )}
                <p className="hidden text-xs text-muted-foreground sm:block">Teclado: ← → pasar · A aprobar · R rechazar · G regenerar.</p>
              </div>
            ) : (
              <div className="mt-auto flex flex-col gap-2">
                <Textarea
                  autoFocus
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  maxLength={600}
                  rows={3}
                  placeholder={modo === "rechazar" ? "Qué está mal (obligatorio): «el envase salió azul», «la mano tiene seis dedos»…" : "Qué debe cambiar (recomendado): se le pasa al generador"}
                  aria-label="Nota"
                />
                <p className="text-xs text-muted-foreground">
                  {modo === "rechazar"
                    ? "Queda rechazada con tu nota. No se gasta nada hasta que alguien pida regenerarla."
                    : `Se genera de nuevo SOLO ${tipo === "imagen" ? "esta imagen" : "este clip"}: intento ${pieza.intentos + 1} de ${tope}. Cuesta${tipo === "imagen" && escena.clip.url ? "; su clip actual deja de valer" : ""}.`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant={modo === "rechazar" ? "destructive" : "default"} disabled={ocupado || (modo === "rechazar" && !nota.trim())} onClick={() => void confirmar()}>
                    {modo === "rechazar" ? "Rechazar con esta nota" : "Regenerar"}
                  </Button>
                  <Button variant="ghost" disabled={ocupado} onClick={() => setModo("ver")}>
                    Volver
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
