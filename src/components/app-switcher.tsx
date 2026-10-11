"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

// Selector de aplicación en la barra superior: CRM (todo lo de siempre) y
// Pulso (tablero de resultados de las páginas de clientes), dentro de la
// misma sesión. Solo se pinta para los roles con acceso a Pulso; el resto
// del equipo sigue viendo el CRM igual que antes.
const APPS = [
  { href: "/dashboard", label: "CRM", icon: LayoutGrid, activa: (p: string) => !p.startsWith("/pulso") },
  { href: "/pulso", label: "Pulso", icon: Activity, activa: (p: string) => p.startsWith("/pulso") },
] as const;

export function AppSwitcher() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 flex h-11 w-full shrink-0 items-center justify-center border-b bg-background/95 px-4 backdrop-blur">
      <nav aria-label="Cambiar de aplicación" className="flex items-center gap-1 rounded-lg bg-muted p-1">
        {APPS.map((app) => {
          const Icon = app.icon;
          const activa = app.activa(pathname);
          return (
            <Link
              key={app.href}
              href={app.href}
              aria-current={activa ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-4 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                activa && "bg-background text-foreground shadow-sm",
              )}
            >
              <Icon className="size-3.5" />
              {app.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
