"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Cargador «de sección»: el mismo aro con el logo de Reditus que se usa al
// cambiar CRM ↔ Pulso (`cargador-apps.tsx`), pero dentro del área de contenido:
// el menú y la barra superior siguen a la vista y se pueden usar.

/** Tope de seguridad: pasado este tiempo sin que cambie la página, se ofrece reintentar. */
const TOPE_MS = 15_000;

/** El dibujo: aro que gira con el logo quieto en el centro. */
export function AroReditus({ className }: { className?: string }) {
  return (
    <div className={cn("relative size-[84px] shrink-0", className)} aria-hidden="true">
      <div className="rd-carga-orbita" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/apple-icon" alt="" width={52} height={52} className="rd-carga-logo" />
    </div>
  );
}

/** Para `loading.tsx`: ocupa el área de contenido mientras el servidor arma la página. */
export function CargandoSeccion({ texto = "Qué pena la demora, la calidad pesa un poco." }: { texto?: string }) {
  // Si a los 15 s el servidor no ha respondido, se dice y se ofrece reintentar.
  const [lento, setLento] = useState(false);
  useEffect(() => {
    const reloj = window.setTimeout(() => setLento(true), TOPE_MS);
    return () => window.clearTimeout(reloj);
  }, []);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center" role="status" aria-live="polite" data-cargando-seccion>
      {/* `data-slot="skeleton"`: el cambio CRM ↔ Pulso espera a que no quede ninguno para destaparse. */}
      <span data-slot="skeleton" hidden />
      <AroReditus />
      {lento ? (
        <>
          <p className="text-[15px] font-medium">Está tardando más de lo normal.</p>
          <Button onClick={() => window.location.reload()}>Reintentar</Button>
        </>
      ) : (
        <p className="text-[15px] font-medium text-muted-foreground">{texto}</p>
      )}
    </div>
  );
}

const EVENTO = "rd:navegando";
/** Para botones que cambian de página con `router.push`: enciende el cargador al instante. */
export function avisarNavegacion(destino: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO, { detail: destino }));
}

/** Menos que esto no se muestra nada: una página que ya estaba lista no debe parpadear. */
const RETARDO_MS = 120;

type Pendiente = { destino: string; desde: string; lento: boolean; visible: boolean };

function Vigia() {
  const pathname = usePathname();
  const parametros = useSearchParams();
  const aqui = `${pathname}?${parametros.toString()}`;
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);

  // En cuanto se hace clic en un enlace interno (menú, submenú, pestañas, tarjetas), se enciende.
  useEffect(() => {
    const encender = (destino: string) => {
      const u = new URL(destino, window.location.href);
      if (u.origin !== window.location.origin) return;
      const actual = `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`;
      if (`${u.pathname}?${u.searchParams.toString()}` === actual) return;
      // Hacia Pulso manda su propia pantalla de carga.
      if (u.pathname.startsWith("/pulso") || u.pathname.startsWith("/api/")) return;
      setPendiente({ destino: u.pathname + u.search, desde: actual, lento: false, visible: false });
    };
    const alClic = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      encender(a.href);
    };
    const alAviso = (e: Event) => encender(String((e as CustomEvent).detail ?? ""));
    document.addEventListener("click", alClic);
    window.addEventListener(EVENTO, alAviso);
    return () => {
      document.removeEventListener("click", alClic);
      window.removeEventListener(EVENTO, alAviso);
    };
  }, []);

  // Se muestra tras un instante y, si a los 15 s la página no cambió, se ofrece reintentar.
  const esperando = pendiente && pendiente.desde === aqui ? pendiente : null;
  const clave = esperando ? `${esperando.destino}|${esperando.desde}` : "";
  useEffect(() => {
    if (!clave) return;
    const ver = window.setTimeout(() => setPendiente((p) => (p ? { ...p, visible: true } : p)), RETARDO_MS);
    const lento = window.setTimeout(() => setPendiente((p) => (p ? { ...p, lento: true } : p)), TOPE_MS);
    return () => {
      window.clearTimeout(ver);
      window.clearTimeout(lento);
    };
  }, [clave]);

  // La dirección ya cambió (o se volvió atrás): `esperando` deja de valer y no se pinta nada.
  // (El logo se deja ya descargado: con red lenta el aro no puede salir sin su centro.)
  // eslint-disable-next-line @next/next/no-img-element
  if (!esperando || !esperando.visible) return <img src="/apple-icon" alt="" width={1} height={1} hidden />;
  return (
    <div className="absolute inset-0 z-30 rounded-xl bg-background/75 backdrop-blur-[2px]" role="status" aria-live="polite" aria-busy={!esperando.lento} data-navegando={esperando.destino}>
      <div className="sticky top-[calc(var(--app-bar,3rem)+18vh)] flex flex-col items-center gap-4 px-4 py-10 text-center">
        <AroReditus />
        {esperando.lento ? (
          <>
            <p className="text-[15px] font-medium">Está tardando más de lo normal.</p>
            <div className="flex gap-2">
              <Button onClick={() => window.location.assign(esperando.destino)}>Reintentar</Button>
              <Button variant="outline" onClick={() => setPendiente(null)}>
                Quedarme aquí
              </Button>
            </div>
          </>
        ) : (
          <p className="text-[15px] font-medium text-muted-foreground">Qué pena la demora, la calidad pesa un poco.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Se monta una vez dentro del área de contenido del CRM (que debe ser `relative`).
 * Avisa al instante de que una navegación está en camino, sin tapar el menú.
 */
export function CargadorDeNavegacion() {
  return (
    <Suspense fallback={null}>
      <Vigia />
    </Suspense>
  );
}
