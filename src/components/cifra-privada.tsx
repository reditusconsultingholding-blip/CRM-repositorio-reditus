"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  leerCifrasOcultas,
  ponerCifrasOcultas,
  sincronizarCookieCifras,
  suscribirCifras,
} from "@/lib/modo-privado";

/** true = cifras ocultas. En el servidor y antes de hidratar siempre es true. */
export function useCifrasOcultas() {
  return useSyncExternalStore(suscribirCifras, leerCifrasOcultas, () => true);
}

const GLIFOS = "0123456789$#%&@<>/\\=+*";
const LARGO = 9;

function ruido() {
  let s = "";
  for (let i = 0; i < LARGO; i++) s += GLIFOS[Math.floor(Math.random() * GLIFOS.length)];
  return s;
}

/** Los caracteres cambiando solos. No recibe ni conoce la cifra real. */
function Cifrado() {
  // Arranca con puntos fijos (lo que queda con «reducir movimiento»); el
  // baile de caracteres solo empieza si el sistema permite animación.
  const [texto, setTexto] = useState("•".repeat(LARGO));

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTexto(ruido()), 80);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <span aria-hidden="true" className="select-none text-[#0a6cb8] dark:text-[#22b8ff]">
        {texto}
      </span>
      <span className="sr-only">Cifra oculta</span>
    </>
  );
}

/**
 * Una cifra de dinero de la empresa. Con el modo privado puesto (o si el
 * servidor no mandó el valor) pinta solo el efecto: el número real no está
 * en el DOM, ni en title ni en aria-label. El ancho es fijo para que nada
 * salte al alternar.
 */
export function Cifra({
  valor,
  className,
  claseVisible,
}: {
  valor: string | null | undefined;
  className?: string;
  /** Clases que solo se aplican con la cifra a la vista (p. ej. verde/rojo: el color también delata). */
  claseVisible?: string;
}) {
  const ocultas = useCifrasOcultas();
  const visible = !ocultas && valor != null;
  return (
    <span
      className={cn(
        "inline-block min-w-[11ch] text-right font-mono whitespace-nowrap tabular-nums",
        className,
        visible && claseVisible,
      )}
    >
      {visible ? valor : <Cifrado />}
    </span>
  );
}

/** El ojo: oculta o muestra todas las cifras de la empresa a la vez (barra lateral, Panel CEO…). */
export function BotonCifras({ className, conTexto = false }: { className?: string; conTexto?: boolean }) {
  const ocultas = useCifrasOcultas();
  const router = useRouter();
  const pathname = usePathname();
  // El Panel CEO arma sus cifras en el servidor: hay que volver a pedirlas.
  const pideAlServidor = pathname.startsWith("/ceo");

  useEffect(() => {
    if (sincronizarCookieCifras() && pideAlServidor) router.refresh();
  }, [pideAlServidor, router]);

  const Icono = ocultas ? EyeOff : Eye;
  const texto = ocultas ? "Mostrar cifras" : "Ocultar cifras";
  return (
    <button
      type="button"
      aria-pressed={ocultas}
      aria-label={texto}
      title={texto}
      onClick={(e) => {
        e.preventDefault();
        const nuevo = !ocultas;
        ponerCifrasOcultas(nuevo);
        if (!pideAlServidor) return;
        // Al ocultar se recarga la página entera: así las cifras que ya habían
        // llegado tampoco quedan en los datos internos de la página.
        if (nuevo) window.location.reload();
        else router.refresh();
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-border p-1 text-xs font-medium text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground",
        ocultas && "border-[#22b8ff]/50 text-[#0a6cb8] dark:text-[#22b8ff]",
        conTexto && "px-2.5 py-1.5",
        className,
      )}
    >
      <Icono className="size-3.5" />
      {conTexto && texto}
    </button>
  );
}
