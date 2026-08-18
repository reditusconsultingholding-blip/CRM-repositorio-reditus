"use client";

import { Button } from "@/components/ui/button";
import { Bug } from "lucide-react";

/** Botón de prueba para confirmar que Sentry está capturando errores de
 * verdad — lanza un error a propósito (la misma técnica que sugiere
 * Sentry: llamar a una función que no existe) para que llegue al
 * error.tsx más cercano y de ahí a Sentry.captureException. Si aparece
 * en tu dashboard de Sentry en sentry.io, quedó bien configurado. */
export function SentryTestButton() {
  return (
    <Button
      type="button"
      variant="outline"
      className="gap-1.5"
      onClick={() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).myUndefinedFunction();
      }}
    >
      <Bug className="size-3.5" />
      Probar monitoreo de errores
    </Button>
  );
}
