"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Clapperboard,
  Copy,
  ExternalLink,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import {
  actualizarDatos,
  asignarEditor,
  cambiarEtapa,
  guardarGuion,
  guardarMensaje,
  marcarEnviado,
  redactarMensaje,
  regenerarGuion,
} from "@/app/(protected)/prospectos/prospeccion-actions";
import {
  CALENDLY_URL,
  CANALES,
  CANAL_LABELS,
  ETAPAS,
  ETAPA_LABELS,
  PIEZA,
  PRODUCCION_LABELS,
  SERVICIOS,
  SERVICIO_LABELS,
  produccion,
  urlTienda,
  type Canal,
  type Etapa,
  type Prospeccion,
  type Servicio,
} from "@/lib/prospeccion";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Chip, ETIQUETA, Segmento } from "./piezas";
import { SubirPieza } from "./subir-pieza";
import { CorreosProspecto } from "./correos-prospecto";
import type { CorreosProspecto as Correos } from "@/lib/prospeccion-correo";

export type DetalleProps = {
  id: string;
  nombre: string;
  whatsapp: string | null;
  email: string | null;
  notas: string | null;
  creado: string;
  etapa: Etapa;
  pros: Prospeccion;
  asignables: { id: string; name: string }[];
  /** Prospección por correo: línea de tiempo y permisos (ver `correos-prospecto.tsx`). */
  correo?: { correos: Correos; falta: string | null; sinConfirmar: boolean; puedeAutorizar: boolean };
};

const SIN_ASIGNAR = "__nadie__";

async function copiar(texto: string, aviso: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
  } catch {
    toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano.");
  }
}

function fecha(iso: string) {
  // Zona fija: el servidor y el navegador deben escribir lo mismo.
  return new Date(iso).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });
}

function Paso({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="font-mono text-xs text-primary">{n}</span>
      {children}
    </span>
  );
}

export function ProspectoDetalle(props: DetalleProps) {
  const { id, pros, etapa } = props;
  const pieza = PIEZA[pros.servicio];
  const tienda = urlTienda(pros.tienda);
  const estadoProduccion = produccion(pros);
  const terminado = !!pros.video_terminado_at && !!pros.video_url;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Link href="/prospectos" className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Prospectos
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold tracking-tight break-words">{props.nombre}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip tono="azul">{SERVICIO_LABELS[pros.servicio]}</Chip>
              <Chip>{CANAL_LABELS[pros.canal]}</Chip>
              {etapa === "falta_enviar_video" && (
                <Chip tono={estadoProduccion === "listo" ? "verde" : "ambar"}>{PRODUCCION_LABELS[estadoProduccion]}</Chip>
              )}
              <span className="text-xs text-muted-foreground">Creado el {fecha(props.creado)}</span>
            </div>
          </div>
          {tienda && (
            <a
              href={tienda}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-ring/60"
            >
              <ExternalLink className="size-3.5" /> Abrir tienda
            </a>
          )}
        </div>
        <BarraEtapas id={id} etapa={etapa} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Datos {...props} />
          <Historial pros={pros} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Guion key={`g-${pros.guion_generado_at}-${pros.guion.length}`} id={id} pros={pros} />

          <Card>
            <CardHeader>
              <CardTitle>
                <Paso n="02">Producción</Paso>
              </CardTitle>
              <CardDescription>
                Asigna a quien hace {pieza === "video" ? "el video" : "la muestra"}. Esa persona lo ve en «Mis videos», lo sube y
                lo marca terminado. También puedes subirlo aquí.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Asignar id={id} editorId={pros.editor_id} asignables={props.asignables} bloqueado={terminado} />
              <SubirPieza
                id={id}
                servicio={pros.servicio}
                videoUrl={pros.video_url}
                videoNombre={pros.video_nombre}
                terminado={terminado}
                puedeReabrir
              />
            </CardContent>
          </Card>

          <Mensaje key={`m-${pros.mensaje.length}-${pros.mensaje.slice(0, 24)}`} id={id} pros={pros} etapa={etapa} terminado={terminado} />

          {props.correo && pros.canal === "correo" && <CorreosProspecto id={id} pais={pros.pais} {...props.correo} />}
        </div>
      </div>
    </div>
  );
}

function BarraEtapas({ id, etapa }: { id: string; etapa: Etapa }) {
  const [pending, startTransition] = useTransition();
  const actual = ETAPAS.indexOf(etapa);
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Etapa del prospecto">
      {ETAPAS.map((e, i) => {
        const activa = e === etapa;
        const pasada = i < actual && etapa !== "descartado" && e !== "descartado";
        return (
          <button
            key={e}
            type="button"
            disabled={pending || activa}
            aria-pressed={activa}
            onClick={() =>
              startTransition(async () => {
                const r = await cambiarEtapa(id, e);
                if (r.error) toast.error(r.error);
              })
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              activa
                ? e === "descartado"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-primary bg-primary text-primary-foreground"
                : pasada
                  ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border bg-card text-muted-foreground hover:border-ring/60 hover:text-foreground",
              pending && "opacity-60",
            )}
          >
            {pasada && <Check className="size-3" />}
            {ETAPA_LABELS[e]}
          </button>
        );
      })}
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={ETIQUETA}>{etiqueta}</span>
      <div className="text-sm break-words whitespace-pre-wrap">{children}</div>
    </div>
  );
}

function Datos(props: DetalleProps) {
  const { id, pros } = props;
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();
  const [servicio, setServicio] = useState<Servicio>(pros.servicio);
  const [canal, setCanal] = useState<Canal>(pros.canal);
  const tienda = urlTienda(pros.tienda);
  const ads = urlTienda(pros.ads_library);

  function guardar(formData: FormData) {
    startTransition(async () => {
      const r = await actualizarDatos(id, formData);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Datos guardados");
        setEditando(false);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>El prospecto</CardTitle>
        <CardAction>
          {!editando && (
            <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
              <Pencil /> Editar
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {editando ? (
          <form action={guardar} className="flex flex-col gap-3">
            <Segmento name="servicio" value={servicio} onChange={setServicio} opciones={SERVICIOS} etiquetas={SERVICIO_LABELS} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d-nombre">Nombre o marca</Label>
              <Input id="d-nombre" name="nombre" defaultValue={props.nombre} required maxLength={160} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d-tienda">Tienda (URL)</Label>
              <Input id="d-tienda" name="tienda" defaultValue={pros.tienda} required maxLength={300} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-producto">Producto</Label>
                <Input id="d-producto" name="producto" defaultValue={pros.producto} required maxLength={240} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-pais">País</Label>
                <Input id="d-pais" name="pais" defaultValue={pros.pais} maxLength={60} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d-falencia">Falencia detectada</Label>
              <Textarea id="d-falencia" name="falencia" defaultValue={pros.falencia} rows={3} maxLength={2000} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d-ads">Biblioteca de anuncios</Label>
              <Input id="d-ads" name="ads_library" defaultValue={pros.ads_library} maxLength={500} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Canal</Label>
              <Segmento name="canal" value={canal} onChange={setCanal} opciones={CANALES} etiquetas={CANAL_LABELS} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-contacto">Contacto ({CANAL_LABELS[canal]})</Label>
                <Input id="d-contacto" name="contacto" defaultValue={pros.contacto} maxLength={200} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-wa">WhatsApp</Label>
                <Input id="d-wa" name="whatsapp_number" defaultValue={props.whatsapp ?? ""} maxLength={40} placeholder="+57…" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d-respuesta">Lo que respondió</Label>
              <Textarea id="d-respuesta" name="respuesta" defaultValue={pros.respuesta} rows={3} maxLength={4000} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d-notas">Notas internas</Label>
              <Textarea id="d-notas" name="notas" defaultValue={props.notas ?? ""} rows={2} maxLength={2000} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setEditando(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <Dato etiqueta="Tienda">
              {tienda ? (
                <a href={tienda} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {pros.tienda}
                </a>
              ) : (
                pros.tienda || "—"
              )}
            </Dato>
            <div className="grid gap-4 sm:grid-cols-2">
              <Dato etiqueta={pros.servicio === "video" ? "Producto del video" : "Producto o página"}>{pros.producto || "—"}</Dato>
              <Dato etiqueta="País">{pros.pais || "—"}</Dato>
            </div>
            <Dato etiqueta="Falencia detectada">{pros.falencia || "—"}</Dato>
            {ads && (
              <Dato etiqueta="Biblioteca de anuncios">
                <a href={ads} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <ExternalLink className="size-3" /> Ver anuncios
                </a>
              </Dato>
            )}
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <span className={ETIQUETA}>Respondió por {CANAL_LABELS[pros.canal]}</span>
              <p className="mt-1.5 text-sm break-words whitespace-pre-wrap">
                {pros.respuesta ? `«${pros.respuesta}»` : <span className="text-muted-foreground">Sin texto guardado.</span>}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Dato etiqueta={`Contacto · ${CANAL_LABELS[pros.canal]}`}>
                {pros.contacto ? (
                  <button
                    type="button"
                    onClick={() => copiar(pros.contacto, "Contacto copiado")}
                    className="inline-flex items-center gap-1.5 text-left hover:text-primary"
                  >
                    {pros.contacto} <Copy className="size-3 shrink-0 text-muted-foreground" />
                  </button>
                ) : (
                  "—"
                )}
              </Dato>
              <Dato etiqueta="WhatsApp">
                {props.whatsapp ?? <span className="text-muted-foreground">Aún no lo da</span>}
              </Dato>
            </div>
            {props.notas && <Dato etiqueta="Notas internas">{props.notas}</Dato>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Guion({ id, pros }: { id: string; pros: Prospeccion }) {
  const [texto, setTexto] = useState(pros.guion);
  const [editando, setEditando] = useState(false);
  const [indicacion, setIndicacion] = useState("");
  const [accion, setAccion] = useState<"ia" | "guardar" | null>(null);
  const [, startTransition] = useTransition();
  const esVideo = pros.servicio === "video";
  const hayGuion = !!pros.guion.trim();

  function regenerar() {
    if (editando && texto !== pros.guion && !window.confirm("Tienes cambios sin guardar en el guion. ¿Reemplazarlos por una versión nueva?")) return;
    setAccion("ia");
    startTransition(async () => {
      const r = await regenerarGuion(id, indicacion);
      setAccion(null);
      if (r.error) toast.error(r.error, { duration: 9000 });
      else {
        toast.success("Guion listo");
        setIndicacion("");
      }
    });
  }

  function guardar() {
    setAccion("guardar");
    startTransition(async () => {
      const r = await guardarGuion(id, texto);
      setAccion(null);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Guion guardado");
        setEditando(false);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Paso n="01">{esVideo ? "Guion del video" : "Brief de la muestra"}</Paso>
        </CardTitle>
        <CardDescription>
          {esVideo
            ? "Estructura de video ganador: gancho, problema, producto en mano, prueba y llamado a la acción."
            : "Diagnóstico, primer pantallazo propuesto y guion del recorrido."}
        </CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-1">
          {esVideo && (
            <Link
              href={`/videos?prospecto=${id}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              title="Elegir otro formato de video (podcast, entrevista, claymation…) y escribir el guion con investigación de mercado"
            >
              <Clapperboard /> Crear con formato
            </Link>
          )}
          {hayGuion && !editando && (
            <>
              <Button variant="ghost" size="sm" onClick={() => copiar(pros.guion, "Guion copiado")}>
                <Copy /> Copiar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
                <Pencil /> Editar
              </Button>
            </>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {editando || !hayGuion ? (
          <>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={hayGuion ? 20 : 6}
              maxLength={12000}
              placeholder="Todavía no hay guion. Genéralo con IA o escríbelo aquí."
              className="font-mono text-[13px] leading-relaxed"
              aria-label="Guion"
            />
            <div className="flex justify-end gap-2">
              {hayGuion && (
                <Button
                  variant="ghost"
                  disabled={!!accion}
                  onClick={() => {
                    setTexto(pros.guion);
                    setEditando(false);
                  }}
                >
                  Cancelar
                </Button>
              )}
              <Button variant={hayGuion ? "default" : "outline"} disabled={!!accion || !texto.trim() || texto === pros.guion} onClick={guardar}>
                {accion === "guardar" ? "Guardando…" : "Guardar guion"}
              </Button>
            </div>
          </>
        ) : (
          <pre className="max-h-[560px] overflow-y-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap">
            {pros.guion}
          </pre>
        )}

        <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
          <Input
            value={indicacion}
            onChange={(e) => setIndicacion(e.target.value)}
            maxLength={600}
            placeholder="Indicación opcional: «más corto», «gancho de humor», «tono mexicano»…"
            aria-label="Indicación para la IA"
          />
          <Button variant={hayGuion ? "outline" : "default"} disabled={!!accion} onClick={regenerar} className="shrink-0">
            {hayGuion ? <RefreshCw className={cn(accion === "ia" && "animate-spin")} /> : <Sparkles />}
            {accion === "ia" ? "Escribiendo…" : hayGuion ? "Regenerar con IA" : "Generar con IA"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Asignar({
  id,
  editorId,
  asignables,
  bloqueado,
}: {
  id: string;
  editorId: string | null;
  asignables: { id: string; name: string }[];
  bloqueado: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const items = { [SIN_ASIGNAR]: "Sin asignar", ...Object.fromEntries(asignables.map((p) => [p.id, p.name])) };
  return (
    <div className="flex flex-col gap-1.5">
      <span className={ETIQUETA}>Encargado</span>
      <Select
        items={items}
        value={editorId ?? SIN_ASIGNAR}
        disabled={pending || bloqueado}
        onValueChange={(next) =>
          startTransition(async () => {
            if (!next) return;
            const r = await asignarEditor(id, next === SIN_ASIGNAR ? null : (next as string));
            if (r.error) toast.error(r.error);
            else toast.success(next === SIN_ASIGNAR ? "Asignación quitada" : "Asignado y notificado");
          })
        }
      >
        <SelectTrigger className="w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>
          {asignables.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {asignables.length === 0 && (
        <p className="text-xs text-muted-foreground">No hay personas activas con el rol para esta línea.</p>
      )}
    </div>
  );
}

function Mensaje({ id, pros, etapa, terminado }: { id: string; pros: Prospeccion; etapa: Etapa; terminado: boolean }) {
  const [texto, setTexto] = useState(pros.mensaje);
  const [accion, setAccion] = useState<"ia" | "base" | "guardar" | "enviado" | null>(null);
  const [, startTransition] = useTransition();
  const hayPieza = !!pros.video_url;
  const sucio = texto !== pros.mensaje;

  function redactar(modo: "ia" | "base") {
    if (texto.trim() && !window.confirm("Esto reemplaza el mensaje actual. ¿Continuar?")) return;
    setAccion(modo);
    startTransition(async () => {
      const r = await redactarMensaje(id, modo);
      setAccion(null);
      if (r.error) toast.error(r.error, { duration: 9000 });
      else toast.success("Mensaje listo");
    });
  }

  function guardar(despues?: () => void) {
    setAccion("guardar");
    startTransition(async () => {
      const r = await guardarMensaje(id, texto);
      setAccion(null);
      if (r.error) toast.error(r.error);
      else despues?.();
    });
  }

  function copiarMensaje() {
    void copiar(texto, "Mensaje copiado. Pégalo en " + CANAL_LABELS[pros.canal]);
    if (sucio) guardar();
  }

  function enviado() {
    setAccion("enviado");
    startTransition(async () => {
      if (sucio) {
        const g = await guardarMensaje(id, texto);
        if (g.error) {
          setAccion(null);
          toast.error(g.error);
          return;
        }
      }
      const r = await marcarEnviado(id);
      setAccion(null);
      if (r.error) toast.error(r.error);
      else toast.success("Quedó en «Video enviado»");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Paso n="03">Mensaje para el cliente</Paso>
        </CardTitle>
        <CardDescription>
          Entrega {PIEZA[pros.servicio] === "video" ? "el video" : "la muestra"}, invita a la llamada de 15 minutos
          {pros.canal === "whatsapp" ? "." : " y pide su WhatsApp."} Se copia y se envía por {CANAL_LABELS[pros.canal]}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!hayPieza ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
            El mensaje se redacta cuando la pieza esté subida: lleva su enlace.
          </p>
        ) : (
          <>
            {!terminado && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                La pieza aún no está marcada como terminada. Confirma que es la versión final antes de enviar.
              </p>
            )}
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={texto ? 11 : 4}
              maxLength={6000}
              placeholder="Redáctalo con IA o usa la plantilla base."
              aria-label="Mensaje para el cliente"
              className="leading-relaxed"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={!!accion || !texto.trim()} onClick={copiarMensaje}>
                <Copy /> Copiar mensaje
              </Button>
              <Button variant="outline" disabled={!!accion} onClick={() => redactar("ia")}>
                <Sparkles /> {accion === "ia" ? "Redactando…" : texto.trim() ? "Redactar de nuevo con IA" : "Redactar con IA"}
              </Button>
              <Button variant="ghost" disabled={!!accion} onClick={() => redactar("base")}>
                Plantilla base
              </Button>
              {sucio && (
                <Button variant="ghost" disabled={!!accion} onClick={() => guardar(() => toast.success("Mensaje guardado"))}>
                  {accion === "guardar" ? "Guardando…" : "Guardar cambios"}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <a
                href={CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <CalendarClock className="size-3.5" /> Enlace de la llamada
              </a>
              {etapa === "falta_enviar_video" ? (
                <Button variant="outline" disabled={!!accion || !texto.trim()} onClick={enviado}>
                  <Send /> {accion === "enviado" ? "Guardando…" : "Ya lo envié"}
                </Button>
              ) : (
                pros.enviado_at && <span className="text-xs text-muted-foreground">Enviado el {fecha(pros.enviado_at)}</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Historial({ pros }: { pros: Prospeccion }) {
  if (!pros.historial.length) return null;
  const eventos = [...pros.historial].reverse();
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Historial</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex max-h-72 flex-col gap-2.5 overflow-y-auto">
          {eventos.map((e, i) => (
            <li key={`${e.fecha}-${i}`} className="flex gap-2.5 text-xs">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block break-words">{e.accion}</span>
                <span className="text-muted-foreground">
                  {e.quien} · {fecha(e.fecha)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
