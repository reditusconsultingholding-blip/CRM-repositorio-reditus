"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, FolderOpen, Inbox, Play, RefreshCw, X } from "lucide-react";
import { aprobarVideo } from "@/app/(protected)/videos/actions";
import { revisarPieza, seguirProyecto } from "@/app/(protected)/videos/proyecto-actions";
import { detenido, type ProyectoVideo } from "@/lib/proyecto-video";
import { versionVigente, type GuionGuardado } from "@/lib/videos";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ETIQUETA } from "@/components/prospectos/piezas";

export type Pendiente =
  | { clave: string; tipo: "imagen"; g: GuionGuardado; n: number; url: string; motivo: string; foto: string | null; voz: string }
  | { clave: string; tipo: "video"; g: GuionGuardado; version: number; url: string }
  | { clave: string; tipo: "clips"; g: GuionGuardado; cuantos: number }
  | { clave: string; tipo: "detenido"; g: GuionGuardado; texto: string };

/** Todo lo que espera a una persona, en el orden en que conviene despacharlo: lo que destraba más, primero. */
export function pendientesDe(guiones: GuionGuardado[]): Pendiente[] {
  const imagenes: Pendiente[] = [];
  const videos: Pendiente[] = [];
  const clips: Pendiente[] = [];
  const detenidos: Pendiente[] = [];
  for (const g of guiones) {
    const v = versionVigente(g);
    const p: ProyectoVideo | null | undefined = v?.proyecto;
    if (!v || !p) continue;
    for (const e of p.escenas) {
      if (e.tipo === "generada" && e.imagen.estado === "por-aprobar" && e.imagen.url) {
        imagenes.push({ clave: `i:${g.id}:${e.n}:${e.imagen.url}`, tipo: "imagen", g, n: e.n, url: e.imagen.url, motivo: e.imagen.revision?.motivo ?? "", foto: p.contexto.fotos[0] ?? null, voz: e.voz });
      }
    }
    if (p.final.estado === "por-aprobar" && p.final.url) videos.push({ clave: `v:${g.id}:${p.final.url}`, tipo: "video", g, version: v.n, url: p.final.url });
    const porRevisar = p.escenas.filter((e) => e.tipo === "generada" && e.clip.estado === "por-aprobar").length;
    if (porRevisar && !p.auto.armarDirecto && p.final.estado !== "por-aprobar") clips.push({ clave: `c:${g.id}`, tipo: "clips", g, cuantos: porRevisar });
    if (detenido(p) && p.auto.parada) detenidos.push({ clave: `d:${g.id}:${p.auto.parada.fecha}`, tipo: "detenido", g, texto: p.auto.parada.texto });
  }
  return [...imagenes, ...videos, ...clips, ...detenidos];
}

type Props = {
  guiones: GuionGuardado[];
  puedeAprobar: boolean;
  /** Un guion cambió (se aprobó algo): se actualiza en la lista sin abrirlo. */
  onActualizado: (g: GuionGuardado) => void;
  onAbrir: (g: GuionGuardado) => void;
  onRefrescar: () => Promise<void>;
};

/**
 * «Necesitan tu atención»: un solo lugar para despachar muchos proyectos
 * seguidos. Teclado: A aprueba y pasa al siguiente, R rechaza con nota,
 * S sigue (proyecto detenido), → salta, O abre el proyecto.
 */
export function BandejaAtencion({ guiones, puedeAprobar, onActualizado, onAbrir, onRefrescar }: Props) {
  const lista = useMemo(() => pendientesDe(guiones), [guiones]);
  const [abierta, setAbierta] = useState(false);
  const [saltados, setSaltados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [nota, setNota] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const cola = lista.filter((x) => !saltados.has(x.clave));
  const actual = cola[0] ?? null;
  const cuenta = (t: Pendiente["tipo"]) => lista.filter((x) => x.tipo === t).length;

  const correr = useCallback(
    async (fn: () => Promise<{ guardado: GuionGuardado } | { error: string }>, exito: string) => {
      setOcupado(true);
      const r = await fn();
      setOcupado(false);
      if ("error" in r) return void toast.error(r.error, { duration: 9000 });
      onActualizado(r.guardado);
      setNota(null);
      toast.success(exito);
    },
    [onActualizado],
  );

  const aprobar = useCallback(() => {
    if (!actual || ocupado || !puedeAprobar) return;
    if (actual.tipo === "imagen") void correr(() => revisarPieza(actual.g.id, actual.n, "imagen", "aprobar"), "Imagen aprobada: el proyecto sigue");
    else if (actual.tipo === "video") void correr(() => aprobarVideo(actual.g.id, actual.version), "Video aprobado");
  }, [actual, ocupado, puedeAprobar, correr]);
  const seguir = useCallback(() => {
    if (actual?.tipo === "detenido" && !ocupado) void correr(() => seguirProyecto(actual.g.id), "El proyecto sigue");
  }, [actual, ocupado, correr]);
  const saltar = useCallback(() => {
    if (actual) setSaltados((s) => new Set(s).add(actual.clave));
    setNota(null);
  }, [actual]);
  const abrirProyecto = useCallback(() => {
    if (!actual) return;
    setAbierta(false);
    onAbrir(actual.g);
  }, [actual, onAbrir]);

  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => {
      const en = e.target as HTMLElement | null;
      if (en && (en.tagName === "TEXTAREA" || en.tagName === "INPUT")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "a") aprobar();
      else if (k === "r" && actual?.tipo === "imagen" && puedeAprobar) setNota("");
      else if (k === "s") seguir();
      else if (k === "arrowright") saltar();
      else if (k === "o") abrirProyecto();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [abierta, actual, aprobar, seguir, saltar, abrirProyecto, puedeAprobar]);

  async function refrescar() {
    setRefrescando(true);
    await onRefrescar();
    setRefrescando(false);
    setSaltados(new Set());
  }

  return (
    <Card id="bandeja-atencion">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inbox className="size-4" /> Necesitan tu atención
          <Chip tono={lista.length ? "ambar" : "verde"}>{lista.length}</Chip>
        </CardTitle>
        <CardDescription>{lista.length ? "Lo que espera a una persona, de todos los proyectos. Despáchalo seguido, sin entrar a buscar uno por uno." : "Nada espera por ti: los proyectos siguen solos o ya están aprobados."}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" disabled={refrescando} onClick={() => void refrescar()}>
            <RefreshCw className={refrescando ? "animate-spin" : undefined} /> Actualizar
          </Button>
        </CardAction>
      </CardHeader>
      {lista.length > 0 && (
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button onClick={() => { setSaltados(new Set()); setAbierta(true); }}>
            <Play /> Despachar {lista.length}
          </Button>
          {cuenta("imagen") > 0 && <Chip tono="ambar">{cuenta("imagen")} {cuenta("imagen") === 1 ? "imagen dudosa" : "imágenes dudosas"}</Chip>}
          {cuenta("video") > 0 && <Chip tono="azul">{cuenta("video")} {cuenta("video") === 1 ? "video por aprobar" : "videos por aprobar"}</Chip>}
          {cuenta("clips") > 0 && <Chip>{cuenta("clips")} con clips por revisar</Chip>}
          {cuenta("detenido") > 0 && <Chip tono="rojo">{cuenta("detenido")} {cuenta("detenido") === 1 ? "detenido" : "detenidos"}</Chip>}
        </CardContent>
      )}

      {abierta && (
        <Dialog open onOpenChange={(a) => !a && setAbierta(false)}>
          <DialogContent className="gap-3 p-3 sm:max-w-3xl sm:p-4">
            <DialogHeader className="pr-8">
              <DialogTitle>{actual ? `${actual.g.producto}` : "Todo despachado"}</DialogTitle>
              <DialogDescription>
                {actual
                  ? `${actual.tipo === "imagen" ? `Imagen de la escena ${actual.n}` : actual.tipo === "video" ? "Video armado por aprobar" : actual.tipo === "clips" ? "Clips por revisar" : "Proyecto detenido"} · quedan ${cola.length} · ${actual.g.formatoNombre || actual.g.formato}${actual.g.cliente ? ` · ${actual.g.cliente}` : ""}`
                  : "No queda nada en la bandeja."}
              </DialogDescription>
            </DialogHeader>

            {!actual && (
              <Button className="self-start" onClick={() => setAbierta(false)}>
                Cerrar
              </Button>
            )}

            {actual?.tipo === "imagen" && (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                <div className="mx-auto flex aspect-[9/16] max-h-[55vh] w-full max-w-[15rem] items-center justify-center overflow-hidden rounded-xl border border-border bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img key={actual.url} src={actual.url} alt={`Imagen generada de la escena ${actual.n}`} className="size-full object-contain" />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  {actual.motivo ? (
                    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                      <strong className="font-medium">Por qué llegó aquí: </strong>
                      {actual.motivo}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Espera tu revisión (no pasó por la revisión automática).</p>
                  )}
                  {actual.foto && (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={actual.foto} alt="Foto real del producto" className="size-20 rounded-lg border border-border bg-card object-cover" />
                      <span className="text-xs text-muted-foreground">Foto real del producto: compara forma, color y etiqueta.</span>
                    </div>
                  )}
                  {actual.voz && (
                    <p className="text-sm">
                      <span className={`${ETIQUETA} mr-2`}>Se dice</span>«{actual.voz}»
                    </p>
                  )}
                  {nota === null ? (
                    <div className="mt-auto grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Button disabled={!puedeAprobar || ocupado} onClick={aprobar} title="Tecla A">
                        <Check /> Aprobar
                      </Button>
                      <Button variant="destructive" disabled={!puedeAprobar || ocupado} onClick={() => setNota("")} title="Tecla R">
                        <X /> Rechazar
                      </Button>
                      <Button variant="outline" disabled={ocupado} onClick={saltar} title="Tecla →">
                        <ChevronRight /> Saltar
                      </Button>
                      <Button variant="outline" onClick={abrirProyecto} title="Tecla O">
                        <FolderOpen /> Abrir
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-auto flex flex-col gap-2">
                      <Textarea autoFocus value={nota} maxLength={600} rows={3} placeholder="Qué está mal (obligatorio): con esa nota se regenera sola" aria-label="Nota del rechazo" onChange={(e) => setNota(e.target.value)} />
                      <div className="flex flex-wrap gap-2">
                        <Button variant="destructive" disabled={ocupado || !nota.trim()} onClick={() => void correr(() => revisarPieza(actual.g.id, actual.n, "imagen", "rechazar", nota), "Rechazada con nota")}>
                          Rechazar con esta nota
                        </Button>
                        <Button variant="ghost" disabled={ocupado} onClick={() => setNota(null)}>
                          Volver
                        </Button>
                      </div>
                    </div>
                  )}
                  {!puedeAprobar && <p className="text-xs text-muted-foreground">Aprueban el CEO, el gerente comercial o la directora operativa.</p>}
                </div>
              </div>
            )}

            {actual?.tipo === "video" && (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                <video key={actual.url} src={actual.url} controls autoPlay muted playsInline className="mx-auto aspect-[9/16] max-h-[55vh] w-full max-w-[15rem] rounded-xl border border-border bg-black object-contain" aria-label="Video armado" />
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-xs leading-relaxed text-muted-foreground">Míralo completo: es lo que sale hacia el cliente. Si algo está mal, ábrelo y márcalo en «Corregir»: se rehace solo esa escena.</p>
                  <div className="mt-auto grid grid-cols-3 gap-2">
                    <Button disabled={!puedeAprobar || ocupado} onClick={aprobar} title="Tecla A">
                      <Check /> Aprobar
                    </Button>
                    <Button variant="outline" disabled={ocupado} onClick={saltar} title="Tecla →">
                      <ChevronRight /> Saltar
                    </Button>
                    <Button variant="outline" onClick={abrirProyecto} title="Tecla O">
                      <FolderOpen /> Corregir
                    </Button>
                  </div>
                  {!puedeAprobar && <p className="text-xs text-muted-foreground">Lo aprueba el CEO, el gerente comercial o la directora operativa.</p>}
                </div>
              </div>
            )}

            {(actual?.tipo === "detenido" || actual?.tipo === "clips") && (
              <div className="flex flex-col gap-3">
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-relaxed">
                  {actual.tipo === "detenido" ? actual.texto : `${actual.cuantos} ${actual.cuantos === 1 ? "clip espera" : "clips esperan"} revisión en este proyecto (tiene apagado «Armar al terminar los clips»).`}
                </p>
                <div className="flex flex-wrap gap-2">
                  {actual.tipo === "detenido" && (
                    <Button disabled={ocupado} onClick={seguir} title="Tecla S">
                      <Play /> Seguir
                    </Button>
                  )}
                  <Button variant="outline" onClick={abrirProyecto} title="Tecla O">
                    <FolderOpen /> Abrir el proyecto
                  </Button>
                  <Button variant="outline" disabled={ocupado} onClick={saltar} title="Tecla →">
                    <ChevronRight /> Saltar
                  </Button>
                </div>
              </div>
            )}
            {actual && <p className="hidden text-xs text-muted-foreground sm:block">Teclado: A aprobar y pasar al siguiente · R rechazar · S seguir · → saltar · O abrir el proyecto.</p>}
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
