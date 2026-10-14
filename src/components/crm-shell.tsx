"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppSwitcherNav } from "@/components/app-switcher";
import { NotificationBell } from "@/components/notification-bell";
import { BotonTema, TemaGuardia } from "@/components/tema";
import { CargadorDeNavegacion } from "@/components/cargador-seccion";

// Armazón del CRM: barra superior de cristal (dónde estás, selector
// CRM/Pulso, tema y avisos), barra lateral de noche y el área de trabajo
// sobre la rejilla. En celular la barra lateral es un cajón que se abre con
// el botón de menú.
const SECCIONES: Record<string, string> = {
  dashboard: "Dashboard",
  ingresos: "Ingresos",
  requerimientos: "Requerimientos",
  chat: "Chat interno",
  prospectos: "Prospectos",
  videos: "Creativos",
  clientes: "Clientes",
  whatsapp: "WhatsApp Business",
  admin: "Usuarios",
  flujo: "Flujo de trabajo",
  checklist: "Checklist",
  seguimiento: "Seguimiento diario",
  reto75: "Reto 75 Hard",
  ayuda: "¿Cómo funciona?",
  ceo: "Panel CEO",
  perfil: "Configuración",
};

export function CrmShell({
  conPulso,
  userId,
  sidebar,
  children,
}: {
  conPulso: boolean;
  userId: string;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // El cajón queda abierto solo en la ruta donde se abrió: al navegar se cierra.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const abierto = abiertoEn === pathname;
  const seccion = SECCIONES[pathname.split("/")[1] ?? ""] ?? "Reditus";

  return (
    <div
      className="rd-cuerpo flex min-h-screen w-full flex-col"
      style={{ "--app-bar": "3rem" } as React.CSSProperties}
    >
      <TemaGuardia />

      <header className="rd-barra dark sticky top-0 z-40 flex h-12 w-full shrink-0 items-center gap-2 px-3 sm:gap-3 lg:px-5">
        <button
          type="button"
          onClick={() => setAbiertoEn(abierto ? null : pathname)}
          aria-label="Abrir el menú"
          aria-expanded={abierto}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white lg:hidden"
        >
          <Menu className="size-4" />
        </button>

        <div className={cn("min-w-0 flex-1 basis-0 leading-tight", conPulso && "hidden sm:block")}>
          <span className="rd-etiqueta block text-[#5cc8ff]">Reditus CRM</span>
          <span className="block truncate font-heading text-sm font-semibold text-white">{seccion}</span>
        </div>

        {conPulso && (
          <div className="flex flex-1 justify-center sm:flex-none">
            <AppSwitcherNav />
          </div>
        )}

        <div className={cn("flex items-center justify-end gap-1.5 sm:gap-2.5", "sm:flex-1 sm:basis-0", !conPulso && "flex-none")}>
          <BotonTema />
          <NotificationBell userId={userId} />
        </div>
      </header>

      <div className="flex w-full flex-1">
        <div
          className={cn(
            "dark fixed inset-y-0 left-0 z-50 w-64 max-w-[84vw] -translate-x-full transition-transform duration-300 ease-out motion-reduce:transition-none",
            "lg:sticky lg:top-[var(--app-bar)] lg:z-30 lg:h-[calc(100vh-var(--app-bar))] lg:w-60 lg:shrink-0 lg:translate-x-0 lg:transition-none",
            abierto && "translate-x-0",
          )}
        >
          {sidebar}
        </div>
        {abierto && (
          <button
            type="button"
            aria-label="Cerrar el menú"
            onClick={() => setAbiertoEn(null)}
            className="fixed inset-0 z-[45] bg-[#03060e]/60 backdrop-blur-[2px] lg:hidden"
          />
        )}

        <main className="relative mx-auto w-full min-w-0 max-w-6xl flex-1 p-4 md:p-6">
          {children}
          {/* Al hacer clic en cualquier enlace: el aro con el logo, aquí, hasta que la página cambie. */}
          <CargadorDeNavegacion />
        </main>
      </div>
    </div>
  );
}
