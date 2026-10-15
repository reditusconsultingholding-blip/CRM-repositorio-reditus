"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Clapperboard, Copy, CopyPlus, Download, Film, ImagePlus, Images, Lock, Pencil, Play, RotateCcw, Send, X } from "lucide-react";
import { confirmarFotoProducto, prepararFotoProducto } from "@/app/(protected)/videos/actions";
import { createClient } from "@/lib/supabase/client";
import { BUCKET_VIDEOS_GENERADOS, MAX_FOTO_PRODUCTO_BYTES, TIPOS_FOTO_PRODUCTO } from "@/lib/trabajos-video";
import { Textarea } from "@/components/ui/textarea";
import { aprobarVideo, usarVideoEnProspecto } from "@/app/(protected)/videos/actions";
import {
  agregarFotoProyecto,
  ajustarAuto,
  ajustarPlan,
  aprobarPiezas,
  cancelarTrabajoProyecto,
  guardarCierre,
  guardarEdicion,
  cambiarGancho,
  revisarCoherenciaPlan,
  reabrirIntentosProyecto,
  crearVariaciones,
  seguirProyecto,
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
  cierreCompleto,
  ESTILOS_SUBTITULOS,
  ESTILO_SUBTITULOS_LABELS,
  RITMOS,
  RITMO_LABELS,
  ESTILOS_TITULOS,
  ESTILO_TITULOS_LABELS,
  type EstiloTitulos,
  leerEdicion,
  type EstiloSubtitulos,
  type Ritmo,
  PUNTOS_CONTROL,
  semaforoDe,
  VEREDICTO_LABELS,
  type PuntoControl,
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
import { CrearVariaciones } from "./variaciones";
import { PlanEscenas } from "./proyecto-plan";
import { RevisionPiezas } from "./proyecto-revision";
import { RetroVideo } from "./aprendizajes";
import { useConfirmar } from "./progreso-video";
import { GANCHOS, GANCHOS_VERSION, buscarGancho } from "@/lib/ganchos-video";

/** Cada cuánto se consulta mientras hay algo generándose y la pestaña está a la vista. */
const SONDEO_MS = 4000;

type Vista = "escenas" | "plan" | "corregir";
const VISTAS: readonly Vista[] = ["escenas", "plan", "corregir"];
const VISTA_LABELS: Record<Vista, string> = { escenas: "Escenas", plan: "Plan", corregir: "Corregir" };

/** Paso del Estudio de video: 1 Plan · 2 Activos · 3 Escenas · 4 Video · 5 Exportar. */
export type PasoEstudio = 1 | 2 | 3 | 4 | 5;

type Props = {
  /** Dentro del Estudio: qué paso se está viendo. Sin esto, la vista clásica con pestañas. */
  paso?: PasoEstudio;
  onPaso?: (p: PasoEstudio) => void;
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
  /** Se crearon otros guiones (variaciones): se suman a la lista sin abrirlos. */
  onOtros: (gs: GuionGuardado[]) => void;
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
export function ProyectoVideoPanel({ paso, onPaso, guardado, activo, puedeAprobar, esCeo, puedeUsarEnProspecto, fotos, ficha, bloqueado, onGuardado, onOtros }: Props) {
  const version = versionVigente(guardado);
  const proyecto = version?.proyecto as ProyectoVideo;
  const id = guardado.id;
  const [trabajos, setTrabajos] = useState<TrabajoVista[]>([]);
  const [accion, setAccion] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("escenas");
  const [revision, setRevision] = useState<{ tipo: TipoPieza; n: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [serie, setSerie] = useState(0);
  const [variando, setVariando] = useState(false);
  const enAccion = useRef(false);
  const [confirmar, dialogoConfirmar] = useConfirmar();
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
  // En modo directo el proyecto cambia solo (revisión con IA, etapa siguiente) aunque aquí no se vea nada en cola.
  const avanzaSolo = proyecto.auto.activo && !proyecto.auto.parada && proyecto.final.estado !== "por-aprobar" && proyecto.final.estado !== "aprobada";
  const sondear = enCurso || avanzaSolo;
  useEffect(() => {
    if (!sondear) return;
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
  }, [id, sondear, recibir]);

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
  const auto = proyecto.auto;
  // Las variaciones reutilizan lo ya hecho: hace falta que todas las escenas estén listas.
  const puedeVariar = !enCurso && !proyecto.variacionDe && proyecto.escenas.every((e) => (e.tipo === "generada" ? !!e.clip.url && (e.clip.estado === "aprobada" || e.clip.estado === "por-aprobar") : !!e.fotoUrl));
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
    if (!(await confirmar(`Se van a generar ${paraClip.length} ${paraClip.length === 1 ? "clip" : "clips"} (${seg} s de video). Es lo que más cuesta.`, { titulo: "¿Generar los clips?", si: "Sí, generar" }))) return;
    await pedir("clips", "Clips en cola");
  }

  async function rehacerPlan() {
    const texto = "Se propone el plan de nuevo desde el guion. Las imágenes y clips de este plan se descartan (lo ya gastado sigue contando)." + (auto.activo ? " El modo automático está encendido: las imágenes se piden de inmediato." : "");
    if (!(await confirmar(texto, { titulo: "¿Proponer el plan de nuevo?", si: "Sí, proponer de nuevo" }))) return;
    if (await correr("rehacer", () => crearProyecto(id, { fotos: fotos.length ? fotos : proyecto.contexto.fotos, ficha, reemplazar: true, directo: auto.activo }), "Plan propuesto de nuevo")) setSerie((s) => s + 1);
  }

  async function aprobarFinal() {
    if (!version) return;
    if (!(await confirmar("A partir de aquí se puede copiar su enlace y pasarlo al prospecto.", { titulo: "¿Aprobar el video?", si: "Sí, aprobar" }))) return;
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
    if (!version || !(await confirmar("Esto reemplaza la pieza actual de la ficha del prospecto por este video.", { titulo: "¿Usar este video en el prospecto?", si: "Sí, reemplazar" }))) return;
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
    if (e.tipo !== "generada") return void (paso ? onPaso?.(1) : setVista("plan"));
    // Se abre en lo que toca mirar: el clip si ya hay, si no la imagen. En el Estudio manda el paso.
    const tipo: TipoPieza = paso === 3 ? "imagen" : e.clip.url || e.clip.estado !== "pendiente" ? "clip" : "imagen";
    setRevision({ tipo, n: e.n });
  }

  // Paso 2 del Estudio: subir otra foto real del producto.
  const entradaFoto = useRef<HTMLInputElement>(null);
  async function subirFoto(file: File | undefined) {
    if (!file) return;
    if (!TIPOS_FOTO_PRODUCTO[file.type]) return void toast.error("La foto debe ser PNG, JPG o WebP.");
    if (file.size > MAX_FOTO_PRODUCTO_BYTES) return void toast.error(`La foto pesa más de ${MAX_FOTO_PRODUCTO_BYTES / 1024 / 1024} MB.`);
    setAccion("foto");
    try {
      const prep = await prepararFotoProducto({ tipo: file.type, tamano: file.size });
      if ("error" in prep) return void toast.error(prep.error);
      const { error } = await createClient().storage.from(BUCKET_VIDEOS_GENERADOS).uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
      if (error) return void toast.error(`No se pudo subir la foto: ${error.message}`);
      const listo = await confirmarFotoProducto(prep.path);
      if ("error" in listo) return void toast.error(listo.error);
      await correr("foto", () => agregarFotoProyecto(id, listo.url), "Foto agregada a los activos");
    } finally {
      setAccion(null);
    }
  }
  const [planPegado, setPlanPegado] = useState("");
  async function importarPlan() {
    let escenas: unknown;
    try {
      const o: unknown = JSON.parse(planPegado);
      escenas = Array.isArray(o) ? o : (o as { escenas?: unknown })?.escenas;
    } catch {
      return void toast.error("Eso no es un JSON válido. Debe ser una lista de escenas o un objeto con «escenas».");
    }
    if (!Array.isArray(escenas) || !escenas.length) return void toast.error("El plan pegado no trae escenas.");
    if (!(await confirmar(`Se reemplaza el plan por las ${escenas.length} escenas pegadas (las piezas ya generadas se descartan).`, { titulo: "¿Importar este plan?", si: "Sí, importar" }))) return;
    // Sin número de escena: así ninguna hereda piezas de otra por coincidencia.
    const limpias = escenas.map((e) => ({ ...(e && typeof e === "object" ? e : {}), n: 0 }));
    if (await correr("plan", () => guardarPlan(id, { escenas: limpias }), "Plan importado")) {
      setPlanPegado("");
      setSerie((x) => x + 1);
    }
  }
  const enPaso = (...pasos: PasoEstudio[]) => !paso || pasos.includes(paso);

  const primeraPorAprobar = (tipo: TipoPieza) => proyecto.escenas.find((e) => e.tipo === "generada" && e[tipo].estado === "por-aprobar")?.n ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------------------------------------- estado y costo */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3">
        <div className={cn("flex flex-wrap items-center gap-2", paso && "hidden")} role="status" aria-live="polite">
          <Chip tono={resumen.tono}>{resumen.etiqueta}</Chip>
          <span className="min-w-0 flex-1 basis-48 text-sm text-muted-foreground">{resumen.detalle}</span>
          <Chip>
            {proyecto.escenas.length} escenas · {duracionTotal(proyecto)} s
          </Chip>
        </div>
        {enPaso(1) && (
          <>
        <div className={cn("grid gap-2 sm:grid-cols-3", paso && "hidden")}>
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
        {proyecto.variacionDe && (
          <p className="text-sm text-muted-foreground">
            <Chip tono="azul">Variación</Chip> de «{proyecto.variacionDe.producto}»: cambia {proyecto.variacionDe.cambia}. Las demás escenas son las ya aprobadas del original (no se pagaron otra vez).
          </p>
        )}
        {/* ---------------------------------------- cuánto avanza solo */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-3 py-2" data-auto={auto.activo ? "si" : "no"}>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="size-4 accent-primary" checked={auto.activo} disabled={ocupado} onChange={(e) => void correr("auto", () => ajustarAuto(id, { activo: e.target.checked }))} />
            Que avance solo (modo automático)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={auto.imagenes} disabled={ocupado} onChange={(e) => void correr("auto", () => ajustarAuto(id, { imagenes: e.target.checked }))} />
            La IA aprueba las imágenes
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={auto.armarDirecto} disabled={ocupado} onChange={(e) => void correr("auto", () => ajustarAuto(id, { armarDirecto: e.target.checked }))} />
            Armar al terminar los clips
          </label>
          {auto.imagenes && (
            <Segmento value={auto.exigencia} onChange={(v) => void correr("auto", () => ajustarAuto(id, { exigencia: v }))} opciones={["estricto", "normal"] as const} etiquetas={{ estricto: "Estricto", normal: "Normal" }} disabled={ocupado} />
          )}
          <span className="basis-full text-sm text-muted-foreground">
            {auto.activo
              ? "Avanza solo hasta «Video por aprobar». Se detiene únicamente si hace falta una persona. El video final siempre lo apruebas tú."
              : "Apagado: cada etapa se pide con su botón."}
          </span>
        </div>
          </>
        )}
        {auto.parada && (
          <div role="alert" data-parada={auto.parada.codigo} className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
            <Chip tono="rojo">Detenido</Chip>
            <span className="min-w-0 flex-1 basis-56 text-sm leading-relaxed">{auto.parada.texto}</span>
            {auto.parada.codigo === "imagen-dudosa" ? (
              <Button size="sm" onClick={() => setRevision({ tipo: "imagen", n: primeraPorAprobar("imagen") ?? 1 })}>
                <Check /> Revisar
              </Button>
            ) : auto.parada.codigo === "revisar-clips" ? (
              <Button size="sm" onClick={() => setRevision({ tipo: "clip", n: primeraPorAprobar("clip") ?? 1 })}>
                <Check /> Revisar
              </Button>
            ) : auto.parada.codigo === "tope-intentos" ? (
              esCeo ? (
                <Button size="sm" disabled={ocupado} onClick={async () => {
                  if (await confirmar("Las piezas que llegaron al tope vuelven a tener intentos y el proyecto sigue solo. Cada intento nuevo cuesta.", { titulo: "¿Reabrir los intentos?", si: "Sí, reabrir" })) void correr("reabrir", () => reabrirIntentosProyecto(id));
                }}>
                  <RotateCcw /> {accion === "reabrir" ? "Reabriendo…" : "Reabrir intentos"}
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">Solo el CEO puede reabrir los intentos.</span>
              )
            ) : (
              <Button size="sm" disabled={ocupado} onClick={() => void correr("seguir", () => seguirProyecto(id))}>
                <Play /> {accion === "seguir" ? "Siguiendo…" : "Seguir"}
              </Button>
            )}
          </div>
        )}
        {!activo && (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm leading-relaxed text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            <span>
              La generación todavía no está conectada (falta enlazar el servidor de videos). Mientras tanto puedes revisar y editar el plan de escenas: queda guardado.
            </span>
          </p>
        )}
        {aviso && (
          <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm leading-relaxed">
            {aviso}
          </p>
        )}
        {enPaso(1) && proyecto.avisos.length > 0 && (
          <details className="rounded-lg border border-amber-500/30 bg-amber-500/10" data-avisos={proyecto.avisos.length}>
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-200">Avisos ({proyecto.avisos.length})</summary>
            <ul className="flex list-disc flex-col gap-1.5 px-3 pb-3 pl-8 text-sm leading-relaxed">
              {proyecto.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
        )}

        {/* ------------------------------------------ lo que toca hacer */}
        <div className="flex flex-wrap items-center gap-2">
          {paraImagen.length > 0 && !auto.activo && (
            <Button disabled={!activo || ocupado || armando} onClick={() => void pedir("imagenes", "Imágenes en cola")}>
              <Images /> {accion === "pedir:imagenes" ? "Encolando…" : `Generar ${paraImagen.length} ${paraImagen.length === 1 ? "imagen" : "imágenes"}`}
            </Button>
          )}
          {resumen.imagenes.porAprobar > 0 && (
            <Button onClick={() => setRevision({ tipo: "imagen", n: primeraPorAprobar("imagen") ?? 1 })}>
              <Check /> Revisar {resumen.imagenes.porAprobar} {resumen.imagenes.porAprobar === 1 ? "imagen" : "imágenes"}
            </Button>
          )}
          {paraClip.length > 0 && !auto.activo && (
            <Button variant={resumen.imagenes.porAprobar ? "outline" : "default"} disabled={!activo || ocupado || armando} onClick={() => void pedirClips()}>
              <Film /> {accion === "pedir:clips" ? "Encolando…" : `Generar ${paraClip.length} ${paraClip.length === 1 ? "clip" : "clips"} (${paraClip.reduce((s, e) => s + e.duracion, 0)} s)`}
            </Button>
          )}
          {resumen.clips.porAprobar > 0 && (
            <Button onClick={() => setRevision({ tipo: "clip", n: primeraPorAprobar("clip") ?? 1 })}>
              <Check /> Revisar {resumen.clips.porAprobar} {resumen.clips.porAprobar === 1 ? "clip" : "clips"}
            </Button>
          )}
          {puedeArmar && !auto.activo && (
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
      {final.url && enPaso(5) && (
        <div className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          <video key={final.url} controls preload="metadata" playsInline src={final.url} className="mx-auto aspect-[9/16] w-full max-w-[13rem] rounded-lg border border-border bg-black object-contain" aria-label="Video armado" />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium">Video armado</span>
              <Chip tono={final.estado === "aprobada" ? "verde" : final.estado === "por-aprobar" ? "ambar" : "neutro"}>
                {videoVigente ? ESTADO_FINAL_LABELS[final.estado] : armando ? "Versión anterior · armando la nueva" : "Versión anterior · hay cambios por armar"}
              </Chip>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {final.estado === "aprobada"
                ? `Aprobado por ${version?.videoAprobado?.por || "—"}.`
                : final.estado === "por-aprobar"
                  ? "Nada generado sale sin un sí: míralo completo. Si algo está mal, márcalo en «Corregir»: se rehace solo eso."
                  : "Este es el armado anterior. Cuando esté lo nuevo, vuelve a armar (no cuesta)."}
            </p>
            {final.avisos && final.avisos.length > 0 && (
              <ul className="flex flex-col gap-0.5 rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-sm" data-avisos-armado aria-label="Lo que informó el servidor al armar">
                {final.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
            {final.control && final.control.url === final.url && (
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-xs" data-control>
                <span className="flex flex-wrap items-center gap-2" data-semaforo={semaforoDe(final.control)}>
                  <span className={cn("inline-flex size-3 rounded-full", semaforoDe(final.control) === "verde" ? "bg-emerald-500" : semaforoDe(final.control) === "ambar" ? "bg-amber-500" : "bg-red-500")} aria-hidden="true" />
                  <strong className="text-sm font-semibold">{semaforoDe(final.control) === "verde" ? "Todo en orden" : semaforoDe(final.control) === "ambar" ? "Hay cosas que mirar" : "Hay algo mal"}</strong>
                  <span className={ETIQUETA}>Checklist automática {final.control.conFotogramas ? "(mirando fotogramas del video)" : "(solo con datos: el servidor no mandó fotogramas)"}</span>
                </span>
                <ul className="flex flex-col gap-0.5">
                  {(Object.keys(PUNTOS_CONTROL) as PuntoControl[]).map((k) => {
                    const x = final.control?.puntos[k];
                    return x ? (
                      <li key={k} className={x.nota === "mal" ? "text-destructive" : x.nota === "duda" ? "text-amber-700 dark:text-amber-300" : undefined}>
                        {x.nota === "ok" ? "✔" : x.nota === "mal" ? "✖" : "?"} <strong className="font-medium">{PUNTOS_CONTROL[k]}.</strong> {x.detalle}
                      </li>
                    ) : null;
                  })}
                </ul>
                <span className="text-muted-foreground">Es una ayuda para decidir más rápido: no aprueba nada.</span>
              </div>
            )}
            <div className="mt-auto flex flex-wrap gap-2">
              {final.estado === "por-aprobar" && puedeAprobar && (
                <Button disabled={ocupado} onClick={() => void aprobarFinal()}>
                  <Check /> {accion === "final" ? "Aprobando…" : "Aprobar video"}
                </Button>
              )}
              {final.estado === "por-aprobar" && !puedeAprobar && <span className="text-sm text-muted-foreground">Lo aprueba el CEO, el gerente comercial o la directora operativa.</span>}
              {videoVigente && (
                <Button variant="outline" onClick={() => (paso ? onPaso?.(4) : setVista("corregir"))}>
                  Corregir algo
                </Button>
              )}
              {final.estado === "aprobada" && (
                <Button variant="outline" onClick={() => void copiarEnlace(final.url as string)}>
                  <Copy /> Copiar enlace
                </Button>
              )}
              {final.estado === "aprobada" && (
                <a href={`${final.url}?download=`} download className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 text-sm font-medium hover:bg-accent">
                  <Download className="size-4" /> Descargar
                </a>
              )}
              {puedeVariar && (
                <Button variant="outline" disabled={ocupado} onClick={() => setVariando(true)}>
                  <CopyPlus /> Crear variaciones
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

      {final.url && enPaso(5) && puedeAprobar && <RetroVideo guionId={id} formatoNombre={guardado.formatoNombre || guardado.formato} />}

      {/* ---------------------------------------------- vistas */}
      {paso === 5 && !final.url && (
        <p className="rounded-xl border border-border bg-card px-3 py-3 text-sm text-muted-foreground">
          Todavía no hay video armado. {faltaArmar.length ? `Falta ${faltaArmar.slice(0, 3).join(", ")}.` : "Ya se puede armar: no cuesta."} Cuando esté, aquí se aprueba, se descarga y se crean sus variaciones.
        </p>
      )}

      {/* ---------------------------------------------- paso 2 del Estudio: activos */}
      {paso === 2 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tono={ficha.confirmado ? "verde" : "ambar"}>{ficha.confirmado ? "Ficha del producto confirmada" : "Ficha del producto sin confirmar"}</Chip>
            <Chip>{proyecto.contexto.fotos.length} {proyecto.contexto.fotos.length === 1 ? "foto real" : "fotos reales"}</Chip>
            <input ref={entradaFoto} type="file" hidden accept={Object.keys(TIPOS_FOTO_PRODUCTO).join(",")} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void subirFoto(f); }} />
          </div>
          <ul className="flex flex-wrap gap-3" aria-label="Activos del proyecto">
            {proyecto.contexto.fotos.map((u, i) => {
              const usos = proyecto.escenas.filter((e) => e.tipo !== "generada" && e.fotoUrl === u).map((e) => e.n);
              return (
                <li key={u} className="flex w-40 flex-col gap-2 rounded-2xl border border-border bg-card p-2 sm:w-44" data-activo={i + 1}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`Foto real ${i + 1} del producto`} className="aspect-[9/16] w-full rounded-xl bg-black object-contain" />
                  <span className="font-heading text-sm font-black italic uppercase">Producto · foto {i + 1}</span>
                  <span className="min-h-8 text-xs leading-snug text-muted-foreground">
                    {i === 0 ? "Principal. " : ""}
                    {usos.length ? `Se anima en la escena ${usos.join(", ")}.` : "Referencia para las escenas generadas."} No se genera: sale idéntica.
                  </span>
                  <span className="grid grid-cols-2 gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => onPaso?.(1)}>
                      <Pencil /> Editar
                    </Button>
                    <Button variant="outline" size="sm" disabled={ocupado} onClick={() => entradaFoto.current?.click()}>
                      <ImagePlus /> Subir
                    </Button>
                  </span>
                </li>
              );
            })}
            <li className="flex w-40 flex-col justify-between gap-2 rounded-2xl border border-dashed border-border p-3 sm:w-44">
              <span className="font-heading text-sm font-black italic uppercase">Otra foto</span>
              <span className="text-xs leading-snug text-muted-foreground">Otra vista del producto real (hasta 4). Se usa en escenas de foto real: no cuestan.</span>
              <Button size="sm" disabled={ocupado || proyecto.contexto.fotos.length >= 4} onClick={() => entradaFoto.current?.click()}>
                <ImagePlus /> {accion === "foto" ? "Subiendo…" : "Subir"}
              </Button>
            </li>
            <li className="flex w-40 flex-col gap-2 rounded-2xl border border-dashed border-border p-3 opacity-80 sm:w-44">
              <span className="font-heading text-sm font-black italic uppercase">Personajes base</span>
              <span className="text-xs leading-snug text-muted-foreground">
                Preparado, todavía no activo: hoy cada escena generada describe a su personaje en sus propias instrucciones. El material de personaje reutilizable entre escenas necesita al trabajador.
              </span>
            </li>
          </ul>
          <div className="rounded-xl border border-border bg-card p-3">
            <span className={ETIQUETA}>Ficha del producto que usa el proyecto</span>
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{proyecto.contexto.analisisProducto || "Sin ficha: las escenas no saben el tamaño ni el uso del producto."}</p>
            <p className="mt-2 text-sm text-muted-foreground">La ficha se corrige fuera del estudio, junto a los datos del producto. Cierre: «{proyecto.contexto.cierre.oferta}» · «{proyecto.contexto.cierre.llamadoALaAccion}».</p>
          </div>
        </div>
      )}

      {!paso && (
        <div className="flex flex-wrap items-center gap-2">
          <Segmento value={vista} onChange={setVista} opciones={VISTAS} etiquetas={VISTA_LABELS} />
        </div>
      )}

      {(paso ? paso === 3 || paso === 4 : vista === "escenas") && (
        <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2" aria-label="Escenas del proyecto">
          {proyecto.escenas.map((e) => (
            <TarjetaEscena key={e.n} e={e} tope={proyecto.topeIntentos} esCeo={esCeo} ocupado={ocupado} onAbrir={() => abrirEscena(e)} onReabrir={(tipo) => void correr("reabrir", () => reabrirIntentos(id, e.n, tipo), "Intentos reabiertos")} />
          ))}
        </ul>
      )}
      {(paso ? paso === 1 : vista === "plan") && (
        <PlanEscenas
          key={`plan-${serie}`}
          proyecto={proyecto}
          bloqueado={enCurso}
          ocupado={ocupado}
          onGuardar={async (escenas, opciones, extra) => {
            const ok = await correr("plan", () => guardarPlan(id, { escenas, opciones, ...extra }), "Plan guardado");
            if (ok) setSerie((s) => s + 1);
            return ok;
          }}
          onRehacer={() => void rehacerPlan()}
          rehaciendo={accion === "rehacer"}
        />
      )}
      {(paso ? paso === 4 && !!final.url : vista === "corregir") && (
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

      {paso === 1 && (
        <CierreVideo
          key={`cierre-${JSON.stringify(proyecto.contexto.cierre)}`}
          proyecto={proyecto}
          ocupado={ocupado || armando}
          guardando={accion === "cierre"}
          onGuardar={(c) => void correr("cierre", () => guardarCierre(id, c), "Cierre guardado")}
        />
      )}
      {paso === 1 && proyecto.escenas[0]?.tipo === "generada" && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3" id="gancho-de-apertura" aria-label="Gancho de apertura">
          <div>
            <span className="text-sm font-semibold">Gancho de apertura (los primeros 3 segundos)</span>
            <p className="text-sm text-muted-foreground">
              Un golpe visual de 1 segundo con el producto real y tres tomas muy cortas; después empieza la historia. {proyecto.contexto.gancho?.porque ?? "Este plan todavía no tiene un gancho del banco: elige uno."}
            </p>
          </div>
          <ul className="grid gap-2 md:grid-cols-3">
            {(proyecto.contexto.gancho?.opciones.length ? proyecto.contexto.gancho.opciones : GANCHOS.slice(0, 3).map((g) => g.id)).map((gid) => {
              const g = buscarGancho(gid);
              if (!g) return null;
              const activo = proyecto.contexto.gancho?.id === gid;
              return (
                <li key={gid} data-gancho={gid} className={cn("flex flex-col gap-2 rounded-lg border bg-card p-3", activo ? "border-primary" : "border-border")}>
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {g.nombre} {activo && <Chip tono="azul">En uso</Chip>}
                  </span>
                  <span className="text-sm leading-relaxed">{g.como}</span>
                  <span className="text-sm text-muted-foreground">Sirve cuando: {g.cuando}</span>
                  <span className="text-sm text-muted-foreground">Cuidado: {g.riesgos}</span>
                  {!activo && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-auto self-start"
                      disabled={ocupado || enCurso}
                      onClick={async () => {
                        if (await confirmar(`La apertura pasa a ser «${g.nombre}». La imagen y el clip de la escena 1 se descartan y hay que generarlos de nuevo (una imagen y un clip).`, { titulo: "¿Cambiar el gancho?", si: "Sí, cambiar" })) {
                          if (await correr("gancho", () => cambiarGancho(id, gid))) setSerie((s) => s + 1);
                        }
                      }}
                    >
                      {accion === "gancho" ? "Cambiando…" : "Usar este gancho"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <span className="text-xs text-muted-foreground">Banco de ganchos {GANCHOS_VERSION}. Son tipos de toma que se recrean con el producto real: nunca material de terceros.</span>
        </section>
      )}
      {paso === 1 && (
        <EdicionVideo edicion={leerEdicion(proyecto.contexto.edicion, guardado.formato)} ocupado={ocupado || armando} onCambiar={(e) => void correr("edicion", () => guardarEdicion(id, e), "Estilo guardado")} />
      )}
      {paso === 1 && (
        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Avanzado</summary>
          <div className="flex flex-col gap-2 border-t border-border p-3">
            <div className="flex flex-wrap items-center gap-2" id="revisar-coherencia">
              <Button variant="outline" disabled={ocupado || enCurso} onClick={() => void correr("coherencia", () => revisarCoherenciaPlan(id)).then((ok) => ok && setSerie((s) => s + 1))}>
                {accion === "coherencia" ? "Revisando…" : "Revisar que lo que se ve case con lo que se dice"}
              </Button>
              <span className="min-w-0 flex-1 basis-56 text-sm text-muted-foreground">La IA compara cada frase con su imagen y su clip y corrige lo que se pide ver (nunca la frase). Lo corregido queda por generar.</span>
            </div>
            <div className="flex flex-wrap items-center gap-2" id="ajustar-plan">
              <Button variant="outline" disabled={ocupado || enCurso} onClick={() => void correr("ajustar", () => ajustarPlan(id)).then((ok) => ok && setSerie((s) => s + 1))}>
                {accion === "ajustar" ? "Ajustando…" : "Ajustar el plan a las reglas del video automático"}
              </Button>
              <span className="min-w-0 flex-1 basis-56 text-sm text-muted-foreground">Alarga o reparte las frases que no caben, hace que el cierre se diga en voz y deja la mayoría del video en clips. No genera ni gasta nada.</span>
            </div>
            <span className="text-sm font-medium">Traer un plan hecho fuera (JSON)</span>
            <p className="text-sm text-muted-foreground">
              El plan lo propone el sistema; esto es solo para traer uno hecho fuera. Lista de escenas con <code>paso</code>, <code>tipo</code> («generada», «foto-real», «cierre»), <code>duracion</code>, <code>voz</code>, <code>promptImagen</code> y{" "}
              <code>promptVideo</code>. Se le aplican las mismas reglas: cierre al final con foto real, hasta 20 escenas.
            </p>
            <Textarea value={planPegado} rows={4} className="max-h-48 font-mono text-xs" placeholder='{"escenas":[{"paso":1,"tipo":"generada","duracion":4,"voz":"…","promptImagen":"…","promptVideo":"…"}]}' aria-label="Plan en JSON" onChange={(e) => setPlanPegado(e.target.value)} />
            <Button variant="outline" className="self-start" disabled={ocupado || enCurso || !planPegado.trim()} onClick={() => void importarPlan()}>
              Importar plan
            </Button>
          </div>
        </details>
      )}
      {variando && (
        <CrearVariaciones
          proyecto={proyecto}
          analisis={guardado.analisisProducto}
          ocupado={ocupado}
          onCerrar={() => setVariando(false)}
          onCrear={async (pedidos) => {
            enAccion.current = true;
            setAccion("variaciones");
            const r = await crearVariaciones(id, pedidos);
            enAccion.current = false;
            setAccion(null);
            if ("error" in r) {
              toast.error(r.error, { duration: 10000 });
              return false;
            }
            onOtros(r.variaciones);
            setAviso(r.aviso ?? null);
            setVariando(false);
            toast.success(r.aviso ?? "Variaciones creadas");
            return true;
          }}
        />
      )}
      {dialogoConfirmar}
      {revision && (
        <RevisionPiezas
          tope={proyecto.topeIntentos}
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

const EJEMPLO_SUBTITULO: Record<EstiloSubtitulos, React.ReactNode> = {
  palabra: (
    <span className="text-lg font-extrabold text-white">
      Esa pantalla te <span className="rounded bg-primary px-1">roba</span> el sueño
    </span>
  ),
  caja: <span className="rounded-lg bg-primary px-3 py-1 text-lg font-bold text-primary-foreground">te roba el sueño</span>,
  limpio: <span className="text-base font-medium text-white">Esa pantalla te roba el sueño</span>,
  impacto: <span className="text-2xl font-black tracking-tight text-white uppercase">TE ROBA EL SUEÑO</span>,
};

/** Estilo de edición: cómo se ven los subtítulos y qué tan rápido va el montaje. Con ejemplo a la vista. */
function EdicionVideo({ edicion, ocupado, onCambiar }: { edicion: { subtitulos: EstiloSubtitulos; ritmo: Ritmo; titulos?: EstiloTitulos }; ocupado: boolean; onCambiar: (e: { subtitulos?: EstiloSubtitulos; ritmo?: Ritmo; titulos?: EstiloTitulos }) => void }) {
  const SELECT = "h-9 w-full rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3" id="estilo-de-edicion" aria-label="Estilo de edición">
      <div>
        <span className="text-sm font-semibold">Estilo de edición</span>
        <p className="text-sm text-muted-foreground">Cómo se ven los subtítulos y qué tan rápido va el montaje. Sale elegido según el formato; cámbialo si la marca pide otra cosa. No cuesta: solo se vuelve a armar.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Subtítulos
          <select className={SELECT} value={edicion.subtitulos} disabled={ocupado} onChange={(e) => onCambiar({ subtitulos: e.target.value as EstiloSubtitulos })}>
            {ESTILOS_SUBTITULOS.map((k) => (
              <option key={k} value={k}>
                {ESTILO_SUBTITULOS_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Ritmo
          <select className={SELECT} value={edicion.ritmo} disabled={ocupado} onChange={(e) => onCambiar({ ritmo: e.target.value as Ritmo })}>
            {RITMOS.map((k) => (
              <option key={k} value={k}>
                {RITMO_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Títulos de apoyo (arriba)
          <select className={SELECT} value={edicion.titulos ?? "caja"} disabled={ocupado} onChange={(e) => onCambiar({ titulos: e.target.value as EstiloTitulos })}>
            {ESTILOS_TITULOS.map((k) => (
              <option key={k} value={k}>
                {ESTILO_TITULOS_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex min-h-28 flex-col items-center justify-between gap-3 rounded-lg bg-neutral-900 p-3 text-center md:col-span-3" data-ejemplo-subtitulo={edicion.subtitulos} aria-label="Ejemplo: título de apoyo arriba y subtítulo abajo">
          <span className={cn("text-sm font-bold text-white", (edicion.titulos ?? "caja") === "caja" && "rounded bg-primary px-3 py-1", edicion.titulos === "etiqueta" && "rounded-full border border-white/20 bg-neutral-800 px-3 py-1", edicion.titulos === "subrayado" && "border-b-4 border-primary pb-0.5")}>BLOQUEA LA LUZ AZUL</span>
          {EJEMPLO_SUBTITULO[edicion.subtitulos]}
        </div>
      </div>
    </section>
  );
}

/** La tarjeta final del video: la oferta en dos líneas y el color de marca del botón. */
function CierreVideo({ proyecto, ocupado, guardando, onGuardar }: { proyecto: ProyectoVideo; ocupado: boolean; guardando: boolean; onGuardar: (c: { titular: string; detalle: string; color: string; urgencia: string }) => void }) {
  const actual = cierreCompleto(proyecto.contexto.cierre);
  const [titular, setTitular] = useState(actual.titular);
  const [detalle, setDetalle] = useState(actual.detalle);
  const [color, setColor] = useState(actual.color);
  const [urgencia, setUrgencia] = useState(actual.urgencia);
  const sucio = titular !== actual.titular || detalle !== actual.detalle || color.toUpperCase() !== actual.color || urgencia !== actual.urgencia;
  const CAMPO = "h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3" id="cierre-del-video" aria-label="Cierre del video">
      <div>
        <span className="text-sm font-semibold">Cierre del video</span>
        <p className="text-sm text-muted-foreground">La última pantalla: el producto real en grande, la oferta en dos líneas y el botón con el color de la marca. Cambiarlo no cuesta: solo se vuelve a armar.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Titular (grande)
          <input className={CAMPO} value={titular} maxLength={28} disabled={ocupado} placeholder="2x1" onChange={(e) => setTitular(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Detalle (una línea)
          <input className={CAMPO} value={detalle} maxLength={70} disabled={ocupado} placeholder="Dos gafas por 79 €" onChange={(e) => setDetalle(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Color de la marca
          <span className="flex items-center gap-2">
            <input type="color" className="h-9 w-12 cursor-pointer rounded-lg border border-input bg-card p-1" value={color} disabled={ocupado} aria-label="Color de la marca" onChange={(e) => setColor(e.target.value)} />
            <span className="font-mono text-sm text-muted-foreground">{color.toUpperCase()}</span>
          </span>
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Urgencia (solo si es cierta)
        <input className={CAMPO} value={urgencia} maxLength={80} disabled={ocupado} placeholder="2x1 mientras dure la promoción" onChange={(e) => setUrgencia(e.target.value)} />
        <span className="text-sm font-normal text-muted-foreground">La promoción vigente, un plazo o cupo que el cliente haya publicado, o la temporada. Nunca escasez ni fechas inventadas; si no hay nada cierto, déjala vacía.</span>
      </label>
      {/* Así se leerá (el dibujo final lo hace el servidor de videos con la foto real). */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3" data-vista-cierre>
        <div className="min-w-0 flex-1 basis-48">
          <span className="block font-heading text-2xl leading-tight font-bold">{titular || detalle || "Sin oferta"}</span>
          {titular && detalle && <span className="block text-sm">{detalle}</span>}
          {urgencia && <span className="mt-1 block text-xs font-semibold tracking-wide uppercase" style={{ color }}>{urgencia}</span>}
        </div>
        <span className="rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: color }}>
          {proyecto.contexto.cierre.llamadoALaAccion || "Llamado a la acción"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={ocupado || !sucio} onClick={() => onGuardar({ titular: titular.trim(), detalle: detalle.trim(), color, urgencia: urgencia.trim() })}>
          {guardando ? "Guardando…" : sucio ? "Guardar el cierre" : "Cierre guardado"}
        </Button>
        <span className="text-sm text-muted-foreground">La oferta completa («{proyecto.contexto.cierre.oferta || "sin oferta"}») y el llamado se cambian en «Corregir».</span>
      </div>
    </section>
  );
}

function Etapa({ titulo, hecho, total, extra, pulso }: { titulo: string; hecho: number; total: number; extra: string; pulso?: boolean }) {
  const pct = total > 0 ? Math.round((hecho / total) * 100) : 100;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{titulo}</span>
        <span className="font-mono text-sm text-muted-foreground">{total > 0 ? `${hecho}/${total}` : "—"}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={titulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={cn("h-full rounded-full bg-primary transition-[width] duration-500", pulso && "animate-pulse")} style={{ width: `${pulso ? Math.max(pct, 35) : pct}%` }} />
      </div>
      <span className="min-h-4 text-sm text-muted-foreground">{total > 0 ? extra : "No hay escenas generadas"}</span>
    </div>
  );
}

function TarjetaEscena({ e, tope, esCeo, ocupado, onAbrir, onReabrir }: { e: EscenaProyecto; tope: number; esCeo: boolean; ocupado: boolean; onAbrir: () => void; onReabrir: (tipo: TipoPieza) => void }) {
  const generada = e.tipo === "generada";
  const miniatura = generada ? e.imagen.url : e.fotoUrl;
  const enProceso = generada && (e.imagen.estado === "en-cola" || e.imagen.estado === "generando" || e.clip.estado === "en-cola" || e.clip.estado === "generando");
  const topeImagen = generada && e.imagen.intentos >= tope && e.imagen.estado !== "aprobada" && e.imagen.estado !== "por-aprobar";
  const topeClip = generada && e.clip.intentos >= tope && e.clip.estado !== "aprobada" && e.clip.estado !== "por-aprobar";
  return (
    <li className="flex w-40 shrink-0 snap-start flex-col gap-1.5 sm:w-48" data-escena={e.n}>
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
          <span className="px-2 text-center text-xs text-white/60">{generada ? "Sin imagen todavía" : "Falta la foto"}</span>
        )}
        <span className="absolute top-1.5 left-1.5 flex size-8 items-center justify-center rounded-full bg-black/75 text-sm font-bold text-white">{e.n}</span>
        {enProceso && <span className="absolute inset-x-0 bottom-0 animate-pulse bg-primary/90 py-1 text-center text-xs font-medium text-primary-foreground">Generando…</span>}
        {generada && e.clip.url && !enProceso && <Film className="absolute right-1.5 bottom-1.5 size-4 text-white drop-shadow" aria-label="Tiene clip" />}
      </button>
      <span className="line-clamp-2 text-sm font-semibold">{e.titulo || NOMBRE_PASO[e.paso]}</span>
      <span className="text-sm text-muted-foreground">
        {generada ? "Generada" : e.tipo === "cierre" ? "Cierre" : "Foto real"} · {e.duracion} s
      </span>
      {generada ? (
        <span className="flex flex-col gap-1">
          <Chip tono={TONO_PIEZA[e.imagen.estado]}>
            Imagen · {ESTADO_PIEZA_LABELS[e.imagen.estado]}
          </Chip>
          {e.imagen.revision && e.imagen.revision.veredicto !== "sin-ia" && (
            <Chip tono={e.imagen.revision.veredicto === "aprobada-auto" ? "verde" : e.imagen.revision.veredicto === "rechazada-auto" ? "rojo" : "ambar"}>{VEREDICTO_LABELS[e.imagen.revision.veredicto].replace(": decide una persona", "")}</Chip>
          )}
          <Chip tono={TONO_PIEZA[e.clip.estado]}>
            Clip · {ESTADO_PIEZA_LABELS[e.clip.estado]}
          </Chip>
          {(topeImagen || topeClip) && (
            <span className="text-xs leading-snug text-destructive">
              Tope de {tope} intentos: no se regenera más.
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

  async function crear(heredarDe?: number, directo = false) {
    if (!guardado) return;
    setOcupado(true);
    const r = await crearProyecto(guardado.id, { fotos, ficha, ...(heredarDe ? { heredarDe } : {}), directo });
    setOcupado(false);
    if ("error" in r) return void toast.error(r.error, { duration: 10000 });
    onGuardado(r.guardado, false);
    toast.success(heredarDe ? `Proyecto traído de la v${heredarDe}` : directo ? "Proyecto en modo directo: avanza solo hasta donde pueda" : "Plan de escenas listo: revísalo antes de generar");
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
      <p className="text-sm font-medium">Video por escenas, con revisión en cada paso</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        El guion se parte en escenas. Primero se generan las imágenes base (centavos) y las apruebas; solo de las aprobadas se generan los clips; el armado no cuesta. Las escenas del producto y el cierre usan
        tus fotos reales, animadas: el producto sale idéntico y cuestan cero.
        {!activo ? " El plan se puede armar ya; la generación se activa al conectar el servidor de videos." : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!guardado || ocupado || bloqueado || !fotos.length} onClick={() => void crear()}>
          <Clapperboard /> {ocupado ? "Armando el plan…" : "Convertir en proyecto por escenas"}
        </Button>
        <Button variant="outline" disabled={!guardado || ocupado || bloqueado || !fotos.length || !ficha.confirmado} title={ficha.confirmado ? undefined : "Confirma primero la ficha del producto"} onClick={() => void crear(undefined, true)}>
          <Play /> Seguir en modo directo
        </Button>
        {anterior && (
          <Button variant="outline" disabled={ocupado || bloqueado || !fotos.length} onClick={() => void crear(anterior.n)}>
            Traer el proyecto de la v{anterior.n}
          </Button>
        )}
        {!guardado && <span className="text-sm text-muted-foreground">Guarda el guion primero.</span>}
        {guardado && sinGuardar && <span className="text-xs text-amber-700 dark:text-amber-300">Hay cambios sin guardar: el plan sale de la versión guardada (v{vigente?.n}).</span>}
        {guardado && !fotos.length && <span className="text-xs text-amber-700 dark:text-amber-300">Sube al menos una foto real del producto (arriba, junto a los datos).</span>}
        {guardado && fotos.length > 0 && !ficha.confirmado && <span className="text-xs text-amber-700 dark:text-amber-300">Para el modo directo falta confirmar la ficha del producto (arriba).</span>}
      </div>
    </div>
  );
}
