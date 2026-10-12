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
    <div className="flex w-20 flex-col items-center gap-1.5">
      <div
        className={cn(
          "relative flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] font-heading text-sm font-semibold text-white ring-2 ring-transparent transition-all motion-reduce:transition-none",
          speaking && "border-transparent ring-[#34d399] shadow-[0_0_22px_-2px_#34d399]",
        )}
      >
        {initials(name)}
        {muted && (
          <span className="absolute -right-1.5 -bottom-1.5 flex size-5 items-center justify-center rounded-full border border-[#060a14] bg-[#ff6b81] text-white">
            <MicOff className="size-3" />
          </span>
        )}
      </div>
      <span className="w-full truncate text-center text-xs text-white/70">{name}</span>
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
    <div className="dark relative flex shrink-0 flex-col gap-4 overflow-hidden rounded-2xl border border-white/10 bg-[#060a14] p-4 text-white shadow-[0_20px_50px_-30px_rgba(0,114,255,0.8)] sm:p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_220px_at_0%_0%,rgba(0,114,255,0.32),transparent_70%),radial-gradient(420px_220px_at_100%_100%,rgba(0,198,255,0.14),transparent_70%)]"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#0072ff,#00c6ff)] shadow-[0_0_20px_-6px_#00c6ff]">
            <Volume2 className="size-5" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="rd-etiqueta flex items-center gap-2 text-[#5cc8ff]">
              <span
                aria-hidden="true"
                className={cn("size-1.5 rounded-full", joined ? "bg-[#34d399] shadow-[0_0_8px_#34d399]" : "bg-white/30")}
              />
              {joined ? "En vivo" : "Sin conectar"}
            </p>
            <p className="truncate font-heading text-base font-semibold">
              {joined ? `En la llamada — ${participants.length + 1} conectado(s)` : "Sala de voz"}
            </p>
          </div>
        </div>
        {joined ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={toggleMute}
              title={muted ? "Activar micrófono" : "Silenciar"}
              className={cn(
                "gap-1.5 border-white/15 bg-white/[0.06] text-white hover:bg-white/15 hover:text-white",
                muted && "border-[#ff6b81]/60 bg-[#ff6b81]/20 hover:bg-[#ff6b81]/30",
              )}
            >
              {muted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
              {muted ? "Activar micrófono" : "Silenciar"}
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

      {error && <p className="relative text-xs text-destructive">{error}</p>}

      {joined && (
        <div className="relative flex flex-wrap items-start gap-3">
          <ParticipantBubble name={`${userName} (tú)`} speaking={localSpeaking} muted={muted} />
          {participants.map((p) => (
            <ParticipantBubble key={p.userId} name={p.name} speaking={p.speaking} />
          ))}
        </div>
      )}

      {!joined && (
        <p className="relative max-w-2xl text-xs leading-relaxed text-white/60">
          Entra a la llamada para hablar en vivo con quien más esté conectado — el chat de abajo es de esta
          sala, para dejar mensajes, links o lo que necesiten sin tener que estar en la llamada.
        </p>
      )}
    </div>
  );
}
