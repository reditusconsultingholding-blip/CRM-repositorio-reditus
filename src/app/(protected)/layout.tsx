import { requireProfile } from "@/lib/auth";
import { Nav } from "@/components/nav";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="flex flex-1 flex-col">
      <Nav role={profile.role} name={profile.name} userId={profile.id} />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4">{children}</main>
    </div>
  );
}
