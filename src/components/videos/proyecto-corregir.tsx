"use client";

import { useMemo, useState } from "react";
import { Wrench } from "lucide-react";
import { MOVIMIENTOS, MOVIMIENTO_LABELS, NOMBRE_PASO, type Movimiento, type ProyectoVideo } from "@/lib/proyecto-video";
import { planDeCorreccion, type CorreccionProyecto } from "@/lib/proyecto-video-plan";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ETIQUETA } from "@/components/prospectos/piezas";

type Marca = { texto?: string; clip?: boolean; imagen?: boolean; nota?: string; fotoUrl?: string; movimiento?: Movimiento };

type Props = {
  proyecto: ProyectoVideo;
  activo: boolean;
  ocupado: boolean;
  onAplicar: (c: CorreccionProyecto) => Promise<boolean>;
};

/**
 * «Corregir»: se marca qué está mal y, antes de ejecutar, se dice exactamente
 * qué se va a rehacer y si cuesta. Nunca se regenera todo el video:
 *   texto · subtítulo · oferta · música · foto real → solo se arma de nuevo (sin costo)
 *   el clip de una escena                          → ese clip + armado
 *   la imagen de una escena                        → esa imagen + su clip + armado
 */
export function CorregirProyecto({ proyecto, activo, ocupado, onAplicar }: Props) {
  const [marcas, setMarcas] = useState<Record<number, Marca>>({});
  const [oferta, setOferta] = useState(proyecto.contexto.cierre.oferta);
  const [llamado, setLlamado] = useState(proyecto.contexto.cierre.llamadoALaAccion);
  const [musica, setMusica] = useState(proyecto.opciones.musica ?? "");
  const [subtitulos, setSubtitulos] = useState(proyecto.opciones.subtitulos);
  const marcar = (n: number, m: Partial<Marca>) => setMarcas((x) => ({ ...x, [n]: { ...x[n], ...m } }));

  const correccion = useMemo<CorreccionProyecto>(() => {
    const c: CorreccionProyecto = { textos: [], oferta, llamado, musica: musica.trim() || null, subtitulos, fotos: [], clips: [], imagenes: [] };
    for (const e of proyecto.escenas) {
      const m = marcas[e.n];
      if (!m) continue;
      if (m.texto !== undefined) c.textos.push({ n: e.n, voz: m.texto });
      if (e.tipo === "generada") {
        if (m.imagen) c.imagenes.push({ n: e.n, nota: m.nota ?? "" });
        else if (m.clip) c.clips.push({ n: e.n, nota: m.nota ?? "" });
      } else if (m.fotoUrl !== undefined || m.movimiento !== undefined) {
        c.fotos.push({ n: e.n, ...(m.fotoUrl !== undefined ? { fotoUrl: m.fotoUrl } : {}), ...(m.movimiento !== undefined ? { movimiento: m.movimiento } : {}) });
      }
    }
    return c;
  }, [marcas, oferta, llamado, musica, subtitulos, proyecto.escenas]);

  const plan = useMemo(() => planDeCorreccion(proyecto, correccion), [proyecto, correccion]);
  const cuesta = plan.pasos.some((p) => p.cuesta);
  const fotos = proyecto.contexto.fotos;

  async function aplicar() {
    if (await onAplicar(correccion)) setMarcas({});
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Marca solo lo que está mal. Abajo ves qué se va a rehacer y si cuesta, antes de ejecutar. Lo que no marques no se toca.
      </p>

      {/* ------------------------------------------------ solo armado */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Texto, cierre y música</span>
          <Chip tono="verde">Solo se arma de nuevo · sin costo</Chip>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Label className="flex flex-col items-stretch gap-1.5">
            <span>Oferta (rótulo del cierre)</span>
            <Input value={oferta} maxLength={400} onChange={(e) => setOferta(e.target.value)} />
          </Label>
          <Label className="flex flex-col items-stretch gap-1.5">
            <span>Llamado a la acción</span>
            <Input value={llamado} maxLength={200} onChange={(e) => setLlamado(e.target.value)} />
          </Label>
          <Label className="flex flex-col items-stretch gap-1.5">
            <span>Música</span>
            <Input value={musica} maxLength={600} placeholder="Enlace https del audio (vacío = sin música)" onChange={(e) => setMusica(e.target.value)} />
          </Label>
          <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={subtitulos} onChange={(e) => setSubtitulos(e.target.checked)} />
            Subtítulos
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <span className={ETIQUETA}>Lo que se dice en cada escena</span>
          {proyecto.escenas.map((e) => (
            <Label key={e.n} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
              <span className="mt-1.5 flex size-6 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-semibold text-primary">{e.n}</span>
              <Textarea value={marcas[e.n]?.texto ?? e.voz} maxLength={1200} rows={1} className="min-h-8" placeholder="Sin voz" aria-label={`Texto de la escena ${e.n}`} onChange={(ev) => marcar(e.n, { texto: ev.target.value })} />
            </Label>
          ))}
          <p className="text-xs text-muted-foreground">
            Si en la escena alguien habla a cámara, cambiar el texto no mueve sus labios: en ese caso marca además «El clip está mal».
          </p>
        </div>
      </section>

      {/* ------------------------------------------------ una escena */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Una escena se ve mal</span>
          <Chip tono="ambar">Rehace solo esa escena</Chip>
        </div>
        <ul className="flex flex-col gap-2">
          {proyecto.escenas.map((e) => {
            const m = marcas[e.n] ?? {};
            if (e.tipo !== "generada") {
              return (
                <li key={e.n} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm">
                    <strong className="font-medium">Escena {e.n}</strong>
                    <span className="text-xs text-muted-foreground">{e.tipo === "cierre" ? "Cierre con foto real" : "Foto real animada"}</span>
                    <Chip tono="verde">Cambiarla no cuesta</Chip>
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {fotos.map((u, k) => (
                      <button
                        key={u}
                        type="button"
                        aria-label={`Usar la foto ${k + 1} en la escena ${e.n}`}
                        aria-pressed={(m.fotoUrl ?? e.fotoUrl) === u}
                        onClick={() => marcar(e.n, { fotoUrl: u })}
                        className={cn("overflow-hidden rounded-lg border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50", (m.fotoUrl ?? e.fotoUrl) === u ? "border-primary" : "border-transparent opacity-60")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="size-12 bg-card object-cover" />
                      </button>
                    ))}
                    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Movimiento de la escena ${e.n}`}>
                      {MOVIMIENTOS.map((mov) => (
                        <button
                          key={mov}
                          type="button"
                          role="radio"
                          aria-checked={(m.movimiento ?? e.movimiento) === mov}
                          onClick={() => marcar(e.n, { movimiento: mov })}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                            (m.movimiento ?? e.movimiento) === mov ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                          )}
                        >
                          {MOVIMIENTO_LABELS[mov]}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              );
            }
            const sinClip = !e.clip.url;
            return (
              <li key={e.n} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2">
                <span className="flex flex-wrap items-center gap-1.5 text-sm">
                  <strong className="font-medium">Escena {e.n}</strong>
                  <span className="text-xs text-muted-foreground">
                    {e.titulo || NOMBRE_PASO[e.paso]} · {e.duracion} s
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    imagen {e.imagen.intentos}/{proyecto.topeIntentos} · clip {e.clip.intentos}/{proyecto.topeIntentos}
                  </span>
                </span>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-primary" checked={!!m.clip && !m.imagen} disabled={!!m.imagen || sinClip} onChange={(ev) => marcar(e.n, { clip: ev.target.checked })} />
                    El clip está mal (movimiento, gesto)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-primary" checked={!!m.imagen} disabled={!e.imagen.url} onChange={(ev) => marcar(e.n, { imagen: ev.target.checked })} />
                    La imagen está mal (lo que se ve)
                  </label>
                </div>
                {(m.clip || m.imagen) && (
                  <Textarea value={m.nota ?? ""} maxLength={600} rows={2} placeholder="Qué está mal y cómo debe quedar: es lo que recibe el generador" aria-label={`Nota de la escena ${e.n}`} onChange={(ev) => marcar(e.n, { nota: ev.target.value })} />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ------------------------------------------------ qué se va a hacer */}
      <section aria-live="polite" className={cn("flex flex-col gap-2 rounded-xl border p-3", plan.vacio ? "border-border bg-muted/30" : cuesta ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/40 bg-emerald-500/10")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Qué se va a rehacer</span>
          {!plan.vacio && !plan.bloqueos.length && <Chip tono={cuesta ? "ambar" : "verde"}>{cuesta ? "Cuesta: solo lo marcado" : "Sin costo: solo armado"}</Chip>}
        </div>
        {plan.vacio ? (
          <p className="text-xs text-muted-foreground">Todavía no marcaste nada.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {plan.pasos.map((p) => (
              <li key={p.texto} className="flex items-start gap-2 text-xs leading-relaxed">
                <Chip tono={p.cuesta ? "ambar" : "verde"}>{p.cuesta ? "Cuesta" : "Sin costo"}</Chip>
                <span className="min-w-0 flex-1">{p.texto}</span>
              </li>
            ))}
            {plan.bloqueos.map((b) => (
              <li key={b} className="flex items-start gap-2 text-xs leading-relaxed text-destructive">
                <Chip tono="rojo">No se puede</Chip>
                <span className="min-w-0 flex-1">{b}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={ocupado || plan.vacio || plan.bloqueos.length > 0 || !activo} onClick={() => void aplicar()}>
            <Wrench /> {cuesta ? "Aplicar corrección" : "Aplicar y armar de nuevo"}
          </Button>
          {!activo && <span className="text-xs text-muted-foreground">Se activa al conectar el servidor de videos.</span>}
        </div>
      </section>
    </div>
  );
}
