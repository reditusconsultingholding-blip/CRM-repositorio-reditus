"use client";

import { Mic, MicOff, PhoneCall, PhoneOff, Volume2 } from "lucide-react";
import { useVoiceRoom } from "@/components/chat/use-voice-room";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function ParticipantBubble({ name, speaking, muted }: { name: string; speaking: boolean; muted?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground ring-2 ring-transparent transition-all",
          speaking && "ring-green-500",
        )}
      >
        {initials(name)}
      </div>
      <span className="flex max-w-20 items-center gap-1 truncate text-xs text-muted-foreground">
        {muted && <MicOff className="size-3 shrink-0" />}
        {name}
      </span>
    </div>
  );
}

export function VoiceRoomPanel({ userId, userName }: { userId: string; userName: string }) {
  const { joined, connecting, error, muted, localSpeaking, participants, join, leave, toggleMute } = useVoiceRoom(
    "sala-general",
    userId,
    userName,
  );

  return (
    <div className="flex flex-col gap-3 border-b bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">
            {joined ? `En la llamada — ${participants.length + 1} conectado(s)` : "Sala de voz"}
          </p>
        </div>
        {joined ? (
          <div className="flex items-center gap-1.5">
            <Button type="button" size="icon-sm" variant={muted ? "default" : "outline"} onClick={toggleMute} title={muted ? "Activar micrófono" : "Silenciar"}>
              {muted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
            </Button>
            <Button type="button" size="sm" variant="destructive" className="gap-1.5" onClick={leave}>
              <PhoneOff className="size-3.5" />
              Salir
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" className="gap-1.5" onClick={join} disabled={connecting}>
            <PhoneCall className="size-3.5" />
            {connecting ? "Conectando…" : "Unirse a la llamada"}
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {joined && (
        <div className="flex flex-wrap items-start gap-4 pt-1">
          <ParticipantBubble name={`${userName} (tú)`} speaking={localSpeaking} muted={muted} />
          {participants.map((p) => (
            <ParticipantBubble key={p.userId} name={p.name} speaking={p.speaking} />
          ))}
        </div>
      )}

      {!joined && (
        <p className="text-xs text-muted-foreground">
          Entra a la llamada para hablar en vivo con quien más esté conectado — el chat de abajo es de esta
          sala, para dejar mensajes, links o lo que necesiten sin tener que estar en la llamada.
        </p>
      )}
    </div>
  );
}
