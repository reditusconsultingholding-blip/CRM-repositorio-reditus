"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Bot, BotOff, MessageCircle } from "lucide-react";
import { updateProspectoEstado, toggleBotActivo } from "@/app/(protected)/prospectos/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EstadoSelect } from "@/components/estado-select";
import { PROSPECTO_ESTADOS, PROSPECTO_ESTADO_COLORS } from "@/lib/statuses";
import { STAGE_LABELS, type VentasPipelineItem, type VentasPipelineStage } from "@/lib/ventas-pipeline-types";

const STAGE_ORDER: VentasPipelineStage[] = [
  "interesados",
  "agendados",
  "convertidos",
  "pendientes",
  "compraron",
  "descartados",
];

const STAGE_COLORS: Record<VentasPipelineStage, string> = {
  interesados: "border-t-sky-400",
  agendados: "border-t-violet-400",
  convertidos: "border-t-emerald-400",
  pendientes: "border-t-amber-400",
  compraron: "border-t-green-500",
  descartados: "border-t-neutral-300",
};

function ConversacionDialog({ item, onClose }: { item: VentasPipelineItem; onClose: () => void }) {
  const [botActivo, setBotActivo] = useState(item.botActivo);
  const [pending, startTransition] = useTransition();

  function handleToggleBot() {
    const next = !botActivo;
    startTransition(async () => {
      const result = await toggleBotActivo(item.id, next);
      if (result?.error) toast.error(result.error);
      else {
        setBotActivo(next);
        toast.success(next ? "Bot reactivado" : "Bot apagado — ahora respondes tú");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="size-4" />
            {item.nombre}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{item.whatsappNumber ?? "sin número"}</p>
            <EstadoSelect
              value={item.estado}
              estados={PROSPECTO_ESTADOS}
              colors={PROSPECTO_ESTADO_COLORS}
              onChange={updateProspectoEstado.bind(null, item.id)}
            />
          </div>

          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2">
            {item.historial.length === 0 && (
              <p className="p-2 text-center text-sm text-muted-foreground">Sin mensajes todavía.</p>
            )}
            {item.historial.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="max-w-[85%] rounded-md bg-background px-3 py-2 text-sm shadow-sm">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="ml-auto max-w-[85%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {m.content}
                </div>
              ),
            )}
          </div>

          <Button type="button" variant={botActivo ? "outline" : "default"} className="gap-1.5 self-start" onClick={handleToggleBot} disabled={pending}>
            {botActivo ? <BotOff className="size-3.5" /> : <Bot className="size-3.5" />}
            {botActivo ? "Apagar bot (responder yo)" : "Reactivar bot"}
          </Button>
          {!botActivo && (
            <p className="text-xs text-muted-foreground">
              El bot dejó de responder aquí — responde directo desde tu WhatsApp normal, los mensajes
              nuevos van a seguir apareciendo en este hilo.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VentasPipelineBoard({ items }: { items: VentasPipelineItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openItem = items.find((i) => i.id === openId) ?? null;

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Todavía no ha entrado ningún mensaje por esta línea.
      </p>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {STAGE_ORDER.map((stage) => {
        const stageItems = items.filter((i) => i.stage === stage);
        if (stageItems.length === 0) return null;
        return (
          <div key={stage} className="flex w-64 shrink-0 flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {STAGE_LABELS[stage]} <span className="font-normal">({stageItems.length})</span>
            </p>
            <div className="flex flex-col gap-2">
              {stageItems.map((item) => {
                const ultimo = item.historial[item.historial.length - 1];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOpenId(item.id)}
                    className={`flex flex-col gap-1 rounded-md border border-t-4 bg-background p-2.5 text-left text-sm shadow-sm hover:bg-muted/40 ${STAGE_COLORS[stage]}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{item.nombre}</span>
                      {!item.botActivo && <BotOff className="size-3.5 shrink-0 text-muted-foreground" />}
                    </div>
                    <span className="text-xs text-muted-foreground">{item.whatsappNumber}</span>
                    {ultimo && (
                      <span className="truncate text-xs text-muted-foreground">
                        {ultimo.role === "user" ? "" : "Tú: "}
                        {ultimo.content}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {openItem && <ConversacionDialog item={openItem} onClose={() => setOpenId(null)} />}
    </div>
  );
}
