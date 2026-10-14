"use client";

import { useConfirmar } from "./progreso-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Clapperboard, Copy, Lock, RefreshCw, Send, X } from "lucide-react";
import {
  aprobarVideo,
  cancelarVideo,
  consultarVideos,
  solicitarVideo,
  usarVideoEnProspecto,
  type EstadoVideos,
} from "@/app/(protected)/videos/actions";
import {
  ESTADO_TRABAJO_LABELS,
  MAX_IMAGENES_PRODUCTO,
  TONO_TRABAJO,
  trabajoActivo,
  type TrabajoVista,
} from "@/lib/trabajos-video";
import { versionVigente, type GuionGuardado } from "@/lib/videos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ETIQUETA } from "@/components/prospectos/piezas";

/** Cada cuánto se consulta el estado mientras hay un video en proceso y la pestaña está a la vista. */
const SONDEO_MS = 5000;

export function fechaCorta(iso: string | null) {
  if (!iso) return "—";
  // Zona fija: el servidor y el navegador deben escribir lo mismo.
  return new Date(iso).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });
}

export function costoTexto(t: Pick<TrabajoVista, "costoEstimadoUsd" | "segundosGenerados">): string {
  const seg = t.segundosGenerados ? `${t.segundosGenerados} s generados` : "";
  const usd = t.costoEstimadoUsd !== null ? `≈ US$ ${t.costoEstimadoUsd.toFixed(2)}` : "";
  return [seg, usd].filter(Boolean).join(" · ") || "—";
}

/** Lo que cambia en un guion cuando llega o se aprueba un video. */
const huellaVideos = (g: GuionGuardado) => g.versiones.map((v) => `${v.n}|${v.videoUrl}|${v.videoTrabajoId}|${v.videoAprobado?.fecha}`).join(";");

type Props = {
  /** Hay servidor de videos conectado (existe SERVIDOR_SECRET). */
  activo: boolean;
  /** Fotos del producto (enlaces https, uno por línea). Las comparte con el paso 02, donde se suben. */
  fotos: string;
  onFotos: (texto: string) => void;
  guardado: GuionGuardado | null;
  sinGuardar: boolean;
  bloqueado: boolean;
  puedeAprobar: boolean;
  puedeUsarEnProspecto: boolean;
  onGuardado: (g: GuionGuardado, cargar: boolean) => void;
};

export function GenerarVideo({ activo, fotos, onFotos: setFotos, guardado, sinGuardar, bloqueado, puedeAprobar, puedeUsarEnProspecto, onGuardado }: Props) {
  const [confirmar, dialogoConfirmar] = useConfirmar();
  const [subtitulos, setSubtitulos] = useState(true);
  const [voz, setVoz] = useState(true);
  const [modelo, setModelo] = useState("");
  const [trabajos, setTrabajos] = useState<TrabajoVista[]>([]);
  const [tope, setTope] = useState<EstadoVideos["tope"] | null>(null);
  const [accion, setAccion] = useState<string | null>(null);

  const id = guardado?.id ?? null;
  const vigente = guardado ? versionVigente(guardado) : null;
  const huella = useRef("");
  const alGuardar = useRef(onGuardado);
  useEffect(() => {
    alGuardar.current = onGuardado;
    huella.current = guardado ? huellaVideos(guardado) : "";
  });

  const recibir = useCallback((r: EstadoVideos) => {
    setTrabajos(r.trabajos);
    setTope(r.tope);
    // El guion solo se actualiza arriba si de verdad cambió algo de sus videos.
    if (huellaVideos(r.guardado) !== huella.current) alGuardar.current(r.guardado, false);
  }, []);

  // Al abrir un guion, y cada vez que su versión vigente estrena trabajo (p. ej. al
  // regenerar con una corrección): cómo van sus videos.
  const trabajoVigenteId = vigente?.videoTrabajoId ?? null;
  useEffect(() => {
    if (!activo || !id) return;
    let vivo = true;
    void consultarVideos(id).then((r) => {
      if (vivo && !("error" in r)) recibir(r);
    });
    return () => {
      vivo = false;
    };
  }, [activo, id, trabajoVigenteId, recibir]);

  // Estado en vivo: mientras haya un video en proceso se consulta cada pocos segundos.
  const propios = useMemo(() => (id ? trabajos.filter((t) => t.guionId === id) : []), [trabajos, id]);
  const hayActivo = propios.some((t) => trabajoActivo(t.estado));
  useEffect(() => {
    if (!activo || !id || !hayActivo) return;
    let vivo = true;
    let enVuelo = false;
    const reloj = window.setInterval(() => {
      if (document.hidden || enVuelo) return;
      enVuelo = true;
      void consultarVideos(id)
        .then((r) => {
          if (vivo && !("error" in r)) recibir(r);
        })
        .finally(() => {
          enVuelo = false;
        });
    }, SONDEO_MS);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
    };
  }, [activo, id, hayActivo, recibir]);

  if (!activo) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
        <Button disabled title="Se activa al conectar el servidor de videos">
          <Lock /> Generar video
        </Button>
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
          Se activa al conectar el servidor de videos (variable <code>SERVIDOR_SECRET</code>): generará el video de la
          versión vigente del guion y lo dejará ligado a esa versión, por aprobar. Mientras tanto, abajo están los prompts
          por escena del formato, con tus datos, para generarlos a mano.
        </p>
      </div>
    );
  }

  const trabajoVigente = vigente?.videoTrabajoId ? (propios.find((t) => t.id === vigente.videoTrabajoId) ?? null) : null;
  const enProceso = !!trabajoVigente && trabajoActivo(trabajoVigente.estado);
  const yaTuvoVideo = !!vigente?.videoUrl || !!trabajoVigente;
  const topeLleno = !!tope && tope.usados >= tope.max;
  const ocupado = !!accion || bloqueado;
  const conVideo = guardado ? [...guardado.versiones].reverse().filter((v) => v.videoUrl) : [];

  async function correr<T extends object>(nombre: string, fn: () => Promise<T | { error: string }>): Promise<T | null> {
    setAccion(nombre);
    const r = await fn();
    setAccion(null);
    if ("error" in r) {
      toast.error(r.error, { duration: 10000 });
      return null;
    }
    return r;
  }

  async function pedir() {
    if (!guardado || !vigente) return void toast.error("Guarda el guion antes de generar el video.");
    if (sinGuardar && !(await confirmar(`Tienes cambios sin guardar. El video se genera con la versión guardada (v${vigente.n}), no con lo que hay en el editor.`))) return;
    if (vigente.videoUrl && !(await confirmar(`La v${vigente.n} ya tiene video. Se genera uno nuevo, que lo reemplaza y vuelve a quedar por aprobar.`, { titulo: "¿Generar otro video?", si: "Sí, generar" }))) return;
    const imagenesProducto = fotos
      .split(/\s+/)
      .map((x) => x.trim())
      .filter(Boolean);
    const r = await correr("pedir", () => solicitarVideo(guardado.id, { imagenesProducto, subtitulos, voz, modelo }));
    if (!r) return;
    recibir(r);
    toast.success(`Video de la v${vigente.n} en cola: el servidor lo toma en menos de un minuto`);
  }

  async function cancelar(t: TrabajoVista) {
    if (!guardado) return;
    const r = await correr("cancelar", () => cancelarVideo(guardado.id, t.id));
    if (!r) return;
    recibir(r);
    toast.success("Video cancelado");
  }

  async function aprobar(n: number) {
    if (!guardado) return;
    if (!(await confirmar("A partir de aquí se puede copiar su enlace y pasarlo al prospecto.", { titulo: `¿Aprobar el video de la v${n}?`, si: "Sí, aprobar" }))) return;
    const r = await correr(`aprobar:${n}`, () => aprobarVideo(guardado.id, n));
    if (!r) return;
    onGuardado(r.guardado, false);
    toast.success(`Video de la v${n} aprobado`);
  }

  async function alProspecto(n: number) {
    if (!guardado) return;
    if (!(await confirmar(`Esto reemplaza la pieza actual de la ficha del prospecto por el video de la v${n}.`, { titulo: "¿Usar este video en el prospecto?", si: "Sí, reemplazar" }))) return;
    const r = await correr(`prospecto:${n}`, () => usarVideoEnProspecto(guardado.id, n));
    if (r) toast.success("Video puesto en la ficha del prospecto");
  }

  async function copiarEnlace(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace del video copiado");
    } catch {
      toast.error("No se pudo copiar. Abre el video y copia su dirección.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pedir */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
          <Label className="flex flex-col items-stretch gap-1.5">
            <span>Fotos reales del producto (enlaces https, uno por línea, hasta {MAX_IMAGENES_PRODUCTO})</span>
            <Textarea
              value={fotos}
              onChange={(e) => setFotos(e.target.value)}
              rows={2}
              placeholder="https://tienda.com/fotos/producto-frente.jpg"
              aria-label="Fotos del producto"
            />
            <span className="text-xs font-normal text-muted-foreground">
              Las escenas donde aparece el producto se generan a partir de la primera foto, para no inventar el envase. Las
              que subas en el paso 02 (arrastrando o con Ctrl+V) aparecen aquí solas.
            </span>
          </Label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={subtitulos} onChange={(e) => setSubtitulos(e.target.checked)} />
              Subtítulos quemados
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={voz} onChange={(e) => setVoz(e.target.checked)} />
              Voz (si el servidor tiene ElevenLabs)
            </label>
            <Input
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              maxLength={160}
              placeholder="Modelo (opcional): el del servidor"
              aria-label="Modelo de video preferido"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!guardado || ocupado || enProceso || topeLleno} onClick={pedir}>
            {yaTuvoVideo ? <RefreshCw className={cn(accion === "pedir" && "animate-spin")} /> : <Clapperboard />}
            {accion === "pedir" ? "Encolando…" : yaTuvoVideo ? `Regenerar video de la v${vigente?.n ?? 1}` : "Generar video"}
          </Button>
          {tope && (
            <Chip tono={topeLleno ? "ambar" : "neutro"}>
              Hoy: {tope.usados} de {tope.max} videos
            </Chip>
          )}
          {!guardado && <span className="text-xs text-muted-foreground">Guarda el guion para poder generar su video.</span>}
          {topeLleno && (
            <span className="text-xs text-amber-700 dark:text-amber-300">
              Se alcanzó el tope diario de {tope.max} videos. Mañana se libera.
            </span>
          )}
        </div>
      </div>

      {/* Estado en vivo del video de la versión vigente */}
      {trabajoVigente && trabajoVigente.estado !== "listo" && (
        <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tono={TONO_TRABAJO[trabajoVigente.estado]}>{ESTADO_TRABAJO_LABELS[trabajoVigente.estado]}</Chip>
            <span className="text-sm font-medium">Video de la v{trabajoVigente.version}</span>
            <span className="text-xs text-muted-foreground">
              pedido {fechaCorta(trabajoVigente.creadoAt)} · intento {Math.max(1, trabajoVigente.intentos)} de {trabajoVigente.maxIntentos}
            </span>
            {trabajoVigente.estado === "pendiente" && (
              <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => cancelar(trabajoVigente)}>
                <X /> Cancelar
              </Button>
            )}
          </div>
          {enProceso && <BarraProgreso t={trabajoVigente} />}
          {trabajoVigente.motivo && (
            <p className="text-xs leading-relaxed break-words">
              <strong className="font-medium">{trabajoVigente.estado === "fallo" ? "Motivo:" : "Último intento:"}</strong> {trabajoVigente.motivo}
              {trabajoVigente.estado === "pendiente" && trabajoVigente.noAntesDe ? ` Se reintenta ${fechaCorta(trabajoVigente.noAntesDe)}.` : ""}
            </p>
          )}
          {trabajoVigente.avisos.map((a) => (
            <p key={a} className="text-xs leading-relaxed text-muted-foreground">
              {a}
            </p>
          ))}
        </div>
      )}

      {/* Videos terminados, cada uno ligado a su versión */}
      {conVideo.map((v) => {
        const t = propios.find((x) => x.id === v.videoTrabajoId) ?? null;
        const aprobado = !!v.videoAprobado;
        return (
          <div key={v.n} className="grid gap-3 rounded-xl border border-border bg-card p-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <video
              controls
              preload="metadata"
              playsInline
              src={v.videoUrl ?? undefined}
              className="aspect-[9/16] w-full rounded-lg border border-border bg-black object-contain"
              aria-label={`Video de la versión ${v.n}`}
            />
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-sm font-semibold">v{v.n}</span>
                {v.n === vigente?.n && <Chip tono="azul">Vigente</Chip>}
                <Chip tono={aprobado ? "verde" : "ambar"}>{aprobado ? "Aprobado" : "Por aprobar"}</Chip>
                {t?.resultado?.sinVoz && <Chip>Sin voz</Chip>}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {aprobado
                  ? `Aprobado por ${v.videoAprobado?.por || "—"} · ${fechaCorta(v.videoAprobado?.fecha ?? null)}.`
                  : "Nada generado sale sin un sí: míralo completo. Hasta que alguien del equipo comercial lo apruebe no se puede copiar ni pasar al prospecto."}
              </p>
              {t && (
                <p className="text-xs text-muted-foreground">
                  {t.resultado?.duracion ? `${Math.round(t.resultado.duracion)} s · ` : ""}
                  {t.escenas.length} escenas · {t.resultado?.proveedor || "servidor"} · {costoTexto(t)} · entregado {fechaCorta(t.terminadoAt)}
                </p>
              )}
              {t?.resultado?.avisos.map((a) => (
                <p key={a} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
                  {a}
                </p>
              ))}
              <div className="mt-auto flex flex-wrap gap-2">
                {!aprobado && puedeAprobar && (
                  <Button disabled={ocupado || (v.n === vigente?.n && enProceso)} onClick={() => aprobar(v.n)}>
                    <Check /> {accion === `aprobar:${v.n}` ? "Aprobando…" : "Aprobar"}
                  </Button>
                )}
                {!aprobado && !puedeAprobar && (
                  <span className="text-xs text-muted-foreground">Lo aprueba el equipo comercial (CEO, gerente comercial o directora operativa).</span>
                )}
                {aprobado && v.videoUrl && (
                  <Button variant="outline" onClick={() => copiarEnlace(v.videoUrl as string)}>
                    <Copy /> Copiar enlace
                  </Button>
                )}
                {aprobado && puedeUsarEnProspecto && guardado?.prospectoId && (
                  <Button variant="outline" disabled={ocupado} onClick={() => alProspecto(v.n)}>
                    <Send /> {accion === `prospecto:${v.n}` ? "Pasando…" : "Usar en el prospecto"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {dialogoConfirmar}
    </div>
  );
}

function BarraProgreso({ t }: { t: TrabajoVista }) {
  const p = t.progreso;
  const pct = p && p.total > 0 ? Math.min(100, Math.round((p.hecho / p.total) * 100)) : t.estado === "montando" ? 90 : t.estado === "pendiente" ? 0 : 5;
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className={cn(ETIQUETA, "normal-case tracking-normal")}>
        {t.estado === "pendiente"
          ? "Esperando a que el servidor lo tome (pregunta cada minuto)."
          : p?.detalle || ESTADO_TRABAJO_LABELS[t.estado]}
        {t.trabajador ? ` · ${t.trabajador}` : ""}
      </span>
    </div>
  );
}
