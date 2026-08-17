"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { changeMyEmail } from "@/app/(protected)/perfil/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangeEmailForm() {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");

  function handleSubmit() {
    startTransition(async () => {
      const result = await changeMyEmail(password, email);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Correo actualizado");
        formRef.current?.reset();
        setPassword("");
        setEmail("");
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="new_email">Nuevo correo</Label>
        <Input id="new_email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email_password">Confirma tu contraseña actual</Label>
        <Input
          id="email_password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Cambiar correo"}
      </Button>
    </form>
  );
}
