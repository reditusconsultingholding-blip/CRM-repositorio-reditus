"use client";

import { useState } from "react";
import { MessageSquare, Volume2 } from "lucide-react";
import { ChatView } from "@/components/chat/chat-view";
import { VoiceRoomPanel } from "@/components/chat/voice-room-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Channel = { id: string; slug: string; name: string };
type Person = { id: string; name: string; avatar_url?: string | null };

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
  const [tab, setTab] = useState("texto");

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col overflow-hidden">
      <TabsList className="mb-2 w-fit">
        <TabsTrigger value="texto" className="gap-1.5">
          <MessageSquare className="size-3.5" />
          Texto
        </TabsTrigger>
        <TabsTrigger value="voz" className="gap-1.5">
          <Volume2 className="size-3.5" />
          Voz
        </TabsTrigger>
      </TabsList>

      <TabsContent value="texto" className="flex flex-1 overflow-hidden">
        <ChatView
          channels={textChannels}
          people={people}
          allPeople={allPeople}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          canModerate={canModerate}
          canManageChannels={canManageChannels}
        />
      </TabsContent>

      <TabsContent value="voz" className="flex flex-1 flex-col overflow-hidden rounded-md border bg-background">
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
          <p className="p-6 text-center text-sm text-muted-foreground">
            La sala de voz todavía no está configurada — corre la migración pendiente y recarga.
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}
