"use client";

import { useEffect, useMemo, useState } from "react";
import { Clapperboard, FolderOpen, ScanSearch } from "lucide-react";
import { tiemposVideo } from "@/app/(protected)/videos/proyecto-actions";
import { resumenProyecto, type ProyectoVideo } from "@/lib/proyecto-video";
import { TIEMPOS_BASE, progresoDeVideo, type TiemposVideo } from "@/lib/progreso-video";
import { versionVigente, type GuionGuardado } from "@/lib/videos";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/prospectos/piezas";
import { BarraProgresoVideo } from "./progreso-video";

/** Los tiempos medidos, pedidos una sola vez por pantalla. */
export function useTiemposVideo(): TiemposVideo {
  const [t, setT] = useState<TiemposVideo>(TIEMPOS_BASE);
  useEffect(() => {
    let vivo = true;
    void tiemposVideo().then((x) => {
      if (vivo) setT(x);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return t;
}

/**
 * «Estudio de video» sin un video abierto: la lista de videos por escenas para
 * elegir uno (con su barra de avance), o empezar uno nuevo.
 */
export function ListaProyectos({ guiones, abiertoId, onAbrir, onCrear, onClonar }: { guiones: GuionGuardado[]; abiertoId: string | null; onAbrir: (g: GuionGuardado) => void; onCrear: () => void; onClonar: () => void }) {
  const tiempos = useTiemposVideo();
  const proyectos = useMemo(() => guiones.flatMap((g) => (versionVigente(g)?.proyecto ? [{ g, p: versionVigente(g)?.proyecto as ProyectoVideo }] : [])), [guiones]);
  return (
    <div className="flex flex-col gap-4" id="lista-proyectos">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 basis-64 text-[15px] leading-relaxed">Elige un video para revisarlo, aprobarlo o corregirlo. Si todavía no existe, empieza uno.</p>
        <Button onClick={onCrear}>
          <Clapperboard /> Crear video
        </Button>
        <Button variant="outline" onClick={onClonar}>
          <ScanSearch /> Clonar video
        </Button>
      </div>
      {proyectos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-[15px] text-muted-foreground">Todavía no hay videos por escenas. Empieza con «Crear video» o «Clonar video».</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {proyectos.map(({ g, p }) => {
            const r = resumenProyecto(p);
            return (
              <li key={g.id} data-proyecto={g.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold" title={g.producto}>
                      {g.producto}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {g.formatoNombre || g.formato}
                      {g.cliente ? ` · ${g.cliente}` : ""}
                    </span>
                  </div>
                  <Chip tono={r.tono}>{r.etiqueta}</Chip>
                </div>
                <BarraProgresoVideo progreso={progresoDeVideo(p, tiempos)} compacta />
                <Button variant={g.id === abiertoId ? "default" : "outline"} className="self-start" onClick={() => onAbrir(g)}>
                  <FolderOpen /> {g.id === abiertoId ? "Seguir con este video" : "Abrir"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
