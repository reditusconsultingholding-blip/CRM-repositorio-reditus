"use client";

import { useEffect, useSyncExternalStore } from "react";
import { cambioListo, iniciarCambio } from "@/lib/cambio-app";

const sinSuscripcion = () => () => {};

// El iframe de Pulso. Mientras carga queda tapado por el cargador de
// <CargadorApps>; al dispararse onLoad se destapa. El iframe se crea ya en
// el navegador (no en el HTML del servidor) para no perder nunca el onLoad.
export function PulsoFrame({ src }: { src: string }) {
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);

  useEffect(() => {
    // Si se llegó por el selector, el cargador ya está puesto y esto no lo
    // reinicia; si se entró directo a /pulso, lo pone.
    iniciarCambio("pulso");
    return () => cambioListo("pulso");
  }, []);

  if (!montado) return null;

  return (
    <iframe
      src={src}
      title="Pulso · resultados de las páginas de clientes"
      className="block h-full w-full border-0"
      allow="fullscreen; clipboard-write"
      allowFullScreen
      // Un respiro corto para que Pulso alcance a pintar su primera pantalla.
      onLoad={() => setTimeout(() => cambioListo("pulso"), 350)}
      onError={() => cambioListo("pulso")}
    />
  );
}
