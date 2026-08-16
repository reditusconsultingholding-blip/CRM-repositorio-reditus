import { requireProfile } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/perfil/change-password-form";
import { ChangeEmailForm } from "@/components/perfil/change-email-form";
import { EditProfileForm } from "@/components/perfil/edit-profile-form";
import { PushToggle } from "@/components/perfil/push-toggle";

export default async function PerfilPage() {
  const profile = await requireProfile();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Mi perfil</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Rol</span>
              <span className="font-medium">{ROLE_LABELS[profile.role]}</span>
            </div>
            <EditProfileForm
              userId={profile.id}
              name={profile.name}
              avatarUrl={profile.avatar_url}
              birthdate={profile.birthdate}
              phone={profile.phone}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Correo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Actual: {profile.email}</p>
              <ChangeEmailForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cambiar contraseña</CardTitle>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notificaciones push</CardTitle>
            </CardHeader>
            <CardContent>
              <PushToggle />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
