import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { ChatTabs } from "@/components/chat/chat-tabs";

const SALA_DE_VOZ_SLUG = "sala-de-voz";

export default async function ChatPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const canManageChannels = ["ceo", "gerente_comercial", "directora_operativa"].includes(profile.role);

  // No selecciona es_sala_voz aquí a propósito — esa columna es nueva y
  // si la migración todavía no corrió, no queremos que TODO el chat se
  // quede sin canales. La sala de voz se detecta por su slug fijo, así
  // esta consulta sigue siendo la misma de siempre.
  const [{ data: memberships, error: membershipsError }, { data: people }] = await Promise.all([
    supabase.from("chat_channel_members").select("channel_id, chat_channels(id, slug, name)").eq("user_id", profile.id),
    supabase
      .from("users")
      .select("id, name, avatar_url")
      .eq("active", true)
      .neq("id", profile.id)
      .order("name"),
  ]);

  // Si la migración de membresías todavía no corrió, sigue mostrando todos
  // los canales (comportamiento anterior) en vez de romper el chat.
  let allChannels: { id: string; slug: string; name: string }[];
  if (membershipsError) {
    const { data: allBasic } = await supabase.from("chat_channels").select("id, slug, name").order("name");
    allChannels = allBasic ?? [];
  } else {
    allChannels = (memberships ?? [])
      .map((m) => (Array.isArray(m.chat_channels) ? m.chat_channels[0] : m.chat_channels))
      .filter((c): c is { id: string; slug: string; name: string } => !!c)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const salaDeVoz = allChannels.find((c) => c.slug === SALA_DE_VOZ_SLUG) ?? null;
  const textChannels = allChannels.filter((c) => c.slug !== SALA_DE_VOZ_SLUG);

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <h1 className="font-heading mb-3 text-2xl font-semibold tracking-tight">Chat interno</h1>
      <ChatTabs
        textChannels={textChannels}
        salaDeVoz={salaDeVoz}
        people={people ?? []}
        allPeople={[{ id: profile.id, name: profile.name }, ...(people ?? [])]}
        currentUserId={profile.id}
        currentUserName={profile.name}
        canModerate={profile.role === "ceo"}
        canManageChannels={canManageChannels}
      />
    </div>
  );
}
