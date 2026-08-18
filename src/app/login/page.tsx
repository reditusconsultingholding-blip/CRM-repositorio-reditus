"use client";

import { useActionState } from "react";
import { signIn } from "./actions";
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

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, undefined);

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
            <CardDescription>Inicia sesión con tu cuenta de Reditus Consulting.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Correo</Label>
                <Input id="email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </div>
              {state?.error && (
                <p className="text-sm text-destructive">{state.error}</p>
              )}
              <Button type="submit" disabled={pending} className="mt-2">
                {pending ? "Ingresando…" : "Ingresar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
