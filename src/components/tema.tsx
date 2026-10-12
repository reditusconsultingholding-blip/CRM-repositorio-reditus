"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CLAVE_TEMA as CLAVE } from "@/lib/tema-script";

// Tema claro / oscuro del CRM (el mismo interruptor que tiene Pulso).
// Sin elección guardada sigue al sistema; al usar el interruptor la elección
// queda en este navegador. La clase .dark va en <html> para que también la
// hereden los diálogos y menús, que se pintan fuera del layout.
const EVENTO = "rd-tema";

function oscuroPreferido(): boolean {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === "oscuro") return true;
    if (guardado === "claro") return false;
  } catch {
    // Sin acceso a localStorage: se sigue al sistema.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function aplicar(oscuro: boolean) {
  document.documentElement.classList.toggle("dark", oscuro);
  window.dispatchEvent(new Event(EVENTO));
}

function suscribir(f: () => void) {
  window.addEventListener(EVENTO, f);
  return () => window.removeEventListener(EVENTO, f);
}
const leer = () => document.documentElement.classList.contains("dark");

/** Aplica el tema mientras se está dentro del CRM y lo retira al salir (login, Pulso). */
export function TemaGuardia() {
  useEffect(() => {
    aplicar(oscuroPreferido());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const alCambiar = () => aplicar(oscuroPreferido());
    mq.addEventListener("change", alCambiar);
    return () => {
      mq.removeEventListener("change", alCambiar);
      document.documentElement.classList.remove("dark");
    };
  }, []);
  return null;
}

export function BotonTema() {
  const oscuro = useSyncExternalStore(suscribir, leer, () => false);
  return (
    <button
      type="button"
      className="rd-tema"
      aria-pressed={oscuro}
      aria-label="Modo oscuro"
      title={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      onClick={() => {
        const nuevo = !leer();
        try {
          localStorage.setItem(CLAVE, nuevo ? "oscuro" : "claro");
        } catch {
          // Si no se puede guardar, igual se cambia para esta visita.
        }
        aplicar(nuevo);
      }}
    />
  );
}
