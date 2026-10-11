import { requireProfile } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { AppSwitcher } from "@/components/app-switcher";
import { PULSO_ROLES } from "@/lib/roles";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  // El selector CRM / Pulso solo aparece para quien puede ver Pulso; con él
  // arriba, la barra lateral se acorta lo que mide (--app-bar).
  const conPulso = PULSO_ROLES.includes(profile.role);

  return (
    <div
      className="flex min-h-screen w-full flex-col"
      style={{ "--app-bar": conPulso ? "2.75rem" : "0px" } as React.CSSProperties}
    >
      {conPulso && <AppSwitcher />}
      <div className="flex w-full flex-1">
        <Sidebar role={profile.role} name={profile.name} userId={profile.id} avatarUrl={profile.avatar_url} />
        <main className="mx-auto w-full max-w-6xl flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
