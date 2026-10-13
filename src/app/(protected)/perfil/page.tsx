import { requireProfile } from "@/lib/auth";
import Link from "next/link";
import { ArrowRight, Crown, GraduationCap, Users } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/perfil/change-password-form";
import { ChangeEmailForm } from "@/components/perfil/change-email-form";
import { EditProfileForm } from "@/components/perfil/edit-profile-form";
import { PushToggle } from "@/components/perfil/push-toggle";
import { TotpCodeDisplay } from "@/components/perfil/totp-code-display";
import { PasskeyCard } from "@/components/perfil/passkey-card";

export default async function PerfilPage() {
  const profile = await requireProfile();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Mi perfil</h1>

      {/* Accesos del CEO: antes estaban en el menú lateral */}
      {profile.role === "ceo" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { href: "/ceo", icono: Crown, titulo: "Panel CEO", texto: "Rentabilidad, reportes y estado de las plataformas." },
            { href: "/admin/usuarios", icono: Users, titulo: "Usuarios", texto: "Personas del equipo, roles y accesos." },
            // Privada: no aparece en el menú lateral, solo aquí.
            { href: "/maestria", icono: GraduationCap, titulo: "Maestría en negociación", texto: "Clases, juego de rol con IA y tu progreso. Solo tú la ves." },
          ].map((a) => {
            const Icono = a.icono;
            return (
              <Link key={a.href} href={a.href} className="group rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Card className="h-full transition-[border-color,transform] duration-200 group-hover:-translate-y-0.5 group-hover:border-ring/70 motion-reduce:transform-none">
                  <CardContent className="flex items-center gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#0072ff,#00c6ff)] text-white shadow-[0_0_18px_-6px_#00c6ff]">
                      <Icono className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block font-heading text-base font-semibold tracking-tight">{a.titulo}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{a.texto}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {profile.role === "ceo" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Código para borrar ingresos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Solo tú ves este código — cámbia cada 30 segundos. Gerente Comercial lo necesita
              para poder borrar un ingreso, así que si hace falta compártelo de viva voz en el
              momento.
            </p>
            <TotpCodeDisplay />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entrar con huella o PIN</CardTitle>
        </CardHeader>
        <CardContent>
          <PasskeyCard />
        </CardContent>
      </Card>

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
