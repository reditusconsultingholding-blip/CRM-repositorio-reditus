"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <AlertTriangle className="size-10 text-muted-foreground" />
      <h1 className="font-heading text-xl font-semibold">Algo salió mal</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ocurrió un error inesperado cargando esta página. Puede ser algo temporal — intenta de
        nuevo; si sigue pasando, avísale al administrador.
      </p>
      <Button onClick={reset}>Intentar de nuevo</Button>
    </div>
  );
}
