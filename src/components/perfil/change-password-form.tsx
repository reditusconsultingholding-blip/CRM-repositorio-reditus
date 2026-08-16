"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { changeMyPassword } from "@/app/(protected)/perfil/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  function handleSubmit() {
    if (next !== confirm) {
      toast.error("Las contraseñas nuevas no coinciden.");
      return;
    }
    startTransition(async () => {
      try {
        await changeMyPassword(current, next);
        toast.success("Contraseña actualizada");
        formRef.current?.reset();
        setCurrent("");
        setNext("");
        setConfirm("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo cambiar la contraseña");
      }
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="current_password">Contraseña actual</Label>
        <Input
          id="current_password"
          type="password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="new_password">Nueva contraseña</Label>
        <Input
          id="new_password"
          type="password"
          required
          minLength={8}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm_password">Confirmar nueva contraseña</Label>
        <Input
          id="confirm_password"
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}
