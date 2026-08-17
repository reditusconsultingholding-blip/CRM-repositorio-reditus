import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { ChatView } from "@/components/chat/chat-view";

export default async function ChatPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const canManageChannels = ["ceo", "gerente_comercial", "directora_operativa"].includes(profile.role);

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
  let channels: { id: string; slug: string; name: string }[];
  if (membershipsError) {
    const { data: allChannels } = await supabase.from("chat_channels").select("id, slug, name").order("name");
    channels = allChannels ?? [];
  } else {
    channels = (memberships ?? [])
      .map((m) => (Array.isArray(m.chat_channels) ? m.chat_channels[0] : m.chat_channels))
      .filter((c): c is { id: string; slug: string; name: string } => !!c)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <h1 className="font-heading mb-3 text-2xl font-semibold tracking-tight">Chat interno</h1>
      <ChatView
        channels={channels}
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
