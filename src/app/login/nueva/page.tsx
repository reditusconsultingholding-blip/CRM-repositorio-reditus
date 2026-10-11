"use client";

import { useActionState } from "react";
import { cambiarClave } from "../actions";
import { LoginMarco } from "../marco";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CAMPO = "h-12 border-white/15 bg-white/[0.06] text-base text-white";

// Última parada de «¿Olvidaste tu contraseña?»: la persona llega desde el
// enlace del correo (que ya le abrió la sesión) y escribe la nueva.
export default function NuevaClavePage() {
  const [estado, accion, guardando] = useActionState(cambiarClave, undefined);

  return (
    <LoginMarco>
      <form action={accion} className="rd-paso flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">Contraseña nueva</h2>
          <p className="text-sm leading-relaxed text-white/55">
            Elige una de 8 caracteres o más. Al guardarla entras directo al CRM.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password" className="text-white/75">
            Contraseña nueva
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoFocus
            autoComplete="new-password"
            className={CAMPO}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm" className="text-white/75">
            Repítela
          </Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={CAMPO}
          />
        </div>
        {estado?.error && (
          <p className="rounded-lg border border-[#ff8a8a]/25 bg-[#ff8a8a]/10 px-3 py-2 text-sm text-[#ffb1b1]">
            {estado.error}
          </p>
        )}
        <Button type="submit" disabled={guardando} className="rd-login-boton h-12 text-base">
          {guardando ? "Guardando…" : "Guardar y entrar"}
        </Button>
      </form>
    </LoginMarco>
  );
}
