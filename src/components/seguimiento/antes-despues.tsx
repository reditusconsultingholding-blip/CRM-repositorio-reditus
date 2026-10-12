"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Maximize2, Minimize2, Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CAMPO } from "./piezas";

export type PaginaComparada = {
  id: string;
  nombre: string;
  /** Captura larga (toda la página) de cada lado. */
  antes: string;
  despues: string;
  urlAntes: string;
  urlDespues: string;
  delDia: boolean;
};

const DURACIONES = [
  { s: 12, texto: "Rápido · 12 s" },
  { s: 20, texto: "Normal · 20 s" },
  { s: 35, texto: "Lento · 35 s" },
];

/**
 * Dos capturas largas lado a lado con el desplazamiento atado: al bajar una,
 * la otra baja en la misma proporción (cada una llega al final a la vez,
 * aunque midan distinto). «Reproducir» las baja solas, para grabar la pantalla.
 */
export function AntesDespues({ paginas, inicialId }: { paginas: PaginaComparada[]; inicialId: string }) {
  const [id, setId] = useState(inicialId);
  const [duracion, setDuracion] = useState(20);
  const [andando, setAndando] = useState(false);
  const [completa, setCompleta] = useState(false);
  const [fallo, setFallo] = useState<{ antes?: boolean; despues?: boolean }>({});
  const marco = useRef<HTMLDivElement>(null);
  const izq = useRef<HTMLDivElement>(null);
  const der = useRef<HTMLDivElement>(null);
  /** Avance compartido, de 0 (arriba) a 1 (abajo). */
  const avance = useRef(0);
  /** Panel que la app acaba de mover: su evento de scroll no debe volver a mover al otro. */
  const movidos = useRef(new WeakSet<HTMLDivElement>());

  const pagina = paginas.find((p) => p.id === id) ?? paginas[0];

  const poner = useCallback((p: number, salvo?: HTMLDivElement | null) => {
    avance.current = Math.min(1, Math.max(0, p));
    for (const el of [izq.current, der.current]) {
      if (!el || el === salvo) continue;
      const max = el.scrollHeight - el.clientHeight;
      const destino = Math.round(avance.current * Math.max(0, max));
      if (Math.abs(el.scrollTop - destino) < 1) continue;
      movidos.current.add(el);
      el.scrollTop = destino;
    }
  }, []);

  function alDesplazar(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (movidos.current.has(el)) {
      movidos.current.delete(el);
      return;
    }
    const max = el.scrollHeight - el.clientHeight;
    if (max > 0) poner(el.scrollTop / max, el);
  }

  // Reproducción: baja de donde esté hasta el final a velocidad constante.
  useEffect(() => {
    if (!andando) return;
    let cuadro = 0;
    let antes = performance.now();
    const paso = (ahora: number) => {
      const dt = (ahora - antes) / 1000;
      antes = ahora;
      poner(avance.current + dt / duracion);
      if (avance.current >= 1) return void setAndando(false);
      cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [andando, duracion, poner]);

  useEffect(() => {
    const alCambiar = () => setCompleta(document.fullscreenElement === marco.current);
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);

  function elegir(nuevo: string) {
    setAndando(false);
    setFallo({});
    setId(nuevo);
    poner(0);
  }

  function reproducir() {
    if (avance.current >= 0.999) poner(0);
    setAndando(true);
  }

  async function pantallaCompleta() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await marco.current?.requestFullscreen();
    } catch {
      // El navegador no lo permite (iPhone): la vista sigue funcionando sin pantalla completa.
    }
  }

  const lados = [
    { lado: "antes" as const, rotulo: "Antes", src: pagina.antes, url: pagina.urlAntes },
    { lado: "despues" as const, rotulo: "Después · Reditus", src: pagina.despues, url: pagina.urlDespues },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select value={pagina.id} onChange={(e) => elegir(e.target.value)} aria-label="Página" className={cn(CAMPO, "sm:max-w-xs")}>
          {paginas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.delDia ? "Hoy · " : ""}
              {p.nombre}
            </option>
          ))}
        </select>
        <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} aria-label="Velocidad" className={cn(CAMPO, "sm:max-w-[11rem]")}>
          {DURACIONES.map((d) => (
            <option key={d.s} value={d.s}>
              {d.texto}
            </option>
          ))}
        </select>
      </div>

      <div ref={marco} className={cn("flex flex-col overflow-hidden rounded-xl border border-border bg-black", completa && "rounded-none border-0")}>
        <div className={cn("grid grid-cols-2 grid-rows-[minmax(0,1fr)] gap-px bg-white/20", completa ? "h-[calc(100dvh-3.5rem)]" : "h-[68dvh] min-h-80")}>
          {lados.map((l) => (
            <div key={l.lado} className="relative min-h-0 min-w-0 bg-neutral-950">
              <div ref={l.lado === "antes" ? izq : der} onScroll={alDesplazar} className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" tabIndex={0} aria-label={`${l.rotulo} de ${pagina.nombre}`}>
                {fallo[l.lado] ? (
                  <p className="p-4 text-center text-sm text-white/70">No hay captura larga de este lado. Abre la página con el enlace de abajo.</p>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={l.src}
                    src={l.src}
                    alt={`${l.rotulo} · ${pagina.nombre}`}
                    className="block w-full"
                    onLoad={() => poner(avance.current)}
                    onError={() => setFallo((f) => ({ ...f, [l.lado]: true }))}
                  />
                )}
              </div>
              <span
                className={cn(
                  "pointer-events-none absolute left-2 top-2 rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow sm:text-sm",
                  l.lado === "antes" ? "bg-black/75" : "bg-[#0068e8]",
                )}
              >
                {l.rotulo}
              </span>
            </div>
          ))}
        </div>
        <div className="flex h-14 items-center gap-2 bg-neutral-950 px-2 text-white">
          <Button type="button" size="lg" className="h-10" onClick={() => (andando ? setAndando(false) : reproducir())}>
            {andando ? <Pause /> : <Play />} {andando ? "Pausar" : "Reproducir"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 text-white hover:bg-white/10 hover:text-white"
            aria-label="Volver arriba"
            onClick={() => {
              setAndando(false);
              poner(0);
            }}
          >
            <RotateCcw />
          </Button>
          <span className="min-w-0 flex-1 truncate text-center text-xs text-white/70 sm:text-sm">{pagina.nombre}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 text-white hover:bg-white/10 hover:text-white"
            aria-label={completa ? "Salir de pantalla completa" : "Pantalla completa"}
            onClick={pantallaCompleta}
          >
            {completa ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {lados.map((l) =>
          l.url ? (
            <a key={l.lado} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              <ExternalLink className="size-3" /> Abrir la página del {l.lado === "antes" ? "antes" : "después"}
            </a>
          ) : null,
        )}
        <span className="text-muted-foreground">También puedes bajar con el dedo o la rueda: el otro lado te sigue.</span>
      </div>
    </div>
  );
}
