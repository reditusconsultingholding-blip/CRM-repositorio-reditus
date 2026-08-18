"use client";

import { useActionState, useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { signIn, checkEmailStatus, createPasswordAndSignIn } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InstallAppButton } from "@/components/install-app-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

type Step = "email" | "password" | "crear";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();

  const [signInState, signInAction, signInPending] = useActionState(signIn, undefined);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, startCreating] = useTransition();

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    const clean = email.trim();
    if (!clean) return;
    startChecking(async () => {
      const status = await checkEmailStatus(clean);
      if (!status.found) {
        setEmailError("Ese correo no está registrado. Pídele acceso al administrador.");
        return;
      }
      if (!status.active) {
        setEmailError("Esta cuenta está desactivada. Contacta al administrador.");
        return;
      }
      setStep(status.passwordSet ? "password" : "crear");
    });
  }

  function handleCreatePassword(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (newPassword.length < 8) {
      setCreateError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setCreateError("Las contraseñas no coinciden.");
      return;
    }
    startCreating(async () => {
      const result = await createPasswordAndSignIn(email.trim(), newPassword);
      if (result?.error) setCreateError(result.error);
    });
  }

  function volver() {
    setStep("email");
    setEmailError(null);
    setCreateError(null);
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-4 text-center">
            <p className="text-sm font-medium">¿Vas a usar Reditus CRM desde el celular?</p>
            <p className="text-xs text-muted-foreground">
              Instálala como una app antes de iniciar sesión — así te llegan notificaciones y abre más
              rápido, sin tener que buscarla en el navegador cada vez.
            </p>
            <InstallAppButton />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Reditus CRM</CardTitle>
            <CardDescription>
              {step === "email" && "Escribe tu correo para empezar."}
              {step === "password" && "Ingresa tu contraseña."}
              {step === "crear" && "Es tu primera vez — crea tu contraseña."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "email" && (
              <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Correo</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {emailError && <p className="text-sm text-destructive">{emailError}</p>}
                <Button type="submit" disabled={checking} className="mt-2">
                  {checking ? "Verificando…" : "Continuar"}
                </Button>
              </form>
            )}

            {step === "password" && (
              <form action={signInAction} className="flex flex-col gap-4">
                <input type="hidden" name="email" value={email} />
                <button
                  type="button"
                  onClick={volver}
                  className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-3" />
                  {email}
                </button>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    autoFocus
                    autoComplete="current-password"
                  />
                </div>
                {signInState?.error && <p className="text-sm text-destructive">{signInState.error}</p>}
                <Button type="submit" disabled={signInPending} className="mt-2">
                  {signInPending ? "Ingresando…" : "Ingresar"}
                </Button>
              </form>
            )}

            {step === "crear" && (
              <form onSubmit={handleCreatePassword} className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={volver}
                  className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-3" />
                  {email}
                </button>
                <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                  Es la primera vez que entras con este correo — crea tu contraseña para poder acceder.
                </p>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new_password">Nueva contraseña</Label>
                  <Input
                    id="new_password"
                    type="password"
                    required
                    minLength={8}
                    autoFocus
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="confirm_password">Confirmar contraseña</Label>
                  <Input
                    id="confirm_password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                {createError && <p className="text-sm text-destructive">{createError}</p>}
                <Button type="submit" disabled={creating} className="mt-2">
                  {creating ? "Creando…" : "Crear contraseña y entrar"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
