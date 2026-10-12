import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { PULSO_ROLES } from "@/lib/roles";
import { AppSwitcher } from "@/components/app-switcher";

// Pulso vive fuera del layout (protected) porque trae su propio menú
// lateral: aquí solo va el selector de arriba y la app a pantalla completa.
export default async function PulsoLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  if (!PULSO_ROLES.includes(profile.role)) redirect("/dashboard");

  return (
    <div className="flex h-dvh w-full flex-col bg-[#060a14]">
      <AppSwitcher />
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
