"use client";

import { useEffect } from "react";

/** Registra el service worker en cuanto carga cualquier página protegida —
 * necesario para que la app sea instalable (PWA) y para poder recibir
 * notificaciones push más adelante. No pide permisos por sí solo. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
