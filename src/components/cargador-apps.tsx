"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { cambioListo, leerCambio, suscribirCambio } from "@/lib/cambio-app";

// Pantalla de carga al cambiar entre CRM y Pulso. Se monta una sola vez en
// el layout raíz para que sobreviva al cambio de layout.
//  · Hacia Pulso: la quita <PulsoFrame> cuando el iframe dispara onLoad.
//  · Hacia el CRM: la quita este componente cuando la ruta nueva ya pintó
//    (la ruta dejó de ser /pulso y no queda ningún esqueleto de carga).
//  · En cualquier caso hay un tope de 15 s (lib/cambio-app.ts).
const NOMBRES = { crm: "CRM", pulso: "Pulso" } as const;

export function CargadorApps() {
  const cambio = useSyncExternalStore(suscribirCambio, leerCambio, () => null);
  const pathname = usePathname();
  const haciaCrm = cambio?.destino === "crm" && cambio.fase === "activa";

  useEffect(() => {
    if (!haciaCrm || pathname.startsWith("/pulso")) return;
    // La ruta ya cambió; se espera a que el contenido real reemplace al
    // esqueleto de loading.tsx antes de destapar.
    const id = setInterval(() => {
      const main = document.querySelector("main");
      if (main && !main.querySelector('[data-slot="skeleton"]')) {
        clearInterval(id);
        requestAnimationFrame(() => cambioListo("crm"));
      }
    }, 120);
    return () => clearInterval(id);
  }, [haciaCrm, pathname]);

  if (!cambio) return null;

  return (
    <div
      className="rd-carga"
      data-saliendo={cambio.fase === "saliendo"}
      role="status"
      aria-live="polite"
      aria-busy={cambio.fase === "activa"}
    >
      <div className="rd-login-fondo" aria-hidden="true" />
      <div className="rd-login-luz" aria-hidden="true" />
      <div className="relative flex flex-col items-center gap-8 text-center">
        {/* El aro y la bolita giran; el logo de Reditus queda quieto en el centro */}
        <div className="relative size-[84px]" aria-hidden="true">
          <div className="rd-carga-orbita" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/apple-icon" alt="" width={52} height={52} className="rd-carga-logo" />
        </div>
        <div className="flex flex-col items-center gap-3">
          <p className="rd-etiqueta text-[#5cc8ff]">Abriendo {NOMBRES[cambio.destino]}</p>
          <p className="max-w-xs font-heading text-xl font-semibold leading-snug tracking-tight text-white sm:max-w-none sm:text-2xl">
            Qué pena la demora, la calidad pesa.
          </p>
        </div>
      </div>
    </div>
  );
}
