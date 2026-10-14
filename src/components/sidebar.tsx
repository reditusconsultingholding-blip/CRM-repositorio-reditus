"use client";

import { Suspense, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BookOpen,
  LayoutDashboard,
  DollarSign,
  ClipboardList,
  MessageSquare,
  MessageCircle,
  Contact,
  UserPlus,
  HelpCircle,
  Workflow,
  Settings,
  LogOut,
  Flame,
  ListChecks,
  ClipboardCheck,
  Clapperboard,
  Film,
  ChevronDown,
  ScanSearch,
  ListVideo,
} from "lucide-react";
import { signOut } from "@/app/(protected)/actions";
import { Button } from "@/components/ui/button";
import { ChatBadge } from "@/components/chat/chat-badge";
import { CurrencyWidget } from "@/components/currency-widget";
import { RentabilidadWidget } from "@/components/ceo/rentabilidad-widget";
import { ROLE_LABELS, INGRESOS_ROLES, VIDEOS_ROLES, type UserRole } from "@/lib/roles";
import { VISTAS_CREATIVOS, vistaDeParametros } from "@/lib/videos-vistas";

// Ingresos/Prospectos/Clientes usan INGRESOS_ROLES (de lib/roles.ts) en vez
// de una lista aparte — antes había una copia hardcodeada acá que se
// desincronizó del resto de la app (mismo problema que tenía el middleware).
//
// Fuera del menú a propósito (11-oct-2026); las rutas siguen funcionando:
//  · «WhatsApp Business» (/whatsapp) y «Reto 75 Hard» (/reto75) están en
//    OCULTOS: para volver a mostrarlos, pasa su línea de OCULTOS a ALL_LINKS.
//  · «Checklist» (/checklist) también está en OCULTOS: sus tablas
//    (checklist_items / checklist_marcas, migración 0059) nunca se aplicaron
//    y la página falla. La reemplaza «Seguimiento diario» (/seguimiento).
//  · «Usuarios» (/admin/usuarios) y «Panel CEO» (/ceo) ahora se abren desde
//    Configuración (/perfil), solo para el CEO.
const ALL_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: null, grupo: "Operación" },
  { href: "/ingresos", label: "Ingresos", icon: DollarSign, roles: INGRESOS_ROLES, grupo: "Operación" },
  { href: "/requerimientos", label: "Requerimientos", icon: ClipboardList, roles: null, grupo: "Operación" },
  { href: "/chat", label: "Chat interno", icon: MessageSquare, roles: null, grupo: "Operación" },
  {
    href: "/prospectos/mis-videos",
    label: "Videos de prospección",
    icon: Clapperboard,
    roles: ["editor_video", "disenador_landing", "programador"],
    grupo: "Operación",
  },
  { href: "/prospectos", label: "Prospectos", icon: UserPlus, roles: INGRESOS_ROLES, grupo: "Comercial" },
  { href: "/clientes", label: "Clientes", icon: Contact, roles: INGRESOS_ROLES, grupo: "Comercial" },
  // Maestría en negociación: privada del CEO, con nombre discreto a propósito.
  { href: "/maestria", label: "Formación", icon: BookOpen, roles: ["ceo"], grupo: "Comercial" },
  { href: "/flujo", label: "Flujo de trabajo", icon: Workflow, roles: null, grupo: "Equipo" },
  { href: "/seguimiento", label: "Seguimiento diario", icon: ClipboardCheck, roles: null, grupo: "Equipo" },
  { href: "/ayuda", label: "¿Cómo funciona?", icon: HelpCircle, roles: null, grupo: "Equipo" },
] as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const OCULTOS = [
  { href: "/whatsapp", label: "WhatsApp Business", icon: MessageCircle, roles: INGRESOS_ROLES, grupo: "Comercial" },
  { href: "/reto75", label: "Reto 75 Hard", icon: Flame, roles: null, grupo: "Equipo" },
  { href: "/checklist", label: "Checklist", icon: ListChecks, roles: null, grupo: "Equipo" },
] as const;

// El mismo orden de siempre, solo separado en bloques con su rótulo.
// «Creativos» es un grupo aparte: sus entradas son las secciones de /videos (lib/videos-vistas.ts).
const GRUPOS = ["Operación", "Creativos", "Comercial", "Equipo"] as const;
const ICONO_VISTA: Record<string, typeof Film> = { crear: Clapperboard, clonar: ScanSearch, estudio: Film, "mis-videos": ListVideo };

// ---- grupos plegables: el estado se recuerda en este navegador ----
const CLAVE_PLEGADOS = "rd-menu-plegados";
const oyentes = new Set<() => void>();
const leerPlegados = () => {
  try {
    return window.localStorage.getItem(CLAVE_PLEGADOS) ?? "";
  } catch {
    return "";
  }
};
const suscribirPlegados = (fn: () => void) => {
  oyentes.add(fn);
  return () => void oyentes.delete(fn);
};
function alternarGrupo(grupo: string) {
  const l = new Set(leerPlegados().split("|").filter(Boolean));
  if (l.has(grupo)) l.delete(grupo);
  else l.add(grupo);
  try {
    window.localStorage.setItem(CLAVE_PLEGADOS, [...l].join("|"));
  } catch {
    /* sin almacenamiento, el estado dura lo que dure la página */
  }
  oyentes.forEach((fn) => fn());
}

/** Encabezado de un grupo del menú: un botón que lo pliega o lo despliega. */
function TituloGrupo({ grupo, plegado }: { grupo: string; plegado: boolean }) {
  return (
    <button
      type="button"
      aria-expanded={!plegado}
      aria-controls={`menu-${grupo}`}
      onClick={() => alternarGrupo(grupo)}
      className="rd-lado-titulo flex w-full items-center justify-between gap-2 rounded-md text-left outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-[#00c6ff]/60"
    >
      <span>{grupo}</span>
      <ChevronDown aria-hidden="true" className={`size-3.5 shrink-0 transition-transform motion-reduce:transition-none ${plegado ? "-rotate-90" : ""}`} />
    </button>
  );
}

/** Las entradas del grupo «Creativos», con la activa según `?vista=` (lee la dirección: por eso va dentro de Suspense). */
function SubCreativos({ enSeccion }: { enSeccion: boolean }) {
  const parametros = useSearchParams();
  const actual = enSeccion ? vistaDeParametros(parametros.get("vista"), parametros.get("guion")) : null;
  return (
    <>
      {VISTAS_CREATIVOS.filter((v) => v.enMenu).map((v) => {
        const Icono = ICONO_VISTA[v.clave] ?? Film;
        return (
        <Link
          key={v.clave}
          href={`/videos?vista=${v.clave}`}
          aria-current={actual === v.clave ? "page" : undefined}
          className="rd-lado-enlace"
          onClick={(e) => {
            // Ya dentro de Creativos la pantalla tiene todo cargado: solo cambia la dirección (sin ir al servidor).
            if (!enSeccion || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            window.history.pushState(null, "", `/videos?vista=${v.clave}`);
          }}
        >
          <Icono className="size-4 shrink-0" />
          {v.nombre}
        </Link>
        );
      })}
    </>
  );
}

export function Sidebar({
  role,
  name,
  userId,
  avatarUrl,
}: {
  role: UserRole;
  name: string;
  userId: string;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  const plegados = useSyncExternalStore(suscribirPlegados, leerPlegados, () => "").split("|");
  const enCreativos = pathname === "/videos" || pathname.startsWith("/videos/");
  const veCreativos = (VIDEOS_ROLES as readonly string[]).includes(role);
  const links = ALL_LINKS.filter((l) => !l.roles || (l.roles as readonly string[]).includes(role));
  // Solo se enciende una entrada: la de ruta más específica (así /prospectos
  // y /prospectos/mis-videos nunca quedan activas a la vez).
  const hrefActivo = links
    .filter((l) => pathname === l.href || pathname.startsWith(l.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <aside className="rd-lado flex h-full w-full flex-col">
      <Link href="/dashboard" className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.08] px-4">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#0072ff,#00c6ff)] font-heading text-base font-bold text-white shadow-[0_0_18px_-4px_#00c6ff]"
        >
          R
        </span>
        <span className="leading-none">
          <span className="block font-heading text-base font-bold tracking-[0.04em] text-white">REDITUS</span>
          <span className="rd-etiqueta mt-1 block text-[9.5px] text-white/45">Consulting · CRM</span>
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        {GRUPOS.map((grupo) => {
          const delGrupo = links.filter((l) => l.grupo === grupo);
          const esCreativos = grupo === "Creativos";
          if (esCreativos ? !veCreativos : delGrupo.length === 0) return null;
          const plegado = plegados.includes(grupo);
          return (
            <div key={grupo} className="flex flex-col gap-0.5">
              <TituloGrupo grupo={grupo} plegado={plegado} />
              <div id={`menu-${grupo}`} className={plegado ? "hidden" : "flex flex-col gap-0.5"}>
                {esCreativos ? (
                  <Suspense fallback={null}>
                    <SubCreativos enSeccion={enCreativos} />
                  </Suspense>
                ) : (
                  delGrupo.map((link) => {
                    const Icon = link.icon;
                    const active = link.href === hrefActivo;
                    return (
                      <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className="rd-lado-enlace">
                        <Icon className="size-4 shrink-0" />
                        {link.label}
                        {link.href === "/chat" && <ChatBadge userId={userId} />}
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        <div className="flex flex-col gap-0.5">
          <p className="rd-lado-titulo">Cuenta</p>
          <Link
            href="/perfil"
            aria-current={
              // Usuarios, Panel CEO y la maestría se abren desde Configuración.
              ["/perfil", "/ceo", "/admin"].some((r) => pathname.startsWith(r)) ? "page" : undefined
            }
            className="rd-lado-enlace"
          >
            <Settings className="size-4 shrink-0" />
            Configuración
          </Link>
        </div>
      </nav>

      <div className="flex shrink-0 flex-col gap-3 border-t border-white/[0.08] p-3">
        <CurrencyWidget />
        {role === "ceo" && <RentabilidadWidget />}

        <div className="flex items-center gap-2">
          <Link href="/perfil" className="flex min-w-0 flex-1 items-center gap-2.5 hover:opacity-80">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={name}
                className="size-8 shrink-0 rounded-full object-cover ring-1 ring-[#00c6ff]/60"
              />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white ring-1 ring-[#00c6ff]/50">
                {name
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
            )}
            <span className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium text-white">{name}</p>
              <p className="truncate text-xs text-white/50">{ROLE_LABELS[role]}</p>
            </span>
          </Link>
        </div>

        <form action={signOut}>
          <Button
            variant="outline"
            size="sm"
            type="submit"
            className="w-full justify-center gap-1.5 border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-3.5" />
            Salir
          </Button>
        </form>
      </div>
    </aside>
  );
}
