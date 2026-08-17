"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bot, Send, Mic, Square, Volume2, VolumeX, PhoneCall, PhoneOff } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { askCeoAssistant } from "@/app/(protected)/ceo/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MermaidDiagram } from "@/components/ceo/mermaid-diagram";
import { markdownToSpeechText } from "@/lib/speech-text";
import { cn } from "@/lib/utils";

type ChatMsg = { role: "user" | "assistant"; content: string };

// El navegador expone SpeechRecognition con prefijo en Chrome/Edge — no
// hay tipos oficiales de TypeScript para esta API todavía.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionCtor = new () => any;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm [&_h1]:font-heading [&_h2]:font-heading [&_h3]:font-heading [&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:bg-muted/60 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:px-2 [&_td]:py-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-mermaid/.exec(className ?? "");
            if (match) {
              return <MermaidDiagram code={String(children).trim()} />;
            }
            return (
              <code className="rounded bg-muted px-1 py-0.5 text-xs" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function CeoAssistant() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Hola, soy tu asesor de negocio privado. Te conozco a fondo: rentabilidad, nómina, clientes, prospectos y tu propia estrategia (documento maestro y manual operativo). Pregúntame lo que sea — si ayuda a explicarlo, te armo tablas o diagramas. Puedes hablarme con el micrófono, o activar la conversación en tiempo real para hablar como en una llamada.",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  const conversationModeRef = useRef(false);
  const gotResultRef = useRef(false);
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const micSupported = getSpeechRecognitionCtor() !== null;
  const spokenCountRef = useRef(1); // el mensaje inicial no se lee solo

  function send(text: string) {
    const clean = text.trim();
    if (!clean) return;
    const next = [...messages, { role: "user" as const, content: clean }];
    setMessages(next);
    setInput("");

    startTransition(async () => {
      const reply = await askCeoAssistant(next);
      setMessages((prev) => [...prev, reply]);
    });
  }

  function startListening() {
    if (!micSupported) {
      toast.error("Este navegador no soporta reconocimiento de voz. Usa Chrome o Edge.");
      return;
    }
    const Ctor = getSpeechRecognitionCtor()!;
    const recognition = new Ctor();
    recognition.lang = "es-CO";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    gotResultRef.current = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      gotResultRef.current = true;
      const transcript = event.results[0][0].transcript as string;
      setInput(transcript);
      send(transcript);
    };
    recognition.onerror = (event: { error?: string }) => {
      setListening(false);
      if (event?.error === "no-speech" && conversationModeRef.current) {
        // Silencio en modo conversación: reintenta escuchar solo, sin
        // molestar con un toast cada vez.
        setTimeout(() => conversationModeRef.current && startListening(), 400);
        return;
      }
      toast.error("No se pudo escuchar — intenta de nuevo.");
    };
    recognition.onend = () => {
      setListening(false);
      if (conversationModeRef.current && !gotResultRef.current) {
        setTimeout(() => conversationModeRef.current && startListening(), 400);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    startListening();
  }

  function toggleConversationMode() {
    const next = !conversationMode;
    conversationModeRef.current = next;
    setConversationMode(next);
    if (next) {
      setVoiceOn(true);
      startListening();
    } else {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
      setListening(false);
    }
  }

  // Lee en voz alta cada respuesta nueva del asistente cuando el modo voz
  // está activado (no lee el mensaje de bienvenida inicial). En modo
  // conversación, al terminar de hablar vuelve a activar el micrófono solo.
  useEffect(() => {
    if (!voiceOn || !speechSupported) return;
    if (messages.length <= spokenCountRef.current) return;
    spokenCountRef.current = messages.length;

    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(markdownToSpeechText(last.content));
    utterance.lang = "es-CO";
    utterance.rate = 1;
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find((v) => v.lang.startsWith("es"));
    if (esVoice) utterance.voice = esVoice;
    utterance.onend = () => {
      if (conversationModeRef.current) setTimeout(() => conversationModeRef.current && startListening(), 300);
    };
    window.speechSynthesis.speak(utterance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, voiceOn, speechSupported]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="size-4" />
          Asistente CEO
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {speechSupported && micSupported && (
            <Button
              type="button"
              size="sm"
              variant={conversationMode ? "default" : "outline"}
              className={cn("gap-1.5", conversationMode && "animate-pulse")}
              onClick={toggleConversationMode}
            >
              {conversationMode ? <PhoneOff className="size-3.5" /> : <PhoneCall className="size-3.5" />}
              {conversationMode ? "En llamada — colgar" : "Hablar en tiempo real"}
            </Button>
          )}
          {speechSupported && !conversationMode && (
            <Button
              type="button"
              size="sm"
              variant={voiceOn ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => {
                if (voiceOn) window.speechSynthesis.cancel();
                setVoiceOn((v) => !v);
              }}
            >
              {voiceOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              {voiceOn ? "Voz activada" : "Voz desactivada"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {conversationMode && (
          <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary">
            {listening ? "Escuchando…" : pending ? "Pensando…" : "En llamada — habla cuando quieras."}
          </p>
        )}
        <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-auto max-w-[85%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                {m.content}
              </div>
            ) : (
              <div key={i} className="max-w-[95%] rounded-md bg-muted px-3 py-2 text-foreground">
                <AssistantMessage content={m.content} />
              </div>
            ),
          )}
          {pending && <div className="max-w-[85%] rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Pensando…</div>}
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send(input))}
            placeholder="Ej. ¿Cómo va la rentabilidad esta semana? (o usa el micrófono)"
            disabled={pending}
          />
          {micSupported && !conversationMode && (
            <Button
              type="button"
              size="icon"
              variant={listening ? "destructive" : "outline"}
              onClick={toggleMic}
              disabled={pending}
              title={listening ? "Detener" : "Hablar"}
              className={cn(listening && "animate-pulse")}
            >
              {listening ? <Square className="size-4" /> : <Mic className="size-4" />}
            </Button>
          )}
          <Button size="icon" onClick={() => send(input)} disabled={pending}>
            <Send className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
