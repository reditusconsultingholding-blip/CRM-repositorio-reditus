"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { iniciarReto75 } from "@/app/(protected)/reto75/actions";

export function StartReto75Button() {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await iniciarReto75();
      if (result?.error) toast.error(result.error);
      else toast.success("Día 1 arrancó — ¡a por los 75!");
    });
  }

  return (
    <Button type="button" className="gap-1.5" onClick={handleClick} disabled={pending}>
      <Flame className="size-4" />
      {pending ? "Empezando…" : "Empezar el reto"}
    </Button>
  );
}
