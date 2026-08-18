"use client";

import { useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Boundary de errores de toda la app. Antes no existía ninguno, así que
 * cualquier tropiezo — hasta uno tan tonto como un chunk de JS viejo
 * después de un redeploy — caía en la pantalla genérica de Next.js
 * ("Algo salió mal") sin ninguna salida. Eso es lo que Sebastián venía
 * reportando en /flujo: no hay error real en el servidor (revisado con
 * los logs de Vercel), es casi seguro un chunk viejo en el navegador tras
 * uno de los muchos redeploys — así que aquí lo detectamos y recargamos
 * solos, sin que el usuario tenga que hacer nada ni pensar que la app se
 * rompió. Si es un error real, se ve un mensaje claro con botón de
 * reintentar en vez de la pantalla genérica. */
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reloadedOnceKey = "reditus-auto-reload-once";
  const attempted = useRef(false);

  useEffect(() => {
    const isChunkError =
      /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|dynamically imported module/i.test(
        error.message ?? "",
      );
    if (!isChunkError || attempted.current) return;
    attempted.current = true;

    // Evita un loop infinito de recargas si el error persiste — solo
    // reintenta una vez por sesión de navegador.
    const already = sessionStorage.getItem(reloadedOnceKey);
    if (already) return;
    sessionStorage.setItem(reloadedOnceKey, "1");
    window.location.reload();
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-amber-100">
        <RefreshCw className="size-5 text-amber-700" />
      </div>
      <h1 className="font-heading text-lg font-semibold">Se cruzó algo por el camino</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Fue un tropiezo puntual, no un daño en tus datos. Presiona reintentar — si vuelve a pasar,
        avísale al equipo técnico con la hora exacta.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Reintentar</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Recargar la página
        </Button>
      </div>
    </div>
  );
}
