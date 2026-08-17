"use client";

import { useEffect, useState } from "react";
import { getIngresosDeleteCode } from "@/app/(protected)/perfil/totp-actions";

/** Código de 6 dígitos que cambia cada 30 segundos — el mismo que se pide
 * al borrar un ingreso, para que no sea un borrado de un clic. Solo el CEO
 * lo ve. Se recalcula del lado del servidor, no se guarda en ningún lado. */
export function TotpCodeDisplay() {
  const [code, setCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const result = await getIngresosDeleteCode();
      if (cancelled) return;
      setConfigured(result.code !== null);
      setCode(result.code);
      setSecondsLeft(result.secondsLeft);
    }

    refresh();
    const t = setInterval(refresh, 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Falta configurar <code>INGRESOS_DELETE_TOTP_SECRET</code> en las variables de entorno.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="rounded-md border bg-muted/40 px-3 py-1.5 font-mono text-2xl font-semibold tracking-[0.3em]">
        {code ?? "······"}
      </span>
      <span className="text-xs text-muted-foreground">cambia en {secondsLeft}s</span>
    </div>
  );
}
