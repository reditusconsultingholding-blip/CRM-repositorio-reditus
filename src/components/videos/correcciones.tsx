"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Eye, GitCompare, History, RefreshCw, RotateCcw, Save, X } from "lucide-react";
import {
  cambiarEstadoGuion,
  guardarGuionVideo,
  regenerarConCorreccion,
  registrarCorreccion,
  restaurarVersion,
} from "@/app/(protected)/videos/actions";
import {
  ESTADOS_GUION,
  ESTADO_GUION_LABELS,
  MAX_CORRECCION,
  ORIGEN_LABELS,
  diffLineas,
  versionVigente,
  type DatosVideo,
  type EstadoGuion,
  type GuionGuardado,
  type VersionGuion,
} from "@/lib/videos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Chip, ETIQUETA } from "@/components/prospectos/piezas";

export const TONO_ESTADO: Record<EstadoGuion, "neutro" | "azul" | "ambar" | "verde"> = {
  borrador: "neutro",
  enviado: "azul",
  correccion_pendiente: "ambar",
  aprobado: "verde",
};

function fecha(iso: string) {
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

type Props = {
  /** El guion guardado que está abierto; null si todavía no se ha guardado. */
  guardado: GuionGuardado | null;
  /** Lo que hay ahora mismo en el editor del guion. */
  guionActual: string;
  datos: DatosVideo;
  prospectoId: string | null;
  sinGuardar: boolean;
  bloqueado: boolean;
  /** `cargar`: el editor debe mostrar el guion vigente que devolvió el servidor. */
  onGuardado: (g: GuionGuardado, cargar: boolean) => void;
};

type Accion = "pendiente" | "ia" | "estado" | `ia:${string}` | `mano:${string}` | `restaurar:${number}` | null;

export function CorreccionesCliente({ guardado, guionActual, datos, prospectoId, sinGuardar, bloqueado, onGuardado }: Props) {
  const [texto, setTexto] = useState("");
  const [accion, setAccion] = useState<Accion>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [vista, setVista] = useState<{ n: number; modo: "ver" | "comparar" } | null>(null);

  const vigente = guardado ? versionVigente(guardado) : null;
  const versiones = useMemo(() => (guardado ? [...guardado.versiones].reverse() : []), [guardado]);
  const correcciones = useMemo(() => (guardado ? [...guardado.correcciones].reverse() : []), [guardado]);
  const ocupado = !!accion || bloqueado;

  if (!guardado || !vigente) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs text-primary">06</span>Correcciones del cliente y versiones
            </span>
          </CardTitle>
          <CardDescription>
            Guarda el guion primero. Después podrás pegar aquí lo que corrija el cliente, regenerar con esa corrección y
            ver todas las versiones.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const id = guardado.id;

  async function correr(a: Accion, fn: () => Promise<{ guardado: GuionGuardado; aviso?: string } | { error: string }>, cargar: boolean, ok: string) {
    setAccion(a);
    setAviso(null);
    const r = await fn();
    setAccion(null);
    if ("error" in r) {
      toast.error(r.error, { duration: 9000 });
      return false;
    }
    // Solo se pisa el editor si el servidor de verdad creó una versión nueva.
    const hayVersionNueva = versionVigente(r.guardado)?.n !== vigente?.n;
    onGuardado(r.guardado, cargar && hayVersionNueva);
    setAviso(r.aviso ?? null);
    if (r.aviso) toast.warning("La corrección quedó pendiente", { duration: 7000 });
    else toast.success(ok);
    return true;
  }

  function confirmarPisar() {
    return !sinGuardar || window.confirm("Tienes cambios sin guardar en el guion. La versión corregida los reemplaza en el editor. ¿Continuar?");
  }

  async function registrar(regenerar: boolean) {
    if (regenerar && !confirmarPisar()) return;
    const listo = await correr(
      regenerar ? "ia" : "pendiente",
      () => registrarCorreccion(id, texto, regenerar),
      regenerar,
      regenerar ? "Guion regenerado con la corrección" : "Corrección guardada como pendiente",
    );
    if (listo) setTexto("");
  }

  const antes = vista ? guardado.versiones.find((v) => v.n === vista.n) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs text-primary">06</span>Correcciones del cliente y versiones
          </span>
        </CardTitle>
        <CardDescription>
          Pega lo que escribió el cliente y regenera: la IA cambia solo lo que pide la corrección y deja una versión
          nueva. Ninguna versión se pierde.
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Chip tono="azul">Versión vigente: v{vigente.n}</Chip>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Estado */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={ETIQUETA}>Estado</span>
          <Select
            items={ESTADO_GUION_LABELS}
            value={guardado.estado}
            disabled={ocupado}
            onValueChange={(v) => {
              if (!v || v === guardado.estado) return;
              void correr("estado", () => cambiarEstadoGuion(id, v as EstadoGuion), false, "Estado actualizado");
            }}
          >
            <SelectTrigger className="w-64" aria-label="Estado del guion">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS_GUION.map((e) => (
                <SelectItem key={e} value={e}>
                  {ESTADO_GUION_LABELS[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Chip tono={TONO_ESTADO[guardado.estado]}>{ESTADO_GUION_LABELS[guardado.estado]}</Chip>
        </div>

        {/* Nueva corrección */}
        <div className="flex flex-col gap-2">
          <span className={ETIQUETA}>Corrección que mandó el cliente</span>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={MAX_CORRECCION}
            rows={3}
            placeholder="Pégala tal cual la escribió: «el precio ya no es ese», «que no diga doctor», «más corto el inicio»…"
            aria-label="Corrección del cliente"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!texto.trim() || ocupado} onClick={() => registrar(true)}>
              <RefreshCw className={cn(accion === "ia" && "animate-spin")} />
              {accion === "ia" ? "Regenerando…" : "Regenerar con esta corrección"}
            </Button>
            <Button variant="outline" disabled={!texto.trim() || ocupado} onClick={() => registrar(false)}>
              <Save /> Guardar como pendiente
            </Button>
            <span className="text-xs text-muted-foreground">
              Hoy se regeneran el guion y los prompts por escena; el video se regenerará igual cuando se conecte el
              modelo.
            </span>
          </div>
          {aviso && (
            <p
              role="status"
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300"
            >
              {aviso}
            </p>
          )}
        </div>

        {/* Correcciones registradas */}
        {correcciones.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className={ETIQUETA}>Correcciones registradas</span>
            {correcciones.map((c) => (
              <div key={c.id} className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Chip tono={c.estado === "pendiente" ? "ambar" : "verde"}>
                    {c.estado === "pendiente" ? "Pendiente" : `Aplicada en v${c.version ?? "?"}`}
                  </Chip>
                  <span>
                    Registrada por {c.registradaPor || "—"} · {fecha(c.fecha)}
                  </span>
                </div>
                <p className="text-sm break-words whitespace-pre-wrap">{c.texto}</p>
                {c.estado === "pendiente" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={ocupado}
                      onClick={() => {
                        if (!confirmarPisar()) return;
                        void correr(`ia:${c.id}`, () => regenerarConCorreccion(id, c.id), true, "Guion regenerado con la corrección");
                      }}
                    >
                      <RefreshCw className={cn(accion === `ia:${c.id}` && "animate-spin")} /> Regenerar con IA
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={ocupado || !guionActual.trim() || guionActual === guardado.guion}
                      title="Edita el guion arriba con lo que pidió el cliente y luego márcala como aplicada: se guarda una versión nueva ligada a esta corrección"
                      onClick={() =>
                        void correr(
                          `mano:${c.id}`,
                          () => guardarGuionVideo({ id, datos, guion: guionActual, origen: "manual", prospectoId, correccionId: c.id }),
                          false,
                          "Corrección aplicada: versión nueva guardada",
                        )
                      }
                    >
                      <Check /> Marcar aplicada con el guion editado
                    </Button>
                    {guionActual === guardado.guion && (
                      <span className="self-center text-xs text-muted-foreground">
                        Para aplicarla a mano, edita primero el guion en el paso 04.
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Versiones */}
        <div className="flex flex-col gap-2">
          <span className={cn(ETIQUETA, "flex items-center gap-1.5")}>
            <History className="size-3.5" /> Historial de versiones ({versiones.length})
          </span>
          {versiones.map((v) => {
            const esVigente = v.n === vigente.n;
            return (
              <div
                key={v.n}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border p-3 md:flex-row md:items-start md:justify-between",
                  esVigente ? "border-primary/40 bg-primary/10" : "border-border bg-muted/30",
                )}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-sm font-semibold">v{v.n}</span>
                    {esVigente && <Chip tono="azul">Vigente</Chip>}
                    <Chip>{ORIGEN_LABELS[v.origen]}</Chip>
                    {v.restauradaDe && <Chip>Restaurada de v{v.restauradaDe}</Chip>}
                    {v.videoUrl && (
                      <a href={v.videoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                        Ver video de esta versión
                      </a>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {v.autorNombre || "—"} · {fecha(v.fecha)}
                    </span>
                  </div>
                  {v.correccion && (
                    <p className="text-xs break-words text-muted-foreground">
                      <strong className="font-medium text-foreground">Corrección del cliente:</strong> {v.correccion}
                    </p>
                  )}
                  {v.queCambio && (
                    <p className="text-xs break-words whitespace-pre-wrap">
                      <strong className="font-medium">Qué cambió:</strong> {v.queCambio}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setVista({ n: v.n, modo: "ver" })}>
                    <Eye /> Ver
                  </Button>
                  {!esVigente && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setVista({ n: v.n, modo: "comparar" })}>
                        <GitCompare /> Comparar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={ocupado}
                        onClick={() => {
                          if (!confirmarPisar()) return;
                          if (!window.confirm(`Se creará la v${vigente.n + 1} con el texto de la v${v.n}. La v${vigente.n} se conserva. ¿Restaurar?`)) return;
                          void correr(`restaurar:${v.n}`, () => restaurarVersion(id, v.n), true, `Versión ${v.n} restaurada`);
                        }}
                      >
                        <RotateCcw /> Restaurar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Visor */}
        {vista && antes && (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {vista.modo === "ver" ? `Versión ${antes.n}` : `Qué cambió de la v${antes.n} a la vigente (v${vigente.n})`}
              </span>
              <Button variant="ghost" size="icon-sm" aria-label="Cerrar" onClick={() => setVista(null)}>
                <X />
              </Button>
            </div>
            {vista.modo === "ver" ? <VerVersion v={antes} /> : <Diferencias antes={antes.guion} despues={vigente.guion} nAntes={antes.n} nDespues={vigente.n} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VerVersion({ v }: { v: VersionGuion }) {
  return (
    <div className="flex flex-col gap-2">
      <pre className="max-h-[480px] overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap">
        {v.guion}
      </pre>
      {v.escenas.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-primary outline-none hover:underline focus-visible:underline">
            Prompts por escena de esta versión ({v.escenas.length})
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {v.escenas.map((e) => (
              <div key={e.escena} className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-1 text-xs font-medium">{e.escena}</p>
                <pre className="font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap">{e.prompt}</pre>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Diferencias({ antes, despues, nAntes, nDespues }: { antes: string; despues: string; nAntes: number; nDespues: number }) {
  const lineas = useMemo(() => diffLineas(antes, despues), [antes, despues]);
  const cambios = lineas.filter((l) => l.tipo !== "igual").length;
  if (!cambios) return <p className="text-sm text-muted-foreground">Las dos versiones tienen el mismo texto.</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">− estaba en la v{nAntes}</span>
        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">+ está en la v{nDespues}</span>
      </p>
      <div className="max-h-[480px] overflow-y-auto rounded-lg border border-border bg-muted/30 py-2 font-mono text-[12.5px] leading-relaxed">
        {lineas.map((l, i) => (
          <div
            key={i}
            data-diff={l.tipo}
            className={cn(
              "flex gap-2 px-3 break-words whitespace-pre-wrap",
              l.tipo === "quita" && "bg-destructive/10 text-destructive",
              l.tipo === "pone" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            )}
          >
            <span aria-hidden="true" className="w-3 shrink-0 select-none">
              {l.tipo === "quita" ? "−" : l.tipo === "pone" ? "+" : ""}
            </span>
            <span className="min-w-0">{l.texto || " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
