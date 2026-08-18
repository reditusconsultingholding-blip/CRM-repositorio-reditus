"use client";

import { useEffect } from "react";

/** Red de seguridad final — si hasta el layout raíz falla al renderizar
 * (algo que error.tsx no puede atrapar porque vive dentro del layout),
 * esto evita la pantalla en blanco/genérica de Next.js y al menos
 * intenta una recarga automática una vez. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    const already = sessionStorage.getItem("reditus-auto-reload-once-root");
    if (already) return;
    sessionStorage.setItem("reditus-auto-reload-once-root", "1");
    window.location.reload();
  }, [error]);

  return (
    <html lang="es">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
          <div style={{ textAlign: "center", padding: 24 }}>
            <p style={{ fontSize: 16, fontWeight: 600 }}>Recargando…</p>
            <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
              Si esto no se resuelve solo, avísale al equipo técnico.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
