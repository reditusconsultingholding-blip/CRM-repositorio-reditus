"use client";

import { useEffect, useState, useSyncExternalStore, type ComponentProps, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Clapperboard, Download, FileText, Film, Images, Layers, X } from "lucide-react";
import { contar, resumenProyecto, type ProyectoVideo } from "@/lib/proyecto-video";
import { versionVigente } from "@/lib/videos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProyectoVideoPanel, type PasoEstudio } from "./proyecto-video";

export type { PasoEstudio };

const PASOS: { n: PasoEstudio; nombre: string; titulo: string; bajada: string; icono: typeof FileText }[] = [
  { n: 1, nombre: "Plan", titulo: "Plan", bajada: "El plan de escenas del video: qué se dice, cuánto dura y de qué tipo es cada una.", icono: FileText },
  { n: 2, nombre: "Activos", titulo: "Activos", bajada: "Materiales base: las fotos reales del producto y su ficha.", icono: Layers },
  { n: 3, nombre: "Escenas", titulo: "Escenas", bajada: "La imagen base de cada escena: aprobar, rechazar con nota o regenerar.", icono: Images },
  { n: 4, nombre: "Video", titulo: "Video", bajada: "Clips por escena, armado y correcciones por escena.", icono: Film },
  { n: 5, nombre: "Exportar", titulo: "Exportar", bajada: "El video final: lo aprueba una persona; luego se descarga o se multiplica en variaciones.", icono: Download },
];

// El aspecto del estudio vive SOLO aquí: se redefinen las variables de color del
// CRM dentro de este contenedor (siempre oscuro, acento verde neón). El tema
// global y el menú no se tocan. Las ventanas emergentes salen del contenedor y
// conservan el aspecto del CRM.
const PIEL = {
  "--background": "#060d09",
  "--foreground": "#e9fff1",
  "--card": "#0b1710",
  "--card-foreground": "#e9fff1",
  "--popover": "#0b1710",
  "--popover-foreground": "#e9fff1",
  "--primary": "#3dff8b",
  "--primary-foreground": "#03130a",
  "--secondary": "#11241a",
  "--secondary-foreground": "#e9fff1",
  "--muted": "#0f1f17",
  "--muted-foreground": "#8fb5a0",
  "--accent": "#143524",
  "--accent-foreground": "#e9fff1",
  "--destructive": "#ff6b6b",
  "--border": "rgba(61, 255, 139, 0.16)",
  "--input": "rgba(61, 255, 139, 0.28)",
  "--ring": "#3dff8b",
  "--rd-grad-boton": "linear-gradient(180deg, #5dffa0, #22d86c)",
} as CSSProperties;

const TITULO = "font-heading font-black italic uppercase tracking-tight";

function estadoPaso(p: ProyectoVideo, n: PasoEstudio): "hecho" | "atencion" | "nada" {
  const img = contar(p, "imagen");
  const clip = contar(p, "clip");
  if (n === 1) return p.escenas.length ? "hecho" : "nada";
  if (n === 2) return p.contexto.fotos.length ? "hecho" : "atencion";
  if (n === 3) return img.porAprobar ? "atencion" : img.total === img.aprobadas ? "hecho" : "nada";
  if (n === 4) return clip.porAprobar && !p.auto.armarDirecto ? "atencion" : p.final.url ? "hecho" : "nada";
  return p.final.estado === "aprobada" ? "hecho" : p.final.estado === "por-aprobar" ? "atencion" : "nada";
}

/** El paso donde toca trabajar ahora, para abrir el estudio ahí. */
export function pasoQueToca(p: ProyectoVideo): PasoEstudio {
  const r = resumenProyecto(p);
  if (r.fase === "final" || r.fase === "aprobado") return 5;
  if (r.fase === "clips" || r.fase === "revisar-clips" || r.fase === "armar" || r.fase === "armando" || r.fase === "corregir") return 4;
  if (r.fase === "imagenes" || r.fase === "revisar-imagenes") return 3;
  return 1;
}

type Props = Omit<ComponentProps<typeof ProyectoVideoPanel>, "paso" | "onPaso"> & {
  /** Por dónde se llegó: flujo de producto o clonando un anuncio. */
  modo: "crear" | "clonar";
  onSalir: () => void;
};

function hora(iso: string) {
  return iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Bogota" }) : "";
}

/**
 * ESTUDIO DE VIDEO: el proyecto por escenas a pantalla completa, en cinco
 * pasos (Plan · Activos · Escenas · Video · Exportar). Es otra piel y otro
 * orden del mismo proyecto: no hay un sistema paralelo. En celular los pasos
 * pasan a una barra superior desplazable.
 */
export function EstudioVideo({ modo, onSalir, ...panel }: Props) {
  const proyecto = versionVigente(panel.guardado)?.proyecto as ProyectoVideo;
  const [paso, setPaso] = useState<PasoEstudio>(() => pasoQueToca(proyecto));
  const [registroAbierto, setRegistroAbierto] = useState(false);
  const actual = PASOS[paso - 1];

  // Mientras el estudio está abierto, la página de atrás no se desplaza.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);

  // En celular los pasos van en una barra desplazable: el actual queda siempre a la vista.
  useEffect(() => {
    document.querySelector('#estudio-video [aria-current="step"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [paso]);

  const registro = [...proyecto.registro].reverse();
  // Se dibuja directo en <body>: así cubre toda la pantalla aunque la página tenga contenedores con transformaciones.
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!enNavegador) return null;

  return createPortal(
    <div
      id="estudio-video"
      style={PIEL}
      className={cn(
        "dark fixed inset-0 z-[49] flex flex-col bg-background text-foreground md:flex-row",
        // El botón principal del CRM es azul con texto blanco: aquí, verde neón con texto oscuro.
        "[&_.rd-boton]:!text-[#03130a] [&_.rd-boton]:!shadow-[0_8px_26px_-12px_rgba(61,255,139,0.9)]",
        // El tema oscuro del CRM fuerza un azul en los fondos primarios: dentro del estudio son verdes.
        "[&_.bg-primary:not(.rd-boton)]:!bg-[#3dff8b] [&_.accent-primary]:!accent-[#3dff8b]",
      )}
      role="region"
      aria-label="Estudio de video"
    >
      {/* ------------------------------------------- pasos: barra lateral / barra superior en celular */}
      <nav aria-label="Pasos del estudio" className="flex shrink-0 flex-col border-b border-border bg-card md:w-60 md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 pt-3 md:pt-5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Clapperboard className="size-4" />
          </span>
          <span className={cn(TITULO, "text-base text-primary")}>Estudio de video</span>
          <Button variant="ghost" size="icon-sm" className="ml-auto md:hidden" aria-label="Salir del estudio" onClick={onSalir}>
            <X />
          </Button>
        </div>
        <div className="px-4 pt-2 pb-2 md:pt-4">
          <span className="block font-mono text-[10px] tracking-[0.2em] text-primary/80 uppercase">Trabajo activo · {modo === "clonar" ? "clonar" : "crear"}</span>
          <span className="block truncate text-sm font-semibold" title={panel.guardado.producto}>
            {panel.guardado.producto}
          </span>
        </div>
        <ol className="flex gap-1.5 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pt-2">
          {PASOS.map((x) => {
            const e = estadoPaso(proyecto, x.n);
            const activo = x.n === paso;
            return (
              <li key={x.n} className="shrink-0">
                <button
                  type="button"
                  aria-current={activo ? "step" : undefined}
                  onClick={() => setPaso(x.n)}
                  className={cn(
                    TITULO,
                    "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    activo ? "bg-primary text-primary-foreground shadow-[0_0_24px_-6px_rgba(61,255,139,0.8)]" : "text-foreground/80 hover:bg-accent",
                  )}
                >
                  <x.icono className="size-4 shrink-0" />
                  <span>
                    {x.n} {x.nombre}
                  </span>
                  {e !== "nada" && <span aria-label={e === "hecho" ? "Listo" : "Necesita atención"} className={cn("ml-auto size-2 shrink-0 rounded-full", e === "hecho" ? (activo ? "bg-primary-foreground" : "bg-primary") : "bg-amber-400")} />}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-auto hidden px-4 pb-4 md:block">
          <Button variant="outline" size="sm" className="w-full" onClick={onSalir}>
            <ArrowLeft /> Salir del estudio
          </Button>
          <span className="mt-2 block font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Reditus · producción por escenas</span>
        </div>
      </nav>

      {/* ------------------------------------------- contenido del paso */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-start gap-3 px-4 pt-4 md:px-8 md:pt-6">
          <div className="min-w-0 flex-1 basis-60">
            <h2 className={cn(TITULO, "text-2xl text-primary md:text-3xl")}>
              {String(actual.n).padStart(2, "0")} {actual.titulo}
            </h2>
            <p className="text-sm text-muted-foreground">{actual.bajada}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className={cn(TITULO, "text-xs")} disabled={paso === 1} onClick={() => setPaso((paso - 1) as PasoEstudio)}>
              <ArrowLeft /> Volver
            </Button>
            <Button className={cn(TITULO, "text-xs")} disabled={paso === 5} onClick={() => setPaso((paso + 1) as PasoEstudio)}>
              Siguiente <ArrowRight />
            </Button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8">
          <ProyectoVideoPanel {...panel} paso={paso} onPaso={setPaso} />
        </main>

        {/* ------------------------------------------- registro de actividad */}
        <footer className="shrink-0 border-t border-border bg-card">
          <button
            type="button"
            aria-expanded={registroAbierto}
            onClick={() => setRegistroAbierto((x) => !x)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left font-mono text-[11px] tracking-[0.16em] text-primary uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring md:px-8"
          >
            {registroAbierto ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
            Registro de actividad ({registro.length})
            {!registroAbierto && registro[0] && <span className="min-w-0 flex-1 truncate tracking-normal text-muted-foreground normal-case">· {registro[0].texto}</span>}
          </button>
          {registroAbierto && (
            <ol className="max-h-40 overflow-y-auto px-4 pb-3 font-mono text-[11px] leading-relaxed md:px-8" aria-label="Registro de actividad">
              {registro.length ? (
                registro.map((r, i) => (
                  <li key={`${r.fecha}-${i}`} className="flex gap-2">
                    <span className="shrink-0 text-primary/70">{hora(r.fecha)}</span>
                    <span className="min-w-0 break-words text-foreground/90">{r.texto}</span>
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">Todavía no ha pasado nada en este proyecto.</li>
              )}
            </ol>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
