"use client";

import { useState, useTransition } from "react";
import { Bot, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askCeoAssistant } from "@/app/(protected)/ceo/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MermaidDiagram } from "@/components/ceo/mermaid-diagram";

type ChatMsg = { role: "user" | "assistant"; content: string };

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
        "Hola, soy tu asesor de negocio privado. Te conozco a fondo: rentabilidad, nómina, clientes, prospectos y tu propia estrategia (documento maestro y manual operativo). Pregúntame lo que sea — si ayuda a explicarlo, te armo tablas o diagramas.",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();

  function send() {
    const text = input.trim();
    if (!text) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");

    startTransition(async () => {
      try {
        const reply = await askCeoAssistant(next);
        setMessages((prev) => [...prev, reply]);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: e instanceof Error ? e.message : "Ocurrió un error." },
        ]);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="size-4" />
          Asistente CEO
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Ej. ¿Cómo va la rentabilidad esta semana?"
            disabled={pending}
          />
          <Button size="icon" onClick={send} disabled={pending}>
            <Send className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
