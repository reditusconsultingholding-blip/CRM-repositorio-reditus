"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Download, FileText, Film, Images, Layers } from "lucide-react";
import { tiemposVideo } from "@/app/(protected)/videos/proyecto-actions";
import { contar, resumenProyecto, type ProyectoVideo } from "@/lib/proyecto-video";
import { TIEMPOS_BASE, progresoDeVideo, type TiemposVideo } from "@/lib/progreso-video";
import { versionVigente } from "@/lib/videos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/prospectos/piezas";
import { BarraProgresoVideo } from "./progreso-video";
import { ProyectoVideoPanel, type PasoEstudio } from "./proyecto-video";

export type { PasoEstudio };

const PASOS: { n: PasoEstudio; nombre: string; aqui: string; sigue: string; icono: typeof FileText }[] = [
  { n: 1, nombre: "Plan", aqui: "Revisas las escenas del video: qué se dice en cada una, cuánto dura y si es generada o foto real.", sigue: "Sigue: confirmar las fotos del producto.", icono: FileText },
  { n: 2, nombre: "Fotos", aqui: "Compruebas las fotos reales del producto y su ficha: de ahí sale el producto idéntico.", sigue: "Sigue: las imágenes de cada escena.", icono: Layers },
  { n: 3, nombre: "Imágenes", aqui: "Miras la imagen de cada escena: la apruebas, o la rechazas diciendo qué está mal.", sigue: "Sigue: los clips de video de las imágenes aprobadas.", icono: Images },
  { n: 4, nombre: "Video", aqui: "Miras los clips, se arma el video y corriges solo la escena que haga falta.", sigue: "Sigue: aprobar y descargar el video final.", icono: Film },
  { n: 5, nombre: "Entrega", aqui: "Ves el video final, lo apruebas, lo descargas y dejas tu retroalimentación.", sigue: "Con el video aprobado puedes crear variaciones.", icono: Download },
];

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
  /** Volver a la lista de proyectos. */
  onCambiar: () => void;
};

function hora(iso: string) {
  return iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }) : "";
}

/**
 * ESTUDIO DE VIDEO: el proyecto por escenas, dentro del CRM (el menú y la barra
 * superior siguen a la vista). Cinco pasos como pestañas arriba del contenido;
 * cada paso muestra solo lo suyo, con el estado en una frase y la barra de avance.
 */
export function EstudioVideo({ modo, onCambiar, ...panel }: Props) {
  const proyecto = versionVigente(panel.guardado)?.proyecto as ProyectoVideo;
  const [paso, setPaso] = useState<PasoEstudio>(() => pasoQueToca(proyecto));
  const [registroAbierto, setRegistroAbierto] = useState(false);
  const [tiempos, setTiempos] = useState<TiemposVideo>(TIEMPOS_BASE);
  const actual = PASOS[paso - 1];
  const resumen = useMemo(() => resumenProyecto(proyecto), [proyecto]);
  const progreso = useMemo(() => progresoDeVideo(proyecto, tiempos), [proyecto, tiempos]);

  useEffect(() => {
    let vivo = true;
    void tiemposVideo().then((t) => {
      if (vivo) setTiempos(t);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // En celular los pasos van en una barra desplazable: el actual queda siempre a la vista.
  useEffect(() => {
    document.querySelector('#estudio-video [aria-current="step"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [paso]);

  const registro = [...proyecto.registro].reverse();

  return (
    <div id="estudio-video" className="flex flex-col gap-4" role="region" aria-label="Estudio de video">
      {/* ------------------------------------------- qué video es y cómo va */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 basis-60">
            <span className="block text-sm text-muted-foreground">Estudio de video · {modo === "clonar" ? "video clonado" : "video nuevo"}</span>
            <h2 className="truncate font-heading text-xl font-semibold tracking-tight" title={panel.guardado.producto}>
              {panel.guardado.producto}
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={onCambiar}>
            <ArrowLeft /> Otros videos
          </Button>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-[15px] leading-snug" role="status" aria-live="polite" data-estado-estudio>
          <Chip tono={resumen.tono}>{resumen.etiqueta}</Chip>
          <span className="min-w-0 flex-1 basis-56">{resumen.detalle || "Todo al día."}</span>
        </p>
        <BarraProgresoVideo progreso={progreso} medido={tiempos.medidos} />
      </div>

      {/* ------------------------------------------- los cinco pasos */}
      <nav aria-label="Pasos del estudio">
        <ol className="flex gap-1.5 overflow-x-auto rounded-2xl border border-border bg-muted/40 p-1.5">
          {PASOS.map((x) => {
            const e = estadoPaso(proyecto, x.n);
            const activo = x.n === paso;
            return (
              <li key={x.n} className="min-w-fit flex-1">
                <button
                  type="button"
                  aria-current={activo ? "step" : undefined}
                  onClick={() => setPaso(x.n)}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    activo ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-card",
                  )}
                >
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs", activo ? "bg-white/20" : "bg-card")}>{x.n}</span>
                  <x.icono className="hidden size-4 shrink-0 sm:block" />
                  {x.nombre}
                  {e !== "nada" && !activo && <span aria-label={e === "hecho" ? "Listo" : "Necesita atención"} className={cn("size-2 shrink-0 rounded-full", e === "hecho" ? "bg-emerald-500" : "bg-amber-500")} />}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ------------------------------------------- el paso */}
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4" aria-labelledby="titulo-paso">
        <header className="flex flex-wrap items-start gap-3 border-b border-border pb-3">
          <div className="min-w-0 flex-1 basis-64">
            <span className="block text-sm font-medium text-primary">Paso {actual.n} de 5</span>
            <h3 id="titulo-paso" className="font-heading text-2xl font-semibold tracking-tight">
              {actual.nombre}
            </h3>
            <p className="mt-1 text-[15px] leading-relaxed">{actual.aqui}</p>
            <p className="text-sm text-muted-foreground">{actual.sigue}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={paso === 1} onClick={() => setPaso((paso - 1) as PasoEstudio)}>
              <ArrowLeft /> Anterior
            </Button>
            <Button variant="outline" disabled={paso === 5} onClick={() => setPaso((paso + 1) as PasoEstudio)}>
              Siguiente <ArrowRight />
            </Button>
          </div>
        </header>
        <ProyectoVideoPanel {...panel} paso={paso} onPaso={setPaso} />
      </section>

      {/* ------------------------------------------- qué ha pasado */}
      <div className="rounded-2xl border border-border bg-card">
        <button
          type="button"
          aria-expanded={registroAbierto}
          onClick={() => setRegistroAbierto((x) => !x)}
          className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {registroAbierto ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          Qué ha pasado en este video ({registro.length})
          {!registroAbierto && registro[0] && <span className="min-w-0 flex-1 truncate font-normal text-muted-foreground">· {registro[0].texto}</span>}
        </button>
        {registroAbierto && (
          <ol className="max-h-64 overflow-y-auto px-4 pb-3 text-sm leading-relaxed" aria-label="Registro de actividad">
            {registro.length ? (
              registro.map((r, i) => (
                <li key={`${r.fecha}-${i}`} className="flex gap-2 border-t border-border py-1.5">
                  <span className="w-28 shrink-0 text-muted-foreground">{hora(r.fecha)}</span>
                  <span className="min-w-0 break-words">{r.texto}</span>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">Todavía no ha pasado nada en este video.</li>
            )}
          </ol>
        )}
      </div>
    </div>
  );
}
