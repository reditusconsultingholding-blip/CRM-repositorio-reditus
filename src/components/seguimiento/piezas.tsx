import { CheckCircle2, CircleDashed, Clock3, ExternalLink, FileText, Link2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BASE_CLIPS,
  CLIPS_RESENAS,
  ZIP_RESENAS,
  esImagen,
  esVideo,
  imagenPagina,
  type Cuenta,
  type EstadoTarea,
  type Evidencia,
  type PaginaReditus,
} from "@/lib/seguimiento";

// Piezas de presentación de «Seguimiento diario»; las usan la vista de la
// persona, la de supervisión y la de la semana.

export const CAMPO =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:h-9 md:text-sm dark:bg-input/30";

const TONOS = {
  gris: "border-border bg-muted/50 text-muted-foreground",
  azul: "border-primary/30 bg-primary/10 text-primary",
  ambar: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  verde: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rojo: "border-destructive/30 bg-destructive/10 text-destructive",
} as const;

export function Chip({ tono = "gris", className, children }: { tono?: keyof typeof TONOS; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", TONOS[tono], className)}>
      {children}
    </span>
  );
}

export function ChipEstado({ estado }: { estado: EstadoTarea }) {
  if (estado === "aprobada")
    return (
      <Chip tono="verde">
        <CheckCircle2 className="size-3" /> Aprobada
      </Chip>
    );
  if (estado === "hecha")
    return (
      <Chip tono="azul">
        <Clock3 className="size-3" /> Entregada · por revisar
      </Chip>
    );
  if (estado === "devuelta")
    return (
      <Chip tono="rojo">
        <RotateCcw className="size-3" /> Devuelta
      </Chip>
    );
  return (
    <Chip>
      <CircleDashed className="size-3" /> Sin hacer
    </Chip>
  );
}

export function tonoPct(pct: number, umbral: number): keyof typeof TONOS {
  return pct >= umbral ? "verde" : pct >= umbral / 2 ? "ambar" : "rojo";
}

export function Barra({ pct, umbral, className }: { pct: number; umbral?: number; className?: string }) {
  const color = umbral == null ? "bg-primary" : pct >= umbral ? "bg-emerald-500" : pct >= umbral / 2 ? "bg-amber-500" : "bg-destructive";
  return (
    <div className={cn("relative h-2 overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export function ResumenCuenta({ c }: { c: Cuenta }) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      <span>
        <b className="font-semibold text-foreground">{c.cumplidas}</b> de {c.total} entregadas
      </span>
      <span>
        {c.aprobadas} {c.aprobadas === 1 ? "aprobada" : "aprobadas"}
      </span>
      {c.porRevisar > 0 && <span>{c.porRevisar} por revisar</span>}
      {c.devueltas > 0 && <span className="text-destructive">
          {c.devueltas} {c.devueltas === 1 ? "devuelta" : "devueltas"}
        </span>}
      <span>{c.sinHacer} sin hacer</span>
    </p>
  );
}

/** Antes y después de la página del día, con miniaturas y enlaces. */
export function PaginaDia({ pagina, compacta = false }: { pagina: PaginaReditus; compacta?: boolean }) {
  const lados = [
    { lado: "antes" as const, rotulo: "Antes", url: pagina.antes },
    { lado: "despues" as const, rotulo: "Después", url: pagina.despues },
  ];
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3">
      <p className="rd-etiqueta text-primary">Página del día</p>
      <p className="mt-0.5 font-heading text-base font-semibold leading-tight">{pagina.nombre}</p>
      <div className={cn("mt-2 grid grid-cols-2 gap-2", compacta && "max-w-xs")}>
        {lados.map((l) => (
          <figure key={l.lado} className="flex min-w-0 flex-col gap-1">
            <a
              href={imagenPagina(pagina.id, l.lado, true)}
              target="_blank"
              rel="noopener noreferrer"
              className="relative block overflow-hidden rounded-lg border border-border bg-muted"
              aria-label={`Ver completa la captura del ${l.rotulo.toLowerCase()} de ${pagina.nombre}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagenPagina(pagina.id, l.lado)}
                alt={`${l.rotulo} · ${pagina.nombre}`}
                loading="lazy"
                decoding="async"
                className={cn("w-full object-cover object-top", compacta ? "aspect-[4/5]" : "aspect-[3/4]")}
              />
              <span
                className={cn(
                  "absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white",
                  l.lado === "antes" ? "bg-black/70" : "bg-[#0068e8]",
                )}
              >
                {l.rotulo}
              </span>
            </a>
            {l.url ? (
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="size-3 shrink-0" />
                <span className="truncate">Abrir el {l.rotulo.toLowerCase()}</span>
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">Sin enlace: usa la captura</span>
            )}
          </figure>
        ))}
      </div>
      {!compacta && (
        <p className="mt-2 text-xs text-muted-foreground">
          {pagina.rotulo}. De dónde sale el antes: {pagina.nota}
        </p>
      )}
    </div>
  );
}

/** De dónde sacar las reseñas: clips publicados y el zip con todas. */
export function RecursoResenas() {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="rd-etiqueta text-muted-foreground">De dónde sacar las reseñas</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CLIPS_RESENAS.map((c) => (
          <a
            key={c}
            href={`${BASE_CLIPS}${c}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:border-primary/50 hover:text-primary"
          >
            Clip {c.replace("citas-", "").replace(".mp4", "").toUpperCase()}
          </a>
        ))}
      </div>
      <a href={ZIP_RESENAS} className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <FileText className="size-3" /> Descargar todas las reseñas (zip)
      </a>
    </div>
  );
}

export function urlEvidencia(fecha: string, userId: string, ev: Evidencia): string {
  return ev.tipo === "enlace" && ev.url ? ev.url : `/seguimiento/evidencia?f=${fecha}&u=${userId}&e=${ev.id}`;
}

/** Evidencias de una tarea. Los archivos se piden a /seguimiento/evidencia,
 * que valida el permiso y redirige a una URL firmada de pocos minutos. */
export function ListaEvidencias({
  fecha,
  userId,
  evidencias,
  accion,
}: {
  fecha: string;
  userId: string;
  evidencias: Evidencia[];
  accion?: (ev: Evidencia) => React.ReactNode;
}) {
  if (!evidencias.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {evidencias.map((ev) => {
        const url = urlEvidencia(fecha, userId, ev);
        const imagen = ev.tipo === "archivo" && esImagen(ev.nombre);
        return (
          <li key={ev.id} className="relative flex max-w-full items-center gap-2 rounded-lg border border-border bg-card p-1.5 pr-2">
            <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 text-xs hover:text-primary">
              {imagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={ev.nombre} loading="lazy" className="size-14 shrink-0 rounded-md border border-border object-cover" />
              ) : (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  {ev.tipo === "enlace" ? <Link2 className="size-4" /> : <FileText className="size-4" />}
                </span>
              )}
              <span className="min-w-0">
                <span className="block max-w-[11rem] truncate font-medium">{ev.nombre}</span>
                <span className="block text-muted-foreground">
                  {ev.tipo === "enlace" ? "Enlace" : imagen ? "Imagen" : esVideo(ev.nombre) ? "Video" : "Archivo"}
                </span>
              </span>
            </a>
            {accion?.(ev)}
          </li>
        );
      })}
    </ul>
  );
}

export function Instrucciones({ texto }: { texto: string }) {
  const lineas = texto.split("\n").filter((l) => l.trim());
  if (!lineas.length) return null;
  return (
    <div className="flex flex-col gap-1.5 text-sm leading-relaxed text-foreground/90">
      {lineas.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}
