"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Clapperboard, Copy, Film, Images, Lock, RotateCcw, Send, X } from "lucide-react";
import { aprobarVideo, usarVideoEnProspecto } from "@/app/(protected)/videos/actions";
import {
  aprobarPiezas,
  cancelarTrabajoProyecto,
  consultarProyecto,
  corregirProyecto,
  crearProyecto,
  guardarPlan,
  pedirEtapa,
  reabrirIntentos,
  regenerarPieza,
  revisarPieza,
  type EstadoProyecto,
} from "@/app/(protected)/videos/proyecto-actions";
import {
  ESTADO_FINAL_LABELS,
  ESTADO_PIEZA_LABELS,
  NOMBRE_PASO,
  TONO_PIEZA,
  TOPE_INTENTOS_ESCENA,
  costoProyectoTexto,
  duracionTotal,
  escenasParaClip,
  escenasParaImagen,
  estimado,
  faltaParaArmar,
  hayTrabajoEnCurso,
  resumenProyecto,
  type EscenaProyecto,
  type FichaProducto,
  type ProyectoVideo,
  type TipoPieza,
} from "@/lib/proyecto-video";
import { ESTADO_TRABAJO_LABELS, ETAPA_LABELS, TONO_TRABAJO, trabajoActivo, type EtapaTrabajo, type TrabajoVista } from "@/lib/trabajos-video";
import { versionVigente, type GuionGuardado } from "@/lib/videos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Chip, ETIQUETA, Segmento } from "@/components/prospectos/piezas";
import { CorregirProyecto } from "./proyecto-corregir";
import { PlanEscenas } from "./proyecto-plan";
import { RevisionPiezas } from "./proyecto-revision";

/** Cada cuánto se consulta mientras hay algo generándose y la pestaña está a la vista. */
const SONDEO_MS = 4000;

type Vista = "escenas" | "plan" | "corregir";
const VISTAS: readonly Vista[] = ["escenas", "plan", "corregir"];
const VISTA_LABELS: Record<Vista, string> = { escenas: "Escenas", plan: "Plan", corregir: "Corregir" };

type Props = {
  guardado: GuionGuardado;
  /** Hay servidor de videos conectado (existe SERVIDOR_SECRET). */
  activo: boolean;
  /** Puede aprobar o rechazar imágenes, clips y el video final. */
  puedeAprobar: boolean;
  esCeo: boolean;
  puedeUsarEnProspecto: boolean;
  /** Fotos y ficha del formulario (para proponer el plan de nuevo). */
  fotos: string[];
  ficha: FichaProducto;
  bloqueado: boolean;
  onGuardado: (g: GuionGuardado, cargar: boolean) => void;
};

const huella = (g: GuionGuardado) => {
  const v = versionVigente(g);
  return JSON.stringify([v?.n, v?.proyecto, v?.videoUrl, v?.videoAprobado]);
};

/**
 * Pantalla del proyecto por escenas: costo a la vista, avance por etapa, tira
 * de escenas, revisión de imágenes y clips, armado, video final y «Corregir».
 * Mientras hay trabajos en la cola se pone al día sola.
 */
export function ProyectoVideoPanel({ guardado, activo, puedeAprobar, esCeo, puedeUsarEnProspecto, fotos, ficha, bloqueado, onGuardado }: Props) {
  const version = versionVigente(guardado);
  const proyecto = version?.proyecto as ProyectoVideo;
  const id = guardado.id;
  const [trabajos, setTrabajos] = useState<TrabajoVista[]>([]);
  const [accion, setAccion] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("escenas");
  const [revision, setRevision] = useState<{ tipo: TipoPieza; n: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [serie, setSerie] = useState(0);
  const enAccion = useRef(false);
  const huellaActual = useRef("");
  const alGuardar = useRef(onGuardado);
  useEffect(() => {
    alGuardar.current = onGuardado;
    huellaActual.current = huella(guardado);
  });

  const recibir = useCallback((r: EstadoProyecto) => {
    setTrabajos(r.trabajos);
    if (huella(r.guardado) !== huellaActual.current) alGuardar.current(r.guardado, false);
  }, []);

  // Al abrir: cómo va (recoge lo que el servidor entregó mientras nadie miraba).
  useEffect(() => {
    let vivo = true;
    void consultarProyecto(id).then((r) => {
      if (vivo && !("error" in r) && !enAccion.current) recibir(r);
    });
    return () => {
      vivo = false;
    };
  }, [id, recibir]);

  // En vivo: mientras haya algo en la cola. Nunca a la vez que una acción de la persona.
  const enCurso = hayTrabajoEnCurso(proyecto);
  useEffect(() => {
    if (!enCurso) return;
    let vivo = true;
    let enVuelo = false;
    const reloj = window.setInterval(() => {
      if (document.hidden || enVuelo || enAccion.current) return;
      enVuelo = true;
      void consultarProyecto(id)
        .then((r) => {
          if (vivo && !("error" in r) && !enAccion.current) recibir(r);
        })
        .finally(() => {
          enVuelo = false;
        });
    }, SONDEO_MS);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
    };
  }, [id, enCurso, recibir]);

  const resumen = useMemo(() => resumenProyecto(proyecto), [proyecto]);
  const est = useMemo(() => estimado(proyecto), [proyecto]);
  const paraImagen = useMemo(() => escenasParaImagen(proyecto), [proyecto]);
  const paraClip = useMemo(() => escenasParaClip(proyecto), [proyecto]);
  const faltaArmar = useMemo(() => faltaParaArmar(proyecto), [proyecto]);
  const abiertos = trabajos.filter((t) => t.guionId === id && trabajoActivo(t.estado));
  const ocupado = !!accion || bloqueado;
  const final = proyecto.final;
  const armando = final.estado === "en-cola" || final.estado === "generando";
  const puedeArmar = !faltaArmar.length && !enCurso && final.estado !== "por-aprobar" && final.estado !== "aprobada";
  const videoVigente = final.estado === "por-aprobar" || final.estado === "aprobada";

  /** Corre una acción del servidor; mientras tanto el sondeo no escribe encima. */
  async function correr(nombre: string, fn: () => Promise<EstadoProyecto | { error: string }>, exito?: string): Promise<boolean> {
    enAccion.current = true;
    setAccion(nombre);
    try {
      const r = await fn();
      if ("error" in r) {
        toast.error(r.error, { duration: 10000 });
        return false;
      }
      recibir(r);
      setAviso(r.aviso ?? null);
      if (exito) toast.success(exito);
      return true;
    } finally {
      enAccion.current = false;
      setAccion(null);
    }
  }

  const pedir = (etapa: EtapaTrabajo, exito: string) => correr(`pedir:${etapa}`, () => pedirEtapa(id, etapa), exito);

  async function pedirClips() {
    const seg = paraClip.reduce((s, e) => s + e.duracion, 0);
    if (!window.confirm(`Se van a generar ${paraClip.length} ${paraClip.length === 1 ? "clip" : "clips"} (${seg} s de video). Es lo que más cuesta. ¿Continuar?`)) return;
    await pedir("clips", "Clips en cola");
  }

  async function rehacerPlan() {
    if (!window.confirm("Se propone el plan de nuevo desde el guion. Las imágenes y clips de este plan se descartan (lo ya gastado sigue contando). ¿Continuar?")) return;
    if (await correr("plan", () => crearProyecto(id, { fotos: fotos.length ? fotos : proyecto.contexto.fotos, ficha, reemplazar: true }), "Plan propuesto de nuevo")) setSerie((s) => s + 1);
  }

  async function aprobarFinal() {
    if (!version) return;
    if (!window.confirm("¿Aprobar el video? A partir de aquí se puede copiar su enlace y pasarlo al prospecto.")) return;
    enAccion.current = true;
    setAccion("final");
    const r = await aprobarVideo(id, version.n);
    enAccion.current = false;
    setAccion(null);
    if ("error" in r) return void toast.error(r.error, { duration: 10000 });
    onGuardado(r.guardado, false);
    toast.success("Video aprobado");
  }

  async function alProspecto() {
    if (!version || !window.confirm("Esto reemplaza la pieza actual de la ficha del prospecto por este video. ¿Continuar?")) return;
    setAccion("prospecto");
    const r = await usarVideoEnProspecto(id, version.n);
    setAccion(null);
    if ("error" in r) toast.error(r.error, { duration: 10000 });
    else toast.success("Video puesto en la ficha del prospecto");
  }

  async function copiarEnlace(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace del video copiado");
    } catch {
      toast.error("No se pudo copiar. Abre el video y copia su dirección.");
    }
  }

  function abrirEscena(e: EscenaProyecto) {
    if (e.tipo !== "generada") return void setVista("plan");
    // Se abre en lo que toca mirar: el clip si ya hay, si no la imagen.
    const tipo: TipoPieza = e.clip.url || e.clip.estado !== "pendiente" ? "clip" : "imagen";
    setRevision({ tipo, n: e.n });
  }

  const primeraPorAprobar = (tipo: TipoPieza) => proyecto.escenas.find((e) => e.tipo === "generada" && e[tipo].estado === "por-aprobar")?.n ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------------------------------------- estado y costo */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
          <Chip tono={resumen.tono}>{resumen.etiqueta}</Chip>
          <span className="min-w-0 flex-1 basis-48 text-xs text-muted-foreground">{resumen.detalle}</span>
          <Chip>
            {proyecto.escenas.length} escenas · {duracionTotal(proyecto)} s
          </Chip>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Etapa titulo="1 · Imágenes base" hecho={resumen.imagenes.aprobadas} total={resumen.imagenes.total} extra={resumen.imagenes.porAprobar ? `${resumen.imagenes.porAprobar} por revisar` : resumen.imagenes.enCurso ? `${resumen.imagenes.enCurso} en proceso` : ""} />
          <Etapa titulo="2 · Clips" hecho={resumen.clips.aprobadas} total={resumen.clips.total} extra={resumen.clips.porAprobar ? `${resumen.clips.porAprobar} por revisar` : resumen.clips.enCurso ? `${resumen.clips.enCurso} en proceso` : ""} />
          <Etapa titulo="3 · Armado" hecho={videoVigente ? 1 : 0} total={1} extra={ESTADO_FINAL_LABELS[final.estado]} pulso={armando} />
        </div>
        <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className={ETIQUETA}>Gastado</dt>
          <dd data-costo>
            {costoProyectoTexto(proyecto.costo)}
            {final.armados ? ` · ${final.armados} ${final.armados === 1 ? "armado" : "armados"} (sin costo)` : ""}
          </dd>
          <dt className={ETIQUETA}>Falta generar</dt>
          <dd>
            {est.imagenes || est.clips
              ? `${est.imagenes} ${est.imagenes === 1 ? "imagen" : "imágenes"} y ${est.clips} ${est.clips === 1 ? "clip" : "clips"} (${est.segundos} s de video).`
              : "Nada: no queda nada por pagar."}{" "}
            {est.sinCosto} {est.sinCosto === 1 ? "escena sale" : "escenas salen"} de la foto real y no cuestan.
          </dd>
        </dl>
        {!activo && (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            <span>
              La generación se activa al conectar el servidor de videos (variable <code>SERVIDOR_SECRET</code>). Mientras tanto puedes revisar y editar el plan de escenas: queda guardado.
            </span>
          </p>
        )}
        {[...(aviso ? [aviso] : []), ...proyecto.avisos].map((a) => (
          <p key={a} role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            {a}
          </p>
        ))}

        {/* ------------------------------------------ lo que toca hacer */}
        <div className="flex flex-wrap items-center gap-2">
          {paraImagen.length > 0 && (
            <Button disabled={!activo || ocupado || armando} onClick={() => void pedir("imagenes", "Imágenes en cola")}>
              <Images /> {accion === "pedir:imagenes" ? "Encolando…" : `Generar ${paraImagen.length} ${paraImagen.length === 1 ? "imagen" : "imágenes"}`}
            </Button>
          )}
          {resumen.imagenes.porAprobar > 0 && (
            <Button onClick={() => setRevision({ tipo: "imagen", n: primeraPorAprobar("imagen") ?? 1 })}>
              <Check /> Revisar {resumen.imagenes.porAprobar} {resumen.imagenes.porAprobar === 1 ? "imagen" : "imágenes"}
            </Button>
          )}
          {paraClip.length > 0 && (
            <Button variant={resumen.imagenes.porAprobar ? "outline" : "default"} disabled={!activo || ocupado || armando} onClick={() => void pedirClips()}>
              <Film /> {accion === "pedir:clips" ? "Encolando…" : `Generar ${paraClip.length} ${paraClip.length === 1 ? "clip" : "clips"} (${paraClip.reduce((s, e) => s + e.duracion, 0)} s)`}
            </Button>
          )}
          {resumen.clips.porAprobar > 0 && (
            <Button onClick={() => setRevision({ tipo: "clip", n: primeraPorAprobar("clip") ?? 1 })}>
              <Check /> Revisar {resumen.clips.porAprobar} {resumen.clips.porAprobar === 1 ? "clip" : "clips"}
            </Button>
          )}
          {puedeArmar && (
            <Button disabled={!activo || ocupado} onClick={() => void pedir("armado", "Armado en cola: no cuesta")}>
              <Clapperboard /> {accion === "pedir:armado" ? "Encolando…" : final.url ? "Armar de nuevo (sin costo)" : "Armar video (sin costo)"}
            </Button>
          )}
          {!puedeArmar && !videoVigente && !armando && !enCurso && !paraImagen.length && !paraClip.length && !resumen.imagenes.porAprobar && !resumen.clips.porAprobar && faltaArmar.length > 0 && (
            <span className="text-xs text-amber-700 dark:text-amber-300">Para armar falta {faltaArmar.slice(0, 3).join(", ")}.</span>
          )}
        </div>
        {abiertos.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {abiertos.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
                <Chip tono={TONO_TRABAJO[t.estado]}>{ESTADO_TRABAJO_LABELS[t.estado]}</Chip>
                <strong className="font-medium">{t.etapa ? ETAPA_LABELS[t.etapa] : "Video"}</strong>
                <span className="min-w-0 flex-1 basis-40 text-muted-foreground">
                  {t.estado === "pendiente"
                    ? "Esperando a que el servidor lo tome (pregunta cada minuto)."
                    : t.progreso?.detalle || (t.etapa === "armado" ? "Uniendo escenas, subtítulos y rótulo." : `${t.escenasEtapa.length} ${t.escenasEtapa.length === 1 ? "escena" : "escenas"}`)}
                  {t.motivo ? ` · Último intento: ${t.motivo}` : ""}
                </span>
                {t.estado === "pendiente" && (
                  <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => void correr("cancelar", () => cancelarTrabajoProyecto(id, t.id), "Cancelado: ese intento no cuenta")}>
                    <X /> Cancelar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------------------------------------------- video final */}
      {final.url && (
        <div className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          <video key={final.url} controls preload="metadata" playsInline src={final.url} className="mx-auto aspect-[9/16] w-full max-w-[13rem] rounded-lg border border-border bg-black object-contain" aria-label="Video armado" />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium">Video armado</span>
              <Chip tono={final.estado === "aprobada" ? "verde" : final.estado === "por-aprobar" ? "ambar" : "neutro"}>
                {videoVigente ? ESTADO_FINAL_LABELS[final.estado] : armando ? "Versión anterior · armando la nueva" : "Versión anterior · hay cambios por armar"}
              </Chip>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {final.estado === "aprobada"
                ? `Aprobado por ${version?.videoAprobado?.por || "—"}.`
                : final.estado === "por-aprobar"
                  ? "Nada generado sale sin un sí: míralo completo. Si algo está mal, márcalo en «Corregir»: se rehace solo eso."
                  : "Este es el armado anterior. Cuando esté lo nuevo, vuelve a armar (no cuesta)."}
            </p>
            <div className="mt-auto flex flex-wrap gap-2">
              {final.estado === "por-aprobar" && puedeAprobar && (
                <Button disabled={ocupado} onClick={() => void aprobarFinal()}>
                  <Check /> {accion === "final" ? "Aprobando…" : "Aprobar video"}
                </Button>
              )}
              {final.estado === "por-aprobar" && !puedeAprobar && <span className="text-xs text-muted-foreground">Lo aprueba el CEO, el gerente comercial o la directora operativa.</span>}
              {videoVigente && (
                <Button variant="outline" onClick={() => setVista("corregir")}>
                  Corregir algo
                </Button>
              )}
              {final.estado === "aprobada" && (
                <Button variant="outline" onClick={() => void copiarEnlace(final.url as string)}>
                  <Copy /> Copiar enlace
                </Button>
              )}
              {final.estado === "aprobada" && puedeUsarEnProspecto && guardado.prospectoId && (
                <Button variant="outline" disabled={ocupado} onClick={() => void alProspecto()}>
                  <Send /> Usar en el prospecto
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------- vistas */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmento value={vista} onChange={setVista} opciones={VISTAS} etiquetas={VISTA_LABELS} />
      </div>

      {vista === "escenas" && (
        <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2" aria-label="Escenas del proyecto">
          {proyecto.escenas.map((e) => (
            <TarjetaEscena key={e.n} e={e} esCeo={esCeo} ocupado={ocupado} onAbrir={() => abrirEscena(e)} onReabrir={(tipo) => void correr("reabrir", () => reabrirIntentos(id, e.n, tipo), "Intentos reabiertos")} />
          ))}
        </ul>
      )}
      {vista === "plan" && (
        <PlanEscenas
          key={`plan-${serie}`}
          proyecto={proyecto}
          bloqueado={enCurso}
          ocupado={ocupado}
          onGuardar={async (escenas, opciones) => {
            const ok = await correr("plan", () => guardarPlan(id, { escenas, opciones }), "Plan guardado");
            if (ok) setSerie((s) => s + 1);
            return ok;
          }}
          onRehacer={() => void rehacerPlan()}
        />
      )}
      {vista === "corregir" && (
        <CorregirProyecto
          key={`corregir-${serie}`}
          proyecto={proyecto}
          activo={activo}
          ocupado={ocupado || armando}
          onAplicar={async (c) => {
            const ok = await correr("corregir", () => corregirProyecto(id, c));
            if (ok) {
              setSerie((s) => s + 1);
              setVista("escenas");
            }
            return ok;
          }}
        />
      )}

      {revision && (
        <RevisionPiezas
          tipo={revision.tipo}
          escenas={proyecto.escenas}
          inicial={revision.n}
          puedeAprobar={puedeAprobar}
          activo={activo}
          ocupado={ocupado}
          onCerrar={() => setRevision(null)}
          onTipo={(tipo) => setRevision((r) => (r ? { ...r, tipo } : r))}
          onAprobar={(n) => correr("revisar", () => revisarPieza(id, n, revision.tipo, "aprobar"))}
          onRechazar={(n, nota) => correr("revisar", () => revisarPieza(id, n, revision.tipo, "rechazar", nota), "Rechazada con nota")}
          onRegenerar={(n, nota) => correr("regenerar", () => regenerarPieza(id, n, revision.tipo, nota), "Regenerando solo esa pieza")}
          onAprobarTodas={(ns) => correr("revisar", () => aprobarPiezas(id, revision.tipo, ns), "Aprobadas")}
        />
      )}
    </div>
  );
}

function Etapa({ titulo, hecho, total, extra, pulso }: { titulo: string; hecho: number; total: number; extra: string; pulso?: boolean }) {
  const pct = total > 0 ? Math.round((hecho / total) * 100) : 100;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{titulo}</span>
        <span className="font-mono text-xs text-muted-foreground">{total > 0 ? `${hecho}/${total}` : "—"}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={titulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={cn("h-full rounded-full bg-primary transition-[width] duration-500", pulso && "animate-pulse")} style={{ width: `${pulso ? Math.max(pct, 35) : pct}%` }} />
      </div>
      <span className="min-h-4 text-[11px] text-muted-foreground">{total > 0 ? extra : "No hay escenas generadas"}</span>
    </div>
  );
}

function TarjetaEscena({ e, esCeo, ocupado, onAbrir, onReabrir }: { e: EscenaProyecto; esCeo: boolean; ocupado: boolean; onAbrir: () => void; onReabrir: (tipo: TipoPieza) => void }) {
  const generada = e.tipo === "generada";
  const miniatura = generada ? e.imagen.url : e.fotoUrl;
  const enProceso = generada && (e.imagen.estado === "en-cola" || e.imagen.estado === "generando" || e.clip.estado === "en-cola" || e.clip.estado === "generando");
  const topeImagen = generada && e.imagen.intentos >= TOPE_INTENTOS_ESCENA && e.imagen.estado !== "aprobada" && e.imagen.estado !== "por-aprobar";
  const topeClip = generada && e.clip.intentos >= TOPE_INTENTOS_ESCENA && e.clip.estado !== "aprobada" && e.clip.estado !== "por-aprobar";
  return (
    <li className="flex w-32 shrink-0 snap-start flex-col gap-1.5 sm:w-36" data-escena={e.n}>
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Escena ${e.n}: ${e.titulo || NOMBRE_PASO[e.paso]}`}
        className="relative flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-black outline-none transition-colors hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {miniatura ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={miniatura} alt="" loading="lazy" className={cn("size-full object-cover", enProceso && "opacity-40")} />
        ) : (
          <span className="px-2 text-center text-[11px] text-white/60">{generada ? "Sin imagen todavía" : "Falta la foto"}</span>
        )}
        <span className="absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-full bg-black/70 font-mono text-xs font-semibold text-white">{e.n}</span>
        {enProceso && <span className="absolute inset-x-0 bottom-0 animate-pulse bg-primary/90 py-1 text-center text-[11px] font-medium text-primary-foreground">Generando…</span>}
        {generada && e.clip.url && !enProceso && <Film className="absolute right-1.5 bottom-1.5 size-4 text-white drop-shadow" aria-label="Tiene clip" />}
      </button>
      <span className="line-clamp-1 text-xs font-medium">{e.titulo || NOMBRE_PASO[e.paso]}</span>
      <span className="font-mono text-[11px] text-muted-foreground">
        paso {e.paso} · {e.duracion} s
      </span>
      {generada ? (
        <span className="flex flex-col gap-1">
          <Chip tono={TONO_PIEZA[e.imagen.estado]}>
            Img · {ESTADO_PIEZA_LABELS[e.imagen.estado]} · {e.imagen.intentos}/{TOPE_INTENTOS_ESCENA}
          </Chip>
          <Chip tono={TONO_PIEZA[e.clip.estado]}>
            Clip · {ESTADO_PIEZA_LABELS[e.clip.estado]} · {e.clip.intentos}/{TOPE_INTENTOS_ESCENA}
          </Chip>
          {(topeImagen || topeClip) && (
            <span className="text-[11px] leading-snug text-destructive">
              Tope de {TOPE_INTENTOS_ESCENA} intentos: no se regenera más.
              {esCeo && (
                <Button variant="ghost" size="xs" className="mt-1" disabled={ocupado} onClick={() => onReabrir(topeImagen ? "imagen" : "clip")}>
                  <RotateCcw /> Reabrir
                </Button>
              )}
            </span>
          )}
        </span>
      ) : (
        <Chip tono="verde">{e.tipo === "cierre" ? "Cierre · foto real" : "Foto real"} · sin costo</Chip>
      )}
    </li>
  );
}

// ------------------------------------------------ convertir en proyecto ----

type PropsConvertir = {
  guardado: GuionGuardado | null;
  sinGuardar: boolean;
  activo: boolean;
  fotos: string[];
  ficha: FichaProducto;
  bloqueado: boolean;
  onGuardado: (g: GuionGuardado, cargar: boolean) => void;
};

/** Un guion sin proyecto (los de antes, o uno recién escrito): se convierte aquí. */
export function ConvertirEnProyecto({ guardado, sinGuardar, activo, fotos, ficha, bloqueado, onGuardado }: PropsConvertir) {
  const [ocupado, setOcupado] = useState(false);
  const vigente = guardado ? versionVigente(guardado) : null;
  // Una versión nueva del guion (por una corrección) puede traer el proyecto de la anterior.
  const anterior = guardado ? [...guardado.versiones].reverse().find((v) => v.n !== vigente?.n && v.proyecto) : undefined;

  async function crear(heredarDe?: number) {
    if (!guardado) return;
    setOcupado(true);
    const r = await crearProyecto(guardado.id, { fotos, ficha, ...(heredarDe ? { heredarDe } : {}) });
    setOcupado(false);
    if ("error" in r) return void toast.error(r.error, { duration: 10000 });
    onGuardado(r.guardado, false);
    toast.success(heredarDe ? `Proyecto traído de la v${heredarDe}` : "Plan de escenas listo: revísalo antes de generar");
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
      <p className="text-sm font-medium">Video por escenas, con revisión en cada paso</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        El guion se parte en escenas. Primero se generan las imágenes base (centavos) y las apruebas; solo de las aprobadas se generan los clips; el armado no cuesta. Las escenas del producto y el cierre usan
        tus fotos reales, animadas: el producto sale idéntico y cuestan cero.
        {!activo ? " El plan se puede armar ya; la generación se activa al conectar el servidor de videos." : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!guardado || ocupado || bloqueado || !fotos.length} onClick={() => void crear()}>
          <Clapperboard /> {ocupado ? "Armando el plan…" : "Convertir en proyecto por escenas"}
        </Button>
        {anterior && (
          <Button variant="outline" disabled={ocupado || bloqueado || !fotos.length} onClick={() => void crear(anterior.n)}>
            Traer el proyecto de la v{anterior.n}
          </Button>
        )}
        {!guardado && <span className="text-xs text-muted-foreground">Guarda el guion primero.</span>}
        {guardado && sinGuardar && <span className="text-xs text-amber-700 dark:text-amber-300">Hay cambios sin guardar: el plan sale de la versión guardada (v{vigente?.n}).</span>}
        {guardado && !fotos.length && <span className="text-xs text-amber-700 dark:text-amber-300">Sube al menos una foto real del producto (arriba, junto a los datos).</span>}
      </div>
    </div>
  );
}
