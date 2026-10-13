"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Flag, Loader2, Mic, PhoneCall, PhoneOff, Send, Square, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { calificarSesion, deshacerTurno, type SesionNueva } from "@/app/(protected)/maestria/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResultadoEvaluacion } from "@/components/maestria/evaluacion";
import { PAUSA, TURNOS_MINIMOS, type Evaluacion, type Mensaje } from "@/lib/negociacion";
import { cn } from "@/lib/utils";

// El navegador expone SpeechRecognition con prefijo en Chrome/Edge y no hay
// tipos oficiales de TypeScript para esta API todavía.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionCtor = new () => any;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Resultado = { evaluacion: Evaluacion; aprobado: boolean; minima: number; graduado: boolean };

/** La sala donde se conversa con la IA: sirve para la clase de un módulo, la
 * práctica libre y el examen. La respuesta llega por partes para que se sienta
 * en vivo; con «Llamada en vivo» se habla y se escucha sin tocar el teclado. */
export function Sala({ sesion, onSalir }: { sesion: SesionNueva; onSalir: () => void }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [input, setInput] = useState("");
  const [respondiendo, setRespondiendo] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [llamada, setLlamada] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [calificando, calificar] = useTransition();
  const [deshaciendo, deshacer] = useTransition();

  const llamadaRef = useRef(false);
  const ocupadoRef = useRef(false);
  const huboVozRef = useRef(false);
  const arrancoRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reconocimientoRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);

  const micDisponible = getSpeechRecognitionCtor() !== null;
  const turnos = mensajes.filter((m) => m.role === "user").length;
  const ocupado = respondiendo || calificando || deshaciendo;

  async function enviar(texto?: string) {
    const limpio = (texto ?? "").trim();
    if (ocupadoRef.current || (texto !== undefined && !limpio)) return;
    ocupadoRef.current = true;
    setRespondiendo(true);
    setInput("");
    const nuevos: Mensaje[] = limpio ? [{ role: "user", content: limpio }] : [];
    setMensajes((prev) => [...prev, ...nuevos, { role: "assistant", content: "" }]);

    let respuesta = "";
    try {
      const res = await fetch("/api/negociacion/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sesionId: sesion.id, texto: limpio || undefined }),
      });
      if (!res.ok || !res.body) {
        const fallo = await res.json().catch(() => null);
        throw new Error(fallo?.error ?? "La IA no respondió.");
      }
      const lector = res.body.getReader();
      const decodificador = new TextDecoder();
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        respuesta += decodificador.decode(value, { stream: true });
        const hastaAhora = respuesta;
        setMensajes((prev) => [...prev.slice(0, -1), { role: "assistant", content: hastaAhora }]);
      }
      if (!respuesta.trim()) throw new Error("La IA respondió vacío.");
    } catch (err) {
      // El servidor no guardó el turno: se quita de la pantalla y se devuelve
      // el texto a la caja para repetirlo.
      setMensajes((prev) => prev.slice(0, prev.length - 1 - nuevos.length));
      setInput(limpio);
      toast.error(err instanceof Error && err.message !== "network error" ? err.message : "Se cortó la respuesta. Intenta de nuevo.");
      respuesta = "";
    } finally {
      ocupadoRef.current = false;
      setRespondiendo(false);
    }
    if (respuesta && llamadaRef.current) hablar(respuesta);
  }

  // La IA abre la escena. El ref evita pedirla dos veces en desarrollo.
  useEffect(() => {
    if (arrancoRef.current) return;
    arrancoRef.current = true;
    enviar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes]);

  // Al salir de la sala no debe quedar el micrófono abierto ni la voz sonando.
  useEffect(() => {
    return () => {
      llamadaRef.current = false;
      reconocimientoRef.current?.stop();
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
    };
  }, []);

  function escuchar() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      toast.error("Este navegador no reconoce la voz. Usa Chrome o Edge.");
      return;
    }
    const reconocimiento = new Ctor();
    reconocimiento.lang = "es-CO";
    reconocimiento.interimResults = false;
    reconocimiento.maxAlternatives = 1;
    huboVozRef.current = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reconocimiento.onresult = (evento: any) => {
      huboVozRef.current = true;
      enviar(evento.results[0][0].transcript as string);
    };
    reconocimiento.onerror = (evento: { error?: string }) => {
      setEscuchando(false);
      if (evento?.error === "no-speech" && llamadaRef.current) return; // onend vuelve a escuchar
      if (evento?.error !== "aborted") toast.error("No se pudo escuchar. Intenta de nuevo.");
    };
    reconocimiento.onend = () => {
      setEscuchando(false);
      if (llamadaRef.current && !huboVozRef.current && !ocupadoRef.current) {
        setTimeout(() => llamadaRef.current && !ocupadoRef.current && escuchar(), 400);
      }
    };

    reconocimientoRef.current = reconocimiento;
    reconocimiento.start();
    setEscuchando(true);
  }

  function seguirLlamada() {
    if (llamadaRef.current) setTimeout(() => llamadaRef.current && escuchar(), 300);
  }

  function hablarConNavegador(texto: string) {
    if (!("speechSynthesis" in window)) return seguirLlamada();
    window.speechSynthesis.cancel();
    const frase = new SpeechSynthesisUtterance(texto);
    frase.lang = "es-CO";
    const voz = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("es"));
    if (voz) frase.voice = voz;
    frase.onend = seguirLlamada;
    window.speechSynthesis.speak(frase);
  }

  // Voz de ElevenLabs si está configurada; si no, la del navegador.
  async function hablar(texto: string) {
    const limpio = texto.replace(PAUSA, "").trim();
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: limpio }),
      });
      if (!res.ok) throw new Error("tts no disponible");
      const url = URL.createObjectURL(await res.blob());
      if (!audioRef.current) audioRef.current = new Audio();
      const audio = audioRef.current;
      audio.src = url;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        seguirLlamada();
      };
      await audio.play();
    } catch {
      hablarConNavegador(limpio);
    }
  }

  function alternarLlamada() {
    const activa = !llamada;
    llamadaRef.current = activa;
    setLlamada(activa);
    if (activa) {
      if (!ocupadoRef.current) escuchar();
    } else {
      reconocimientoRef.current?.stop();
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      setEscuchando(false);
    }
  }

  function colgar() {
    if (llamadaRef.current) alternarLlamada();
  }

  function volverAtras() {
    deshacer(async () => {
      const r = await deshacerTurno(sesion.id);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setMensajes(r.mensajes);
      toast.success("Listo: repite tu último turno.");
    });
  }

  function terminar() {
    colgar();
    calificar(async () => {
      const r = await calificarSesion(sesion.id);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setResultado(r);
    });
  }

  function salir() {
    colgar();
    onSalir();
  }

  if (resultado) {
    return (
      <div className="flex flex-col gap-4">
        <ResultadoEvaluacion titulo={sesion.titulo} {...resultado} />
        <Button onClick={salir} className="self-start">
          <ArrowLeft className="size-4" /> Volver a la maestría
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="rd-etiqueta text-[10px] text-muted-foreground">
            {sesion.tipo === "clase" ? "Clase" : sesion.tipo === "examen" ? "Examen final · sin ayudas" : "Práctica libre"}
          </p>
          <CardTitle className="truncate text-base">{sesion.titulo}</CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {micDisponible && (
            <Button
              type="button"
              size="sm"
              variant={llamada ? "default" : "outline"}
              className={cn(llamada && "animate-pulse")}
              onClick={alternarLlamada}
              disabled={calificando}
            >
              {llamada ? <PhoneOff className="size-3.5" /> : <PhoneCall className="size-3.5" />}
              {llamada ? "En llamada — colgar" : "Llamada en vivo"}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={salir} disabled={calificando}>
            <ArrowLeft className="size-3.5" /> Salir sin calificar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {llamada && (
          <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary">
            {escuchando ? "Escuchando…" : respondiendo ? "Respondiendo…" : "En llamada: habla cuando termine de sonar."}
          </p>
        )}

        <div className="flex max-h-[30rem] min-h-40 flex-col gap-2 overflow-y-auto">
          {mensajes.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                {m.content}
              </div>
            ) : m.content.startsWith(PAUSA) ? (
              <div key={i} className="max-w-[95%] rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-400/10 dark:text-amber-100">
                <p className="rd-etiqueta mb-1 text-[10px]">Pausa del entrenador</p>
                <p className="whitespace-pre-wrap">{m.content.replace(/^⏸\s*PAUSA\.?\s*/i, "")}</p>
              </div>
            ) : (
              <div key={i} className="max-w-[90%] whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                {m.content || <span className="text-muted-foreground">…</span>}
              </div>
            ),
          )}
          <div ref={finRef} />
        </div>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), enviar(input))}
            placeholder={llamada ? "Habla, o escribe aquí si prefieres" : "Escribe lo que le dirías…"}
            disabled={ocupado}
            autoFocus
          />
          {micDisponible && !llamada && (
            <Button
              type="button"
              size="icon"
              variant={escuchando ? "destructive" : "outline"}
              onClick={() => (escuchando ? reconocimientoRef.current?.stop() : escuchar())}
              disabled={ocupado}
              title={escuchando ? "Detener" : "Dictar"}
              className={cn(escuchando && "animate-pulse")}
            >
              {escuchando ? <Square className="size-4" /> : <Mic className="size-4" />}
            </Button>
          )}
          <Button size="icon" onClick={() => enviar(input)} disabled={ocupado || !input.trim()} title="Enviar">
            <Send className="size-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Button type="button" size="sm" variant="outline" onClick={volverAtras} disabled={ocupado || turnos === 0}>
            <Undo2 className="size-3.5" /> Volver atrás y repetir mi turno
          </Button>
          <div className="flex items-center gap-2">
            {turnos < TURNOS_MINIMOS && (
              <span className="text-xs text-muted-foreground">
                {turnos} de {TURNOS_MINIMOS} intervenciones mínimas
              </span>
            )}
            <Button type="button" size="sm" onClick={terminar} disabled={ocupado || turnos < TURNOS_MINIMOS}>
              {calificando ? <Loader2 className="size-3.5 animate-spin" /> : <Flag className="size-3.5" />}
              {calificando ? "Calificando…" : "Terminar y calificar"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
