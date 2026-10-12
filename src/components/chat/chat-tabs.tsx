"use client";

import { useState } from "react";
import { Hash, Volume2 } from "lucide-react";
import { ChatView } from "@/components/chat/chat-view";
import { VoiceRoomPanel } from "@/components/chat/voice-room-panel";

type Channel = { id: string; slug: string; name: string };
type Person = { id: string; name: string; avatar_url?: string | null };

// Chat tipo Slack: columna de canales a la izquierda, conversación al
// centro. La sala de voz es una entrada más de la columna (antes era una
// pestaña «Voz» arriba). Igual que antes, solo hay una vista montada a la
// vez: al entrar a la sala de voz se desmonta la de texto y viceversa, así
// la lógica de mensajes y de la llamada no cambia.
export function ChatTabs({
  textChannels,
  salaDeVoz,
  people,
  allPeople,
  currentUserId,
  currentUserName,
  canModerate,
  canManageChannels,
}: {
  textChannels: Channel[];
  salaDeVoz: Channel | null;
  people: Person[];
  allPeople?: { id: string; name: string }[];
  currentUserId: string;
  currentUserName: string;
  canModerate: boolean;
  canManageChannels: boolean;
}) {
  const [tab, setTab] = useState<"texto" | "voz">("texto");

  if (tab === "texto") {
    return (
      <ChatView
        channels={textChannels}
        people={people}
        allPeople={allPeople}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        canModerate={canModerate}
        canManageChannels={canManageChannels}
        sidebarExtra={
          <>
            <p className="rd-lado-titulo hidden md:mt-4 md:block">Voz</p>
            <button type="button" onClick={() => setTab("voz")} className="rd-lado-enlace shrink-0 text-left md:w-full">
              <Volume2 className="size-4 shrink-0" />
              <span className="truncate">Sala de voz</span>
            </button>
          </>
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
      <div className="dark rd-lado flex shrink-0 items-center gap-1 overflow-x-auto rounded-2xl p-2 md:w-60 md:flex-col md:items-stretch md:gap-0.5 md:p-3">
        <p className="rd-lado-titulo hidden md:block">Canales</p>
        <button type="button" onClick={() => setTab("texto")} className="rd-lado-enlace shrink-0 text-left md:w-full">
          <Hash className="size-4 shrink-0" />
          <span className="truncate">Canales y mensajes</span>
        </button>
        <p className="rd-lado-titulo hidden md:mt-4 md:block">Voz</p>
        <button type="button" aria-current="page" className="rd-lado-enlace shrink-0 text-left md:w-full">
          <Volume2 className="size-4 shrink-0" />
          <span className="truncate">Sala de voz</span>
        </button>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <VoiceRoomPanel userId={currentUserId} userName={currentUserName} />
        {salaDeVoz ? (
          <ChatView
            channels={[salaDeVoz]}
            people={people}
            allPeople={allPeople}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            canModerate={canModerate}
            canManageChannels={canManageChannels}
            hideSidebar
          />
        ) : (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            La sala de voz todavía no está configurada — corre la migración pendiente y recarga.
          </p>
        )}
      </div>
    </div>
  );
}
