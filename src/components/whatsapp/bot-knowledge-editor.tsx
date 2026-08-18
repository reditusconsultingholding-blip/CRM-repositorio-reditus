"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  addBotKnowledgeSection,
  updateBotKnowledgeSection,
  deleteBotKnowledgeSection,
} from "@/app/(protected)/whatsapp/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BotKnowledgeSection } from "@/lib/bot-knowledge";

function Section({ section }: { section: BotKnowledgeSection }) {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState(section.titulo);
  const [contenido, setContenido] = useState(section.contenido);
  const [pending, startTransition] = useTransition();
  const dirty = titulo !== section.titulo || contenido !== section.contenido;

  function handleSave() {
    startTransition(async () => {
      const result = await updateBotKnowledgeSection(section.id, titulo, contenido);
      if (result?.error) toast.error(result.error);
      else toast.success("Sección guardada");
    });
  }

  function handleDelete() {
    if (!confirm(`¿Borrar la sección "${section.titulo}"? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      const result = await deleteBotKnowledgeSection(section.id);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
          {section.titulo}
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {section.contenido.length > 0 ? `${section.contenido.length} caracteres` : "vacío"}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t p-3">
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="font-medium" />
          <Textarea
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            rows={10}
            className="font-mono text-xs leading-relaxed"
            placeholder="Escribe aquí…"
          />
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={handleDelete} disabled={pending}>
              <Trash2 className="size-3.5" />
              Borrar sección
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={pending || !dirty}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddSection() {
  const [adding, setAdding] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    startTransition(async () => {
      const result = await addBotKnowledgeSection(titulo);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setTitulo("");
        setAdding(false);
      }
    });
  }

  if (!adding) {
    return (
      <Button type="button" variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => setAdding(true)}>
        <Plus className="size-3.5" />
        Agregar sección
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed p-2">
      <Input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Ej. Objeciones frecuentes de un nicho"
        className="text-sm"
        autoFocus
      />
      <Button type="button" size="sm" onClick={handleAdd} disabled={pending || !titulo.trim()}>
        {pending ? "Agregando…" : "Agregar"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setTitulo(""); }}>
        Cancelar
      </Button>
    </div>
  );
}

export function BotKnowledgeEditor({ sections }: { sections: BotKnowledgeSection[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Esto es lo que lee el agente de ventas antes de responder por WhatsApp. Despliega cada sección
        para editarla, o agrega las que necesites — objeciones, ejemplos de portafolio, casos de éxito,
        lo que le dé más contexto.
      </p>
      {sections.map((s) => (
        <Section key={s.id} section={s} />
      ))}
      <AddSection />
    </div>
  );
}
