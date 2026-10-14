"use client";

import { useState, useTransition } from "react";
import { darDeBaja } from "./actions";

/** Un solo clic. El botón (y no la carga de la página) hace la baja: así un filtro de correo que abre los enlaces no da de baja a nadie por error. */
export function BotonBaja({ token, correo }: { token: string; correo: string }) {
  const [estado, setEstado] = useState<"inicio" | "hecho" | "fallo">("inicio");
  const [pendiente, iniciar] = useTransition();

  if (estado === "hecho") {
    return (
      <div className="flex flex-col gap-2 text-center">
        <p className="text-lg font-semibold">Listo: no te volvemos a escribir.</p>
        <p className="text-sm text-muted-foreground">Quitamos {correo} de nuestra lista. No hace falta que hagas nada más.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">
        Vas a dejar de recibir correos de Reditus Consulting en <span className="font-medium text-foreground">{correo}</span>.
      </p>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => iniciar(async () => setEstado((await darDeBaja(token)).ok ? "hecho" : "fallo"))}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pendiente ? "Un momento…" : "Darme de baja"}
      </button>
      {estado === "fallo" && <p className="text-sm text-destructive">No se pudo. Responde «no» al correo y no te volvemos a escribir.</p>}
    </div>
  );
}
