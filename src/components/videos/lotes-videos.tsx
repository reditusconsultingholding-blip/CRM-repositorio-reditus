"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FolderOpen, Layers, Play, Plus, Upload } from "lucide-react";
import { correrFilaLote, crearLote, editarFilaLote, listarLotes } from "@/app/(protected)/videos/lotes-actions";
import { ESTADO_FILA_LABELS, MAX_FILAS_LOTE, faltaEnFila, filasDeTexto, type FilaLote, type LoteVideos } from "@/lib/lotes-video";
import { nombrePais, type GuionGuardado } from "@/lib/videos";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ETIQUETA } from "@/components/prospectos/piezas";
import { estadoMiVideo } from "./mis-videos";

export type ProspectoLote = { id: string; nombre: string; producto: string; pais: string };

type Props = {
  formatos: { slug: string; nombre: string }[];
  /** Prospectos del embudo que se pueden meter al lote (solo equipo comercial). */
  prospectos: ProspectoLote[];
  guiones: GuionGuardado[];
  onGuion: (g: GuionGuardado) => void;
  onAbrir: (g: GuionGuardado) => void;
};

const TONO_FILA = { pendiente: "neutro", "en-marcha": "azul", creado: "azul", detenido: "ambar", "espera-manana": "neutro", error: "rojo" } as const;

/**
 * Lotes: una lista de productos, una fila por video. Cada fila corre sola
 * hasta donde pueda y dice qué necesita. La pantalla las corre una por una;
 * si se cierra, el lote queda guardado y se continúa después.
 */
export function LotesVideos({ formatos, prospectos, guiones, onGuion, onAbrir }: Props) {
  const [lotes, setLotes] = useState<LoteVideos[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [texto, setTexto] = useState("");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [corriendo, setCorriendo] = useState<{ lote: string; fila: number } | null>(null);
  const [creando, setCreando] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const parar = useRef(false);

  useEffect(() => {
    let vivo = true;
    void listarLotes().then((r) => {
      if (vivo && !("error" in r)) setLotes(r.lotes);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const leido = useMemo(() => filasDeTexto(texto, formatos), [texto, formatos]);
  const total = leido.filas.length + elegidos.length;
  const poner = (l: LoteVideos) => setLotes((x) => [l, ...x.filter((y) => y.id !== l.id)].sort((a, b) => b.id.localeCompare(a.id)));

  /** Corre, una por una, las filas que todavía no empezaron. */
  async function correr(lote: LoteVideos, soloFila?: number) {
    parar.current = false;
    let actual = lote;
    const cola = actual.filas.filter((f) => (soloFila ? f.n === soloFila : !f.guionId && (f.estado === "pendiente" || f.estado === "espera-manana"))).map((f) => f.n);
    for (const n of cola) {
      if (parar.current) break;
      setCorriendo({ lote: actual.id, fila: n });
      const r = await correrFilaLote(actual.id, n);
      if ("error" in r) {
        toast.error(`Fila ${n}: ${r.error}`, { duration: 9000 });
        break;
      }
      actual = r.lote;
      poner(r.lote);
      if (r.guion) onGuion(r.guion);
      // Se alcanzó el tope diario: esta y las demás quedaron «en espera para mañana».
      if (r.lote.filas.find((f) => f.n === n)?.estado === "espera-manana") {
        toast.warning("Se alcanzó el tope diario de videos: el resto del lote queda en espera para mañana.", { duration: 9000 });
        break;
      }
    }
    setCorriendo(null);
  }

  async function crear() {
    setCreando(true);
    const r = await crearLote({ nombre, filas: leido.filas, prospectos: elegidos });
    setCreando(false);
    if ("error" in r) return void toast.error(r.error, { duration: 9000 });
    poner(r.lote);
    setNuevo(false);
    setTexto("");
    setElegidos([]);
    setNombre("");
    toast.success(`Lote creado con ${r.lote.filas.length} ${r.lote.filas.length === 1 ? "video" : "videos"}: empieza a correr`);
    void correr(r.lote);
  }

  return (
    <Card id="lotes-videos">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="size-4" /> Lotes
        </CardTitle>
        <CardDescription>Varios videos de una vez: pega una lista o elige prospectos. Cada fila investiga, escribe su guion y avanza sola hasta donde haga falta una persona.</CardDescription>
        <CardAction>
          <Button variant={nuevo ? "ghost" : "default"} size="sm" onClick={() => setNuevo((x) => !x)}>
            <Plus /> {nuevo ? "Cerrar" : "Nuevo lote"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {nuevo && (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
            <Label className="flex flex-col items-stretch gap-1.5 sm:max-w-sm">
              <span>Nombre del lote (opcional)</span>
              <Input value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} />
            </Label>
            <Label className="flex flex-col items-stretch gap-1.5">
              <span>Lista: una fila por video</span>
              <Textarea
                value={texto}
                rows={5}
                className="max-h-64 font-mono text-xs"
                placeholder={"producto ; enlace ; país ; oferta ; llamado a la acción ; formato (opcional) ; fotos https (opcional)\nTermo de acero 500 ml ; https://tienda.com/termo ; Colombia ; 2 por $89.900 con envío gratis ; pide el tuyo en el botón de abajo ; ugc"}
                onChange={(e) => setTexto(e.target.value)}
                aria-label="Lista del lote"
              />
              <span className="text-xs font-normal text-muted-foreground">
                Pégala desde una hoja de cálculo (columnas en ese orden) o sepárala con punto y coma. Hasta {MAX_FILAS_LOTE} filas. Sin formato, se usa el que recomiende la investigación.
              </span>
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={archivo}
                type="file"
                hidden
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  if (f.size > 300_000) return void toast.error("El archivo pesa demasiado para ser una lista de videos.");
                  setTexto(await f.text());
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => archivo.current?.click()}>
                <Upload /> Subir un archivo (.csv o .txt)
              </Button>
              {leido.filas.length > 0 && <Chip tono="azul">{leido.filas.length} {leido.filas.length === 1 ? "fila leída" : "filas leídas"}</Chip>}
            </div>
            {leido.avisos.map((a) => (
              <p key={a} className="text-xs text-amber-700 dark:text-amber-300">
                {a}
              </p>
            ))}
            {leido.filas.length > 0 && (
              <ul className="flex flex-col gap-1">
                {leido.filas.map((f) => {
                  const falta = faltaEnFila(f);
                  return (
                    <li key={f.n} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-xs">
                      <span className="font-mono text-muted-foreground">{f.n}</span>
                      <strong className="font-medium">{f.producto}</strong>
                      <Chip>{nombrePais(f.pais)}</Chip>
                      {f.formato && <Chip>{formatos.find((x) => x.slug === f.formato)?.nombre ?? f.formato}</Chip>}
                      {f.fotos.length > 0 && <Chip>{f.fotos.length} fotos</Chip>}
                      {falta.length > 0 && <Chip tono="ambar">Falta {falta.join(" y ")}</Chip>}
                    </li>
                  );
                })}
              </ul>
            )}
            {prospectos.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className={ETIQUETA}>O elige prospectos del embudo ({elegidos.length} elegidos)</span>
                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-card p-2">
                  {prospectos.map((p) => (
                    <li key={p.id}>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" className="size-4 accent-primary" checked={elegidos.includes(p.id)} onChange={(e) => setElegidos((l) => (e.target.checked ? [...l, p.id] : l.filter((x) => x !== p.id)))} />
                        <span className="min-w-0 truncate">
                          <strong className="font-medium">{p.nombre}</strong> · {p.producto || "sin producto"} · {p.pais || "sin país"}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <span className="text-xs text-muted-foreground">Un prospecto trae producto, tienda y país. La oferta y el llamado a la acción se escriben en su fila después de crear el lote: no se inventan.</span>
              </div>
            )}
            <div>
              <Button disabled={!total || total > MAX_FILAS_LOTE || creando} onClick={() => void crear()}>
                <Play /> {creando ? "Creando…" : `Crear el lote y correrlo (${total})`}
              </Button>
            </div>
          </div>
        )}

        {!lotes.length && !nuevo && <p className="text-sm text-muted-foreground">Todavía no hay lotes.</p>}
        {lotes.map((lote) => {
          const porCorrer = lote.filas.filter((f) => !f.guionId && (f.estado === "pendiente" || f.estado === "espera-manana")).length;
          const enEste = corriendo?.lote === lote.id;
          return (
            <section key={lote.id} className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3" aria-label={`Lote ${lote.nombre}`}>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm font-medium">{lote.nombre}</strong>
                <span className="text-xs text-muted-foreground">
                  {lote.filas.length} videos · {lote.creadoPor}
                </span>
                {enEste ? (
                  <Button variant="ghost" size="sm" onClick={() => (parar.current = true)}>
                    Detener al terminar esta fila
                  </Button>
                ) : (
                  porCorrer > 0 && (
                    <Button variant="outline" size="sm" disabled={!!corriendo} onClick={() => void correr(lote)}>
                      <Play /> Continuar lote ({porCorrer})
                    </Button>
                  )
                )}
              </div>
              <ul className="flex flex-col gap-1.5">
                {lote.filas.map((f) => (
                  <FilaVista
                    key={f.n}
                    lote={lote}
                    fila={f}
                    guion={f.guionId ? (guiones.find((g) => g.id === f.guionId) ?? null) : null}
                    trabajando={enEste && corriendo?.fila === f.n}
                    bloqueado={!!corriendo}
                    onLote={poner}
                    onCorrer={() => void correr(lote, f.n)}
                    onAbrir={onAbrir}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

function FilaVista({ lote, fila, guion, trabajando, bloqueado, onLote, onCorrer, onAbrir }: { lote: LoteVideos; fila: FilaLote; guion: GuionGuardado | null; trabajando: boolean; bloqueado: boolean; onLote: (l: LoteVideos) => void; onCorrer: () => void; onAbrir: (g: GuionGuardado) => void }) {
  const [oferta, setOferta] = useState(fila.oferta);
  const [llamado, setLlamado] = useState(fila.llamado);
  const [guardando, setGuardando] = useState(false);
  // Con proyecto, el estado se lee en vivo de él; antes, de lo que dejó escrito la fila.
  const vivo = guion?.versiones.at(-1)?.proyecto ? estadoMiVideo(guion, undefined) : null;
  const incompleta = !fila.guionId && faltaEnFila(fila).length > 0;

  async function completar() {
    setGuardando(true);
    const r = await editarFilaLote(lote.id, fila.n, { oferta, llamado });
    setGuardando(false);
    if ("error" in r) return void toast.error(r.error, { duration: 9000 });
    onLote(r.lote);
  }

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2" data-fila={fila.n}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-xs text-muted-foreground">{fila.n}</span>
        {trabajando ? <Chip tono="azul">Trabajando…</Chip> : vivo ? <Chip tono={vivo.tono}>{vivo.etiqueta}</Chip> : <Chip tono={TONO_FILA[fila.estado]}>{ESTADO_FILA_LABELS[fila.estado]}</Chip>}
        <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium">{fila.producto}</span>
        <span className="text-xs text-muted-foreground">{nombrePais(fila.pais)}</span>
        {guion && (
          <Button variant="ghost" size="sm" onClick={() => onAbrir(guion)}>
            <FolderOpen /> Abrir
          </Button>
        )}
        {!fila.guionId && !incompleta && !trabajando && (
          <Button variant="ghost" size="sm" disabled={bloqueado} onClick={onCorrer}>
            <Play /> Correr
          </Button>
        )}
      </div>
      {(vivo?.detalle || (!vivo && fila.detalle)) && <p className="text-xs leading-relaxed text-muted-foreground">{vivo ? vivo.detalle : fila.detalle}</p>}
      {incompleta && (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Input value={oferta} maxLength={400} placeholder="Oferta (la que dio el cliente)" aria-label={`Oferta de la fila ${fila.n}`} onChange={(e) => setOferta(e.target.value)} />
          <Input value={llamado} maxLength={200} placeholder="Llamado a la acción" aria-label={`Llamado a la acción de la fila ${fila.n}`} onChange={(e) => setLlamado(e.target.value)} />
          <Button variant="outline" disabled={guardando || !oferta.trim() || !llamado.trim()} onClick={() => void completar()}>
            Guardar
          </Button>
        </div>
      )}
    </li>
  );
}
