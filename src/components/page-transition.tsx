"use client";

import { usePathname } from "next/navigation";

// Al cambiar de ruta, el contenido se vuelve a montar (key) y entra con el
// fundido .rd-entra de globals.css. Solo transform/opacity; se apaga con
// prefers-reduced-motion.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Se agrupa por sección (/requerimientos/123 → /requerimientos) para que
  // moverse dentro de una misma sección no repita la animación.
  const seccion = "/" + (pathname.split("/")[1] ?? "");
  return (
    <div key={seccion} className="rd-entra">
      {children}
    </div>
  );
}
