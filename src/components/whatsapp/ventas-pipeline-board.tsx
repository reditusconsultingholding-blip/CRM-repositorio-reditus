"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Bot,
  BotOff,
  MessageCircle,
  Sparkles,
  CalendarClock,
  UserCheck,
  Clock3,
  PartyPopper,
  XCircle,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

const STAGE_ORDER: VentasPipelineStage[] = [
  "interesados",
  "agendados",
  "convertidos",
  "pendientes",
  "compraron",
  "descartados",
];

const STAGE_ICON: Record<VentasPipelineStage, typeof Sparkles> = {
  interesados: Sparkles,
  agendados: CalendarClock,
  convertidos: UserCheck,
  pendientes: Clock3,
  compraron: PartyPopper,
  descartados: XCircle,
};

const STAGE_THEME: Record<VentasPipelineStage, { header: string; icon: string; borderTop: string; avatarBg: string }> = {
  interesados: { header: "bg-sky-50 dark:bg-sky-950/30", icon: "text-sky-600", borderTop: "border-t-sky-400", avatarBg: "bg-sky-500" },
  agendados: { header: "bg-violet-50 dark:bg-violet-950/30", icon: "text-violet-600", borderTop: "border-t-violet-400", avatarBg: "bg-violet-500" },
  convertidos: { header: "bg-emerald-50 dark:bg-emerald-950/30", icon: "text-emerald-600", borderTop: "border-t-emerald-400", avatarBg: "bg-emerald-500" },
  pendientes: { header: "bg-amber-50 dark:bg-amber-950/30", icon: "text-amber-600", borderTop: "border-t-amber-400", avatarBg: "bg-amber-500" },
  compraron: { header: "bg-green-50 dark:bg-green-950/30", icon: "text-green-600", borderTop: "border-t-green-500", avatarBg: "bg-green-600" },
  descartados: { header: "bg-neutral-50 dark:bg-neutral-900", icon: "text-neutral-400", borderTop: "border-t-neutral-300", avatarBg: "bg-neutral-400" },
};

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.round(hrs / 24);
  return `hace ${days} d`;
}

function initials(nombre: string) {
  return nombre
    .replace(/^WhatsApp\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";
}

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
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <MessageCircle className="size-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Todavía no ha entrado ningún mensaje por esta línea.</p>
        <p className="text-xs text-muted-foreground">
          En cuanto alguien te escriba, va a aparecer aquí clasificado automáticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {STAGE_ORDER.map((stage) => {
        const stageItems = items.filter((i) => i.stage === stage);
        if (stageItems.length === 0) return null;
        const Icon = STAGE_ICON[stage];
        const theme = STAGE_THEME[stage];
        return (
          <div key={stage} className="flex w-64 shrink-0 flex-col gap-2">
            <div className={cn("flex items-center gap-1.5 rounded-md px-2 py-1.5", theme.header)}>
              <Icon className={cn("size-3.5 shrink-0", theme.icon)} />
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
                {STAGE_LABELS[stage]}
              </p>
              <span className="ml-auto rounded-full bg-background/80 px-1.5 text-[11px] font-semibold text-foreground/70">
                {stageItems.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {stageItems.map((item) => {
                const ultimo = item.historial[item.historial.length - 1];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOpenId(item.id)}
                    className={cn(
                      "flex flex-col gap-1.5 rounded-md border border-t-4 bg-background p-2.5 text-left text-sm shadow-sm transition-shadow hover:shadow-md hover:bg-muted/40",
                      theme.borderTop,
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white",
                          theme.avatarBg,
                        )}
                      >
                        {initials(item.nombre)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{item.nombre.replace(/^WhatsApp\s*/i, "")}</span>
                      {!item.botActivo && (
                        <span title="Bot apagado">
                          <BotOff className="size-3.5 shrink-0 text-muted-foreground" />
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{item.whatsappNumber}</span>
                    {ultimo && (
                      <span className="truncate text-xs text-muted-foreground">
                        {ultimo.role === "assistant" && "Tú: "}
                        {ultimo.content}
                      </span>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground/70">
                      <span>{relativeTime(item.updatedAt)}</span>
                      <span>{item.historial.length} msj</span>
                    </div>
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
