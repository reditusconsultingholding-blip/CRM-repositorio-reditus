"use client";

import { FolderOpen } from "lucide-react";
import { versionVigente, videoAprobado, type GuionGuardado } from "@/lib/videos";
import type { TrabajoVista } from "@/lib/trabajos-video";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/prospectos/piezas";

type Tono = "neutro" | "azul" | "ambar" | "verde" | "rojo";
export type EstadoMiVideo = { etiqueta: string; tono: Tono; detalle: string };

/** En qué va un guion, dicho en claro para quien lo pidió. */
export function estadoMiVideo(g: GuionGuardado, t: TrabajoVista | undefined): EstadoMiVideo {
  const v = versionVigente(g);
  if (v?.videoUrl && videoAprobado(v)) return { etiqueta: "Aprobado", tono: "verde", detalle: "" };
  if (v?.videoUrl) return { etiqueta: "Por aprobar", tono: "azul", detalle: "El video está listo: ábrelo y revísalo." };
  // Solo cuenta el trabajo de la versión vigente.
  if (t && v && t.version === v.n) {
    if (t.estado === "pendiente") return { etiqueta: "En cola", tono: "neutro", detalle: "El servidor lo toma en menos de un minuto." };
    if (t.estado === "fallo") return { etiqueta: "Falló", tono: "rojo", detalle: t.motivo || "El servidor no dio el motivo." };
    if (t.estado === "listo") return { etiqueta: "Por aprobar", tono: "azul", detalle: "" };
    return { etiqueta: "Generando", tono: "ambar", detalle: t.progreso?.detalle ?? "" };
  }
  return { etiqueta: "Guion listo", tono: "neutro", detalle: "Todavía no se ha pedido el video." };
}

type Props = {
  guiones: GuionGuardado[];
  trabajos: Record<string, TrabajoVista>;
  /** Lo que está en marcha ahora mismo en esta pantalla y aún no se guardó. */
  enCurso: { producto: string; etiqueta: string } | null;
  abiertoId: string | null;
  onAbrir: (g: GuionGuardado) => void;
};

/** «Mis videos»: lo que pidió esta persona, con su estado, para no tener que buscarlo. */
export function MisVideos({ guiones, trabajos, enCurso, abiertoId, onAbrir }: Props) {
  if (!guiones.length && !enCurso) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mis videos</CardTitle>
        <CardDescription>Lo último que pediste y en qué va.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1.5">
          {enCurso && (
            <li className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              <Chip tono="ambar">{enCurso.etiqueta}</Chip>
              <span className="min-w-0 truncate font-medium">{enCurso.producto || "Producto nuevo"}</span>
            </li>
          )}
          {guiones.map((g) => {
            const e = estadoMiVideo(g, trabajos[g.id]);
            return (
              <li
                key={g.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
              >
                <Chip tono={e.tono}>{e.etiqueta}</Chip>
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block truncate font-medium">{g.producto}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {g.formatoNombre || g.formato}
                    {g.cliente ? ` · ${g.cliente}` : ""}
                    {e.detalle ? ` · ${e.detalle}` : ""}
                  </span>
                </span>
                <Button variant="ghost" size="sm" disabled={g.id === abiertoId} onClick={() => onAbrir(g)}>
                  <FolderOpen /> {g.id === abiertoId ? "Abierto" : "Abrir"}
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
