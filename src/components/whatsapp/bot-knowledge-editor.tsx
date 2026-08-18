"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateBotKnowledge } from "@/app/(protected)/whatsapp/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function BotKnowledgeEditor({ initialContenido }: { initialContenido: string }) {
  const [contenido, setContenido] = useState(initialContenido);
  const [pending, startTransition] = useTransition();
  const dirty = contenido !== initialContenido;

  function handleSave() {
    startTransition(async () => {
      const result = await updateBotKnowledge(contenido);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Base de conocimiento actualizada");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={contenido}
        onChange={(e) => setContenido(e.target.value)}
        rows={20}
        className="font-mono text-xs leading-relaxed"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Esto es lo que lee el agente de ventas antes de responder por WhatsApp — precios, protocolo,
          preguntas de agendamiento y cualquier información adicional que agregues aquí.
        </p>
        <Button type="button" onClick={handleSave} disabled={pending || !dirty}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
