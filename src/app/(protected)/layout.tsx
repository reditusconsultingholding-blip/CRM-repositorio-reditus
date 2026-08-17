import { requireProfile } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { RegisterServiceWorker } from "@/components/push/register-sw";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="flex min-h-screen w-full">
      <RegisterServiceWorker />
      <Sidebar role={profile.role} name={profile.name} userId={profile.id} avatarUrl={profile.avatar_url} />
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">{children}</main>
    </div>
  );
}
