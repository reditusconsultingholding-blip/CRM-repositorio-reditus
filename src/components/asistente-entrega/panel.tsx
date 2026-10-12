"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  Check,
  Copy,
  Loader2,
  Mic,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  Wallet,
  MessageSquareText,
} from "lucide-react";
import { consultarAsistenteEntrega, redactarMensajeEntrega } from "@/app/(protected)/ingresos/asistente-actions";
import { fechaLarga, type TipoServicio } from "@/lib/capacidad";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIPOS_SERVICIO, TIPO_NOMBRES, type ItemPedido, type RespuestaAsistente } from "./tipos";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reconocedor = any;

function crearReconocedor(): Reconocedor | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

const sinSuscripcion = () => () => {};
function navegadorTieneVoz(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

function cop(n: number) {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

const OPCIONES_TIPO = TIPOS_SERVICIO.map((t) => ({ value: t, label: TIPO_NOMBRES[t] }));
type Fila = { tipo: TipoServicio; cantidad: string };

export function AsistenteEntregaPanel({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"dictar" | "manual">("dictar");
  const [texto, setTexto] = useState("");
  const [filas, setFilas] = useState<Fila[]>([{ tipo: "video", cantidad: "6" }]);
  const [clienteManual, setClienteManual] = useState("");

  const [respuesta, setRespuesta] = useState<RespuestaAsistente | null>(null);
  const [fecha, setFecha] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [conPrecio, setConPrecio] = useState(false);
  const [variante, setVariante] = useState(0);
  const [copiado, setCopiado] = useState(false);

  const [calculando, iniciarCalculo] = useTransition();
  const [redactando, iniciarRedaccion] = useTransition();

  const [escuchando, setEscuchando] = useState(false);
  const hayVoz = useSyncExternalStore(sinSuscripcion, navegadorTieneVoz, () => true);
  const recRef = useRef<Reconocedor | null>(null);
  const baseRef = useRef("");
  const dictadoRef = useRef("");

  useEffect(() => () => recRef.current?.abort?.(), []);

  function redactar(r: RespuestaAsistente, f: string, incluirPrecio: boolean, v: number) {
    iniciarRedaccion(async () => {
      const res = await redactarMensajeEntrega({
        cliente: r.pedido.cliente,
        // El mensaje solo habla de lo que sí tiene fecha calculada.
        items: r.pedido.items.filter((_, i) => r.entregas[i]?.fecha),
        fecha: f,
        precioCop: incluirPrecio ? r.totalCop : null,
        variante: v,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setMensaje(res.mensaje);
      setCopiado(false);
    });
  }

  function calcular(entrada: { texto?: string; manual?: unknown }) {
    iniciarCalculo(async () => {
      const res = await consultarAsistenteEntrega(entrada);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      const r = res.ok;
      setRespuesta(r);
      setFecha(r.fecha ?? "");
      setMensaje(r.mensaje);
      setVariante(0);
      setConPrecio(false);
      setCopiado(false);
      // La plantilla ya quedó puesta; la IA la mejora si está disponible.
      if (r.fecha) redactar(r, r.fecha, false, 0);
    });
  }

  function calcularDictado(t: string) {
    const limpio = t.trim();
    if (!limpio) {
      toast.error("Cuéntame qué pedido entró.");
      return;
    }
    calcular({ texto: limpio });
  }

  function calcularManual() {
    const items: ItemPedido[] = filas.map((f) => ({
      tipo: f.tipo,
      cantidad: Math.max(1, Math.floor(Number(f.cantidad)) || 1),
      producto: null,
    }));
    calcular({ manual: { cliente: clienteManual.trim() || null, items, urgente: false } });
  }

  function alternarMicrofono() {
    if (escuchando) {
      recRef.current?.stop();
      return;
    }
    const rec = crearReconocedor();
    if (!rec) {
      toast.error("Este navegador no reconoce voz. Escríbelo, o usa Chrome o Edge.");
      return;
    }
    rec.lang = "es-CO";
    rec.continuous = true;
    rec.interimResults = true;
    baseRef.current = texto.trim();
    dictadoRef.current = "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (ev: any) => {
      let dicho = "";
      for (let i = 0; i < ev.results.length; i++) dicho += ev.results[i][0].transcript;
      dictadoRef.current = dicho.trim();
      setTexto([baseRef.current, dictadoRef.current].filter(Boolean).join(" "));
    };
    rec.onerror = (ev: { error?: string }) => {
      if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
        toast.error("El navegador no tiene permiso para usar el micrófono.");
      } else if (ev?.error !== "aborted" && ev?.error !== "no-speech") {
        toast.error("No pude escucharte. Intenta de nuevo o escríbelo.");
      }
    };
    rec.onend = () => {
      setEscuchando(false);
      const final = [baseRef.current, dictadoRef.current].filter(Boolean).join(" ");
      if (dictadoRef.current) calcularDictado(final);
    };

    recRef.current = rec;
    try {
      rec.start();
      setEscuchando(true);
    } catch {
      toast.error("No pude abrir el micrófono.");
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiado(true);
      toast.success("Mensaje copiado");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  }

  function cambiarFecha(f: string) {
    setFecha(f);
    if (respuesta && /^\d{4}-\d{2}-\d{2}$/.test(f)) redactar(respuesta, f, conPrecio, variante);
  }

  function cambiarConPrecio(v: boolean) {
    setConPrecio(v);
    if (respuesta && fecha) redactar(respuesta, fecha, v, variante);
  }

  function regenerar() {
    if (!respuesta || !fecha) return;
    const v = variante + 1;
    setVariante(v);
    redactar(respuesta, fecha, conPrecio, v);
  }

  const r = respuesta;
  const fechaCambiada = Boolean(r?.fecha && fecha && fecha !== r.fecha);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) recRef.current?.abort?.();
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" className={className} />}>
        <CalendarClock className="text-primary" />
        Asistente de entrega
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Asistente de entrega
          </DialogTitle>
          <DialogDescription>
            Cuéntame qué pedido entró y te digo qué día puedes prometerlo, cuánto cobrar y qué escribirle al cliente.
          </DialogDescription>
        </DialogHeader>

        {/* ── Entrada ── */}
        <div className="grid gap-3">
          <div className="flex gap-1 text-xs">
            {(["dictar", "manual"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  modo === m ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "dictar" ? "Dictar o escribir" : "Llenar a mano"}
              </button>
            ))}
          </div>

          {modo === "dictar" ? (
            <div className="grid gap-2">
              <div className="relative">
                <Textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) calcularDictado(texto);
                  }}
                  rows={3}
                  placeholder="Ej.: «Acaba de entrar un cliente, Camilo, quiere 6 videos y una landing para su crema»"
                  className={cn("min-h-20 pr-12", escuchando && "border-primary ring-3 ring-primary/25")}
                />
                <Button
                  type="button"
                  size="icon"
                  variant={escuchando ? "default" : "outline"}
                  onClick={alternarMicrofono}
                  disabled={calculando}
                  title={hayVoz ? (escuchando ? "Parar y calcular" : "Dictar por voz") : "Este navegador no reconoce voz"}
                  className={cn("absolute right-2 bottom-2 rounded-full", escuchando && "animate-pulse")}
                >
                  {escuchando ? <Square className="size-3.5" /> : <Mic />}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {escuchando
                    ? "Te escucho… toca el botón para parar y calcular."
                    : hayVoz
                      ? "Toca el micrófono y habla, o escríbelo."
                      : "Este navegador no reconoce voz: escríbelo o llénalo a mano."}
                </p>
                <Button type="button" onClick={() => calcularDictado(texto)} disabled={calculando || escuchando}>
                  {calculando ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  Calcular
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              {filas.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    items={OPCIONES_TIPO}
                    value={f.tipo}
                    onValueChange={(v) =>
                      setFilas((p) => p.map((x, j) => (j === i ? { ...x, tipo: (v ?? "video") as TipoServicio } : x)))
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPCIONES_TIPO.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={f.cantidad}
                    onChange={(e) => setFilas((p) => p.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))}
                    aria-label="Cantidad"
                    className="w-20"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={filas.length === 1}
                    onClick={() => setFilas((p) => p.filter((_, j) => j !== i))}
                    title="Quitar"
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={filas.length >= 6}
                  onClick={() => setFilas((p) => [...p, { tipo: "landing", cantidad: "1" }])}
                >
                  <Plus /> Otro servicio
                </Button>
                <Input
                  value={clienteManual}
                  onChange={(e) => setClienteManual(e.target.value)}
                  placeholder="Nombre del cliente (opcional)"
                  className="min-w-40 flex-1"
                />
                <Button type="button" onClick={calcularManual} disabled={calculando}>
                  {calculando ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  Calcular
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Resultado ── */}
        {r && (
          <div className={cn("grid gap-3 transition-opacity", calculando && "opacity-50")}>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>Entendí:</span>
              {r.pedido.cliente && <Badge variant="outline">{r.pedido.cliente}</Badge>}
              {r.pedido.items.map((it, i) => (
                <Badge key={i} variant="secondary">
                  {it.cantidad} × {TIPO_NOMBRES[it.tipo]}
                  {it.producto ? ` · ${it.producto}` : ""}
                </Badge>
              ))}
              {r.pedido.urgente && <Badge variant="destructive">Urgente</Badge>}
            </div>

            {r.avisos.map((a) => (
              <p key={a} className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {a}
              </p>
            ))}

            {/* Fecha */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <CalendarClock className="size-3.5 text-primary" /> Fecha de entrega recomendada
              </h3>
              {r.fecha ? (
                <>
                  <p className="mt-1 font-heading text-2xl font-semibold tracking-tight first-letter:uppercase">
                    {fechaLarga(r.fecha)}
                  </p>
                  {r.fechaSinCola && r.fechaSinCola < r.fecha && (
                    <p className="text-xs text-muted-foreground">
                      Pasándolo por delante de la cola: {fechaLarga(r.fechaSinCola)}.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm">Para este pedido no se calcula fecha aquí.</p>
              )}
              <div className="mt-3 grid gap-3">
                {r.entregas.map((e, i) => (
                  <div key={i} className="text-xs">
                    {r.entregas.length > 1 && (
                      <p className="mb-1 font-medium">
                        {e.cantidad} × {TIPO_NOMBRES[e.tipo]}
                        {e.fecha ? ` → ${fechaLarga(e.fecha)} (${e.diasHabiles} días hábiles)` : ""}
                      </p>
                    )}
                    {r.entregas.length === 1 && e.fecha && (
                      <p className="mb-1 font-medium">{e.diasHabiles} días hábiles desde hoy</p>
                    )}
                    <ul className="grid gap-0.5 text-muted-foreground">
                      {e.motivos.map((m) => (
                        <li key={m} className="flex gap-1.5">
                          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/60" />
                          {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* Precio */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <Wallet className="size-3.5 text-primary" /> Precio sugerido
              </h3>
              {r.totalCop != null && r.precios.length > 1 && (
                <p className="mt-1 font-heading text-2xl font-semibold tracking-tight">
                  {cop(r.totalCop)} COP{" "}
                  <span className="text-sm font-normal text-muted-foreground">≈ {r.totalUsd} USD en total</span>
                </p>
              )}
              <div className="mt-2 grid gap-3">
                {r.precios.map((p, i) => (
                  <div key={i} className="text-xs">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-medium">
                        {p.cantidad} × {TIPO_NOMBRES[p.tipo]}
                      </span>
                      {p.totalCop != null ? (
                        <span className={cn("font-heading font-semibold", r.precios.length === 1 ? "text-2xl" : "text-base")}>
                          {cop(p.totalCop)} COP
                        </span>
                      ) : (
                        <span className="text-sm">Sin datos para sugerir</span>
                      )}
                      {p.totalUsd != null && <span className="text-muted-foreground">≈ {p.totalUsd} USD</span>}
                      {p.base === "referencia" && <Badge variant="outline">Referencia</Badge>}
                    </div>
                    {p.base === "historial" && p.minCop != null && p.maxCop != null && (
                      <p className="mt-1">
                        Rango: {cop(p.minCop)} a {cop(p.maxCop)} COP
                      </p>
                    )}
                    <p className="mt-1 text-muted-foreground">
                      {p.detalle}
                      {p.base === "historial" &&
                        ` Base: ${p.n} trabajos parecidos (${p.nApp} de Ingresos, ${p.nHistorico} del histórico).`}
                      {p.referenciaCop != null &&
                        ` ${p.base === "historial" ? "Precio de lista" : "Fuente"}: ${
                          p.base === "historial" ? `${cop(p.referenciaCop)} COP, ` : ""
                        }${p.referenciaNota}.`}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Mensaje */}
            {r.fecha && (
              <section className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <MessageSquareText className="size-3.5 text-primary" /> Mensaje para el cliente
                  </h3>
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" variant="ghost" onClick={regenerar} disabled={redactando}>
                      <RefreshCw className={cn(redactando && "animate-spin")} /> Regenerar
                    </Button>
                    <Button type="button" size="sm" onClick={copiar} disabled={!mensaje || redactando}>
                      {copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  rows={4}
                  className={cn("mt-2 min-h-24", redactando && "opacity-60")}
                />
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                  <Label className="text-xs font-normal">
                    Fecha en el mensaje
                    <Input type="date" value={fecha} onChange={(e) => cambiarFecha(e.target.value)} className="h-7 w-36" />
                  </Label>
                  {r.totalCop != null && (
                    <Label className="text-xs font-normal">
                      <input
                        type="checkbox"
                        checked={conPrecio}
                        onChange={(e) => cambiarConPrecio(e.target.checked)}
                        className="size-3.5 accent-(--primary)"
                      />
                      Incluir el precio ({cop(r.totalCop)} COP)
                    </Label>
                  )}
                </div>
                {fechaCambiada && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Cambiaste la fecha: la recomendada según la carga del equipo es el {fechaLarga(r.fecha)}.
                  </p>
                )}
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
