import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { ChatView } from "@/components/chat/chat-view";

export default async function ChatPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: channels }, { data: people }] = await Promise.all([
    supabase.from("chat_channels").select("id, slug, name").order("name"),
    supabase
      .from("users")
      .select("id, name")
      .eq("active", true)
      .neq("id", profile.id)
      .order("name"),
  ]);

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <h1 className="font-heading mb-3 text-2xl font-semibold tracking-tight">Chat interno</h1>
      <ChatView
        channels={channels ?? []}
        people={people ?? []}
        currentUserId={profile.id}
        currentUserName={profile.name}
      />
    </div>
  );
}
