"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2, Undo2 } from "lucide-react";
import {
  LOCUCIONES,
  LOCUCION_LABELS,
  TONOS_MUSICA,
  TONO_MUSICA_LABELS,
  contarPalabras,
  palabrasQueCaben,
  type Locucion,
  type TonoMusica,
  type VozProyecto,
  MAX_ESCENAS_PROYECTO,
  MOVIMIENTOS,
  MOVIMIENTO_LABELS,
  NOMBRE_PASO,
  TIPOS_ESCENA,
  TIPO_ESCENA_LABELS,
  estimado,
  piezaNueva,
  type EscenaProyecto,
  type Movimiento,
  type OpcionesProyecto,
  type ProyectoVideo,
  type TipoEscena,
} from "@/lib/proyecto-video";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ETIQUETA } from "@/components/prospectos/piezas";

const PASOS = ["1", "2", "3", "4", "5"] as const;
const ITEMS_PASO = Object.fromEntries(PASOS.map((p) => [p, `${p} · ${NOMBRE_PASO[Number(p)]}`]));
const TIPO_CORTO: Record<TipoEscena, string> = { generada: "IA", "foto-real": "Foto real", cierre: "Cierre" };

/** Una escena en edición. `clave` la identifica en pantalla; `n` es su número guardado (0 si es nueva). */
type Borrador = EscenaProyecto & { clave: string };

const aBorrador = (e: EscenaProyecto[]): Borrador[] => e.map((x) => ({ ...x, clave: `g${x.n}` }));
const editable = (l: EscenaProyecto[]) => JSON.stringify(l.map((e) => [e.n, e.paso, e.tipo, e.titulo, e.duracion, e.voz, e.locucion, e.promptImagen, e.promptVideo, e.fotoUrl, e.movimiento]));

type Props = {
  proyecto: ProyectoVideo;
  /** Hay algo generándose: el plan no se toca hasta que termine. */
  bloqueado: boolean;
  ocupado: boolean;
  onGuardar: (escenas: EscenaProyecto[], opciones: OpcionesProyecto, extra: { vozProyecto: VozProyecto; tonoMusica: TonoMusica }) => Promise<boolean>;
  onRehacer: () => void;
};

/**
 * Plan de escenas editable: qué se dice, cuánto dura, de qué tipo es cada una
 * (generada, foto real animada o cierre), qué foto usa y en qué orden van. El
 * estimado de lo que se va a generar se recalcula mientras se edita.
 */
export function PlanEscenas({ proyecto, bloqueado, ocupado, onGuardar, onRehacer }: Props) {
  const [escenas, setEscenas] = useState<Borrador[]>(() => aBorrador(proyecto.escenas));
  const [opciones, setOpciones] = useState<OpcionesProyecto>(proyecto.opciones);
  const [vozP, setVozP] = useState<VozProyecto>(proyecto.contexto.voz);
  const [tono, setTono] = useState<TonoMusica>(proyecto.tonoMusica);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nuevas, setNuevas] = useState(0);
  // «Sucio» mira solo lo que se edita aquí; las piezas (imagen, clip) cambian solas al llegar.
  const sucio = useMemo(
    () =>
      editable(escenas) !== editable(proyecto.escenas) ||
      JSON.stringify(opciones) !== JSON.stringify(proyecto.opciones) ||
      JSON.stringify(vozP) !== JSON.stringify(proyecto.contexto.voz) ||
      tono !== proyecto.tonoMusica,
    [escenas, opciones, vozP, tono, proyecto.escenas, proyecto.opciones, proyecto.contexto.voz, proyecto.tonoMusica],
  );
  // Llegó o se aprobó una pieza: si no hay edición a medias, el borrador se pone al día.
  // (Tras guardar, quien usa este componente lo vuelve a montar con otra `key`.)
  const firma = JSON.stringify(proyecto.escenas);
  const [vista, setVista] = useState(firma);
  if (vista !== firma) {
    setVista(firma);
    if (!sucio) setEscenas(aBorrador(proyecto.escenas));
  }

  const fotos = proyecto.contexto.fotos;
  const est = estimado({ escenas });
  const quieto = bloqueado || ocupado;
  const total = escenas.reduce((s, e) => s + e.duracion, 0);

  const cambiar = (clave: string, cambio: Partial<EscenaProyecto>) => setEscenas((l) => l.map((e) => (e.clave === clave ? { ...e, ...cambio } : e)));
  const mover = (i: number, d: -1 | 1) =>
    setEscenas((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  function cambiarTipo(e: Borrador, tipo: TipoEscena) {
    cambiar(e.clave, {
      tipo,
      fotoUrl: tipo === "generada" ? e.fotoUrl : (e.fotoUrl ?? fotos[0] ?? null),
      paso: tipo === "cierre" ? 5 : e.paso,
      duracion: tipo === "cierre" ? Math.max(5, e.duracion) : e.duracion,
    });
  }

  function agregar() {
    const clave = `n${nuevas}`;
    setNuevas((x) => x + 1);
    setEscenas((l) => {
      const nueva: Borrador = {
        clave,
        n: 0,
        paso: 4,
        tipo: "foto-real",
        titulo: "Producto",
        duracion: 3,
        voz: "",
        locucion: "texto",
        promptImagen: "",
        promptVideo: "",
        fotoUrl: fotos[0] ?? null,
        movimiento: "acercar",
        imagen: piezaNueva(),
        clip: piezaNueva(),
      };
      // Antes del cierre, que siempre va al final.
      const corte = l.findIndex((x) => x.tipo === "cierre");
      return corte < 0 ? [...l, nueva] : [...l.slice(0, corte), nueva, ...l.slice(corte)];
    });
    setAbierta(clave);
  }

  async function guardar() {
    await onGuardar(
      escenas.map((e) => {
        const copia: Partial<Borrador> = { ...e };
        delete copia.clave;
        return copia as EscenaProyecto;
      }),
      opciones,
      { vozProyecto: vozP, tonoMusica: tono },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tono={proyecto.origenPlan === "ia" ? "azul" : "ambar"}>{proyecto.origenPlan === "ia" ? "Plan propuesto por IA" : "Plan de plantilla (sin IA)"}</Chip>
        <Chip>
          {escenas.length} escenas · {total} s
        </Chip>
        <Chip tono={est.clips ? "ambar" : "verde"}>
          Por generar: {est.imagenes} {est.imagenes === 1 ? "imagen" : "imágenes"} y {est.clips} {est.clips === 1 ? "clip" : "clips"} ({est.segundos} s)
        </Chip>
        <Chip tono="verde">{est.sinCosto} con foto real: no cuestan</Chip>
      </div>
      {bloqueado && <p className="text-xs text-amber-700 dark:text-amber-300">Hay piezas generándose: el plan se puede editar cuando terminen.</p>}

      <ol className="flex flex-col gap-2">
        {escenas.map((e, i) => {
          const abiertaEsta = abierta === e.clave;
          const esCierre = e.tipo === "cierre";
          return (
            <li key={e.clave} className={cn("rounded-xl border bg-card", abiertaEsta ? "border-primary/50" : "border-border")}>
              <div className="flex items-center gap-2 px-2 py-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-semibold text-primary">{i + 1}</span>
                <button type="button" className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left outline-none focus-visible:underline" aria-expanded={abiertaEsta} onClick={() => setAbierta(abiertaEsta ? null : e.clave)}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{e.titulo || NOMBRE_PASO[e.paso]}</span>
                    <Chip tono={e.tipo === "generada" ? "ambar" : "verde"}>{TIPO_CORTO[e.tipo]}</Chip>
                    <span className="font-mono text-xs text-muted-foreground">
                      paso {e.paso} · {e.duracion} s
                    </span>
                  </span>
                  <span className="line-clamp-1 w-full text-xs text-muted-foreground">{e.voz ? `«${e.voz}»` : "Sin voz"}</span>
                </button>
                <Button variant="ghost" size="icon-sm" aria-label={`Subir la escena ${i + 1}`} disabled={quieto || i === 0 || esCierre} onClick={() => mover(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Bajar la escena ${i + 1}`} disabled={quieto || i >= escenas.length - 2 || esCierre} onClick={() => mover(i, 1)}>
                  <ArrowDown />
                </Button>
              </div>
              {abiertaEsta && (
                <div className="flex flex-col gap-3 border-t border-border p-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Label className="flex flex-col items-stretch gap-1.5">
                      <span>Nombre</span>
                      <Input value={e.titulo} maxLength={80} disabled={quieto} onChange={(ev) => cambiar(e.clave, { titulo: ev.target.value })} />
                    </Label>
                    <Label className="flex flex-col items-stretch gap-1.5">
                      <span>Tipo</span>
                      <Select items={TIPO_ESCENA_LABELS} value={e.tipo} disabled={quieto || esCierre} onValueChange={(v) => v && cambiarTipo(e, v as TipoEscena)}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIPOS_ESCENA.filter((t) => t !== "cierre" || esCierre).map((t) => (
                            <SelectItem key={t} value={t}>
                              {TIPO_ESCENA_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Label>
                    <Label className="flex flex-col items-stretch gap-1.5">
                      <span>Paso de la estructura</span>
                      <Select items={ITEMS_PASO} value={String(e.paso)} disabled={quieto || esCierre} onValueChange={(v) => v && cambiar(e.clave, { paso: Number(v) })}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PASOS.map((p) => (
                            <SelectItem key={p} value={p}>
                              {ITEMS_PASO[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Label>
                    <Label className="flex flex-col items-stretch gap-1.5">
                      <span>Duración (s)</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={esCierre ? 5 : 2}
                        max={15}
                        value={e.duracion}
                        disabled={quieto}
                        onChange={(ev) => cambiar(e.clave, { duracion: Math.min(15, Math.max(1, Math.round(Number(ev.target.value) || 0))) })}
                      />
                    </Label>
                  </div>
                  <Label className="flex flex-col items-stretch gap-1.5">
                    <span>Lo que se dice en esta escena</span>
                    <Textarea value={e.voz} maxLength={1200} rows={2} disabled={quieto} onChange={(ev) => cambiar(e.clave, { voz: ev.target.value })} />
                    {e.tipo === "generada" && vozP.motor === "clip" ? (
                      <span className={cn("text-xs font-normal", contarPalabras(e.voz) > palabrasQueCaben(e.duracion) ? "text-destructive" : "text-muted-foreground")} data-palabras>
                        {contarPalabras(e.voz)} de {palabrasQueCaben(e.duracion)} palabras que caben en {e.duracion} s. La voz sale del propio clip: cambiar esta frase después obliga a regenerar el clip.
                      </span>
                    ) : (
                      <span className="text-xs font-normal text-muted-foreground">{e.tipo === "generada" ? "Narración aparte: cambiar el texto solo obliga a armar de nuevo." : "Una foto animada no habla: esta frase va escrita en pantalla (subtítulo)."}</span>
                    )}
                  </Label>
                  {e.tipo === "generada" && (
                    <Label className="flex flex-col items-stretch gap-1.5 sm:max-w-xs">
                      <span>Quién la dice</span>
                      <Select items={LOCUCION_LABELS} value={e.locucion} disabled={quieto} onValueChange={(v) => v && cambiar(e.clave, { locucion: v as Locucion })}>
                        <SelectTrigger className="w-full" aria-label={`Quién habla en la escena ${i + 1}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LOCUCIONES.filter((l) => l !== "texto").map((l) => (
                            <SelectItem key={l} value={l}>
                              {LOCUCION_LABELS[l]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Label>
                  )}

                  {e.tipo === "generada" ? (
                    <details className="rounded-lg border border-border bg-muted/30" data-avanzado-escena>
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Avanzado: instrucciones para generar esta escena</summary>
                    <div className="grid gap-3 border-t border-border p-3 md:grid-cols-2">
                      <Label className="flex flex-col items-stretch gap-1.5">
                        <span>Cómo debe verse la imagen</span>
                        <Textarea value={e.promptImagen} maxLength={4000} rows={5} disabled={quieto} className="max-h-60 text-xs" onChange={(ev) => cambiar(e.clave, { promptImagen: ev.target.value })} />
                      </Label>
                      <Label className="flex flex-col items-stretch gap-1.5">
                        <span>Qué se mueve en el clip</span>
                        <Textarea value={e.promptVideo} maxLength={4000} rows={5} disabled={quieto} className="max-h-60 text-xs" onChange={(ev) => cambiar(e.clave, { promptVideo: ev.target.value })} />
                      </Label>
                      {(e.imagen.url || e.clip.url) && (
                        <p className="text-xs text-muted-foreground md:col-span-2">
                          Esta escena ya tiene piezas generadas. Cambiar estas instrucciones no las cambia: hay que regenerarlas (cuenta como intento).
                        </p>
                      )}
                    </div>
                    </details>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-sm leading-none font-medium">Foto real que se anima</span>
                        {fotos.length ? (
                          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Foto de la escena">
                            {fotos.map((u, k) => (
                              <button
                                key={u}
                                type="button"
                                role="radio"
                                aria-checked={e.fotoUrl === u}
                                aria-label={`Foto ${k + 1}`}
                                disabled={quieto}
                                onClick={() => cambiar(e.clave, { fotoUrl: u })}
                                className={cn("overflow-hidden rounded-lg border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50", e.fotoUrl === u ? "border-primary" : "border-transparent opacity-70")}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={u} alt="" className="size-16 bg-card object-cover" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-destructive">No hay fotos del producto en este proyecto.</span>
                        )}
                      </div>
                      <Label className="flex flex-col items-stretch gap-1.5 sm:max-w-xs">
                        <span>Movimiento</span>
                        <Select items={MOVIMIENTO_LABELS} value={e.movimiento} disabled={quieto} onValueChange={(v) => v && cambiar(e.clave, { movimiento: v as Movimiento })}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MOVIMIENTOS.map((m) => (
                              <SelectItem key={m} value={m}>
                                {MOVIMIENTO_LABELS[m]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Label>
                      {esCierre && (
                        <p className="text-xs text-muted-foreground">
                          El cierre siempre va al final, con la foto real y la oferta en texto grande: «{proyecto.contexto.cierre.oferta}» · «{proyecto.contexto.cierre.llamadoALaAccion}».
                        </p>
                      )}
                    </div>
                  )}
                  {!esCierre && (
                    <Button variant="ghost" size="sm" className="self-start text-destructive" disabled={quieto || escenas.length <= 2} onClick={() => setEscenas((l) => l.filter((x) => x.clave !== e.clave))}>
                      <Trash2 /> Quitar esta escena
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-muted/30 p-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={opciones.subtitulos} disabled={quieto} onChange={(e) => setOpciones((o) => ({ ...o, subtitulos: e.target.checked }))} />
          Subtítulos
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={opciones.voz} disabled={quieto} onChange={(e) => setOpciones((o) => ({ ...o, voz: e.target.checked }))} />
          Voz
        </label>
        <details className="basis-full" data-avanzado-opciones>
          <summary className="cursor-pointer text-sm font-medium">Avanzado: música propia y modelo</summary>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
        <Input value={opciones.musica ?? ""} maxLength={600} disabled={quieto} placeholder="Música propia: enlace https a un mp3 (vacío = la elige sola según el tono)" aria-label="Música" onChange={(e) => setOpciones((o) => ({ ...o, musica: e.target.value || null }))} />
        <Input value={opciones.modelo ?? ""} maxLength={160} disabled={quieto} placeholder="Modelo (opcional)" aria-label="Modelo de video" onChange={(e) => setOpciones((o) => ({ ...o, modelo: e.target.value || null }))} />
          </div>
        </details>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3" id="voz-del-proyecto">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Voz y música del video</span>
          <Chip tono={vozP.motor === "clip" ? "azul" : "neutro"}>{vozP.motor === "clip" ? "La voz sale de cada clip" : "Narración aparte"}</Chip>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Label className="flex flex-col items-stretch gap-1.5">
            <span>Idioma y acento (según el país del proyecto)</span>
            <Input value={vozP.acento} maxLength={200} disabled={quieto} onChange={(e) => setVozP((v) => ({ ...v, acento: e.target.value }))} />
          </Label>
          <Label className="flex flex-col items-stretch gap-1.5">
            <span>Tono de la música</span>
            <Select items={TONO_MUSICA_LABELS} value={tono} disabled={quieto} onValueChange={(v) => v && setTono(v as TonoMusica)}>
              <SelectTrigger className="w-full" aria-label="Tono de la música">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONOS_MUSICA.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TONO_MUSICA_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
        </div>
        <Label className="flex flex-col items-stretch gap-1.5">
          <span>Descripción fija de la voz o del personaje</span>
          <Textarea value={vozP.descripcion} maxLength={400} rows={2} disabled={quieto} onChange={(e) => setVozP((v) => ({ ...v, descripcion: e.target.value }))} />
          <span className="text-xs font-normal text-muted-foreground">
            Va idéntica en todos los clips: es lo que sostiene que la voz no cambie de un clip a otro. Aun así puede variar un poco; si un clip suena distinto, se regenera solo ese.
          </span>
        </Label>
        <details data-avanzado-voz>
        <summary className="cursor-pointer text-sm font-medium">Avanzado: narración aparte</summary>
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={vozP.motor === "narracion"} disabled={quieto} onChange={(e) => setVozP((v) => ({ ...v, motor: e.target.checked ? "narracion" : "clip" }))} />
          <span>
            Usar narración aparte (ElevenLabs) en vez de la voz del clip
            <span className="block text-xs text-muted-foreground">Apagado por decisión del dueño. Solo funciona si el servidor de videos tiene esa clave.</span>
          </span>
        </label>
        </details>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={quieto || !sucio} onClick={() => void guardar()}>
          <Save /> {sucio ? "Guardar el plan" : "Plan guardado"}
        </Button>
        <Button variant="outline" disabled={quieto || escenas.length >= MAX_ESCENAS_PROYECTO} onClick={agregar}>
          <Plus /> Agregar escena
        </Button>
        {sucio && (
          <Button
            variant="ghost"
            disabled={quieto}
            onClick={() => {
              setEscenas(aBorrador(proyecto.escenas));
              setOpciones(proyecto.opciones);
              setVozP(proyecto.contexto.voz);
              setTono(proyecto.tonoMusica);
            }}
          >
            <Undo2 /> Descartar cambios
          </Button>
        )}
        <Button variant="ghost" className="ml-auto" disabled={quieto} onClick={onRehacer}>
          Proponer el plan de nuevo
        </Button>
      </div>
      {sucio && <p className={cn(ETIQUETA, "normal-case tracking-normal")}>Hay cambios sin guardar en el plan: guárdalos antes de generar.</p>}
    </div>
  );
}
