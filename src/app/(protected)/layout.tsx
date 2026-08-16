import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { RegisterServiceWorker } from "@/components/push/register-sw";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: attendance } = await supabase
    .from("attendance")
    .select("id, clock_in, clock_out")
    .eq("user_id", profile.id)
    .gte("clock_in", todayStart.toISOString())
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="flex min-h-screen w-full">
      <RegisterServiceWorker />
      <Sidebar
        role={profile.role}
        name={profile.name}
        userId={profile.id}
        avatarUrl={profile.avatar_url}
        attendance={attendance ?? null}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">{children}</main>
    </div>
  );
}
