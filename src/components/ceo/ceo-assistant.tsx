"use client";

import { useState, useTransition } from "react";
import { Bot, Send } from "lucide-react";
import { askCeoAssistant } from "@/app/(protected)/ceo/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type ChatMsg = { role: "user" | "assistant"; content: string };

export function CeoAssistant() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Hola, soy tu asistente privado. Pregúntame sobre rentabilidad, nómina o el estado del negocio — uso las cifras que ves arriba en este panel.",
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
        const reply = await askCeoAssistant(
          next,
          "Ver las cifras de rentabilidad semanal y mensual mostradas en este mismo panel (arriba).",
        );
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
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {m.content}
            </div>
          ))}
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
