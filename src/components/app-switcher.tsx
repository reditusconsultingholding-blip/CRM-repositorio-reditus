"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { iniciarCambio } from "@/lib/cambio-app";

// Selector de aplicación en la barra superior: CRM (todo lo de siempre) y
// Pulso (tablero de resultados de las páginas de clientes), dentro de la
// misma sesión. Solo se pinta para los roles con acceso a Pulso; el resto
// del equipo sigue viendo el CRM igual que antes.
const APPS = [
  { id: "crm", href: "/dashboard", label: "CRM", icon: LayoutGrid, activa: (p: string) => !p.startsWith("/pulso") },
  { id: "pulso", href: "/pulso", label: "Pulso", icon: Activity, activa: (p: string) => p.startsWith("/pulso") },
] as const;

/** La pastilla CRM / Pulso. Va sobre la barra superior (siempre de noche). */
export function AppSwitcherNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Cambiar de aplicación"
      className="relative grid shrink-0 grid-cols-2 rounded-xl border border-white/10 bg-white/[0.06] p-1"
    >
      {/* Pastilla que se desliza a la opción activa (cada opción ocupa la mitad) */}
      <span
        aria-hidden="true"
        className="rd-pastilla absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-[linear-gradient(90deg,#0072ff,#00a8f0)] shadow-[0_6px_18px_-8px_#00c6ff]"
        style={{ transform: pathname.startsWith("/pulso") ? "translateX(100%)" : "none" }}
      />
      {APPS.map((app) => {
        const Icon = app.icon;
        const activa = app.activa(pathname);
        return (
          <Link
            key={app.href}
            href={app.href}
            aria-current={activa ? "page" : undefined}
            onClick={(e) => {
              // Solo al cambiar de verdad de aplicación, y no si se abre en
              // otra pestaña (Ctrl/Cmd/Shift + clic).
              if (activa || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              iniciarCambio(app.id);
            }}
            className={cn(
              "relative z-10 flex items-center justify-center gap-1.5 rounded-lg px-4 py-1 text-sm font-medium text-white/60 transition-colors hover:text-white sm:px-5",
              activa && "font-semibold text-white",
            )}
          >
            <Icon className="size-3.5" />
            {app.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra superior de Pulso: solo la marca y el selector (Pulso trae su propio menú). */
export function AppSwitcher() {
  return (
    <header className="rd-barra sticky top-0 z-40 flex h-12 w-full shrink-0 items-center gap-3 px-3 lg:px-5">
      <div className="hidden min-w-0 flex-1 basis-0 leading-tight sm:block">
        <span className="rd-etiqueta block text-[#5cc8ff]">Reditus</span>
        <span className="block truncate font-heading text-sm font-semibold">Pulso</span>
      </div>
      <div className="flex flex-1 justify-center sm:flex-none">
        <AppSwitcherNav />
      </div>
      <div className="hidden flex-1 basis-0 sm:block" />
    </header>
  );
}
