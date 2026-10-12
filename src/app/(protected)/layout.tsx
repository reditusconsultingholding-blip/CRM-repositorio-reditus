import { requireProfile } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { CrmShell } from "@/components/crm-shell";
import { PageTransition } from "@/components/page-transition";
import { TEMA_SCRIPT } from "@/lib/tema-script";
import { PULSO_ROLES } from "@/lib/roles";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  // El selector CRM / Pulso solo aparece para quien puede ver Pulso; la barra
  // superior (dónde estás, tema y avisos) la ve todo el equipo.
  const conPulso = PULSO_ROLES.includes(profile.role);

  return (
    <>
      {/* Pone el tema claro/oscuro antes de pintar, para que no destelle */}
      <script dangerouslySetInnerHTML={{ __html: TEMA_SCRIPT }} />
      <CrmShell
        conPulso={conPulso}
        userId={profile.id}
        sidebar={<Sidebar role={profile.role} name={profile.name} userId={profile.id} avatarUrl={profile.avatar_url} />}
      >
        <PageTransition>{children}</PageTransition>
      </CrmShell>
    </>
  );
}
