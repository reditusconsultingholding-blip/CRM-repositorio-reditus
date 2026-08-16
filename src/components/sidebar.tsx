"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  DollarSign,
  ClipboardList,
  Users,
  MessageSquare,
  MessageCircle,
  Contact,
  HelpCircle,
  Crown,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/(protected)/actions";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { ChatBadge } from "@/components/chat/chat-badge";
import { CurrencyWidget } from "@/components/currency-widget";
import { RentabilidadWidget } from "@/components/ceo/rentabilidad-widget";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

const ALL_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: null },
  { href: "/ingresos", label: "Ingresos", icon: DollarSign, roles: ["ceo", "gerente_comercial"] },
  { href: "/requerimientos", label: "Requerimientos", icon: ClipboardList, roles: null },
  { href: "/chat", label: "Chat interno", icon: MessageSquare, roles: null },
  { href: "/clientes", label: "Clientes", icon: Contact, roles: ["ceo", "gerente_comercial"] },
  { href: "/whatsapp", label: "WhatsApp Business", icon: MessageCircle, roles: ["ceo", "gerente_comercial"] },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users, roles: ["ceo"] },
  { href: "/ayuda", label: "¿Cómo funciona?", icon: HelpCircle, roles: null },
] as const;

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
  const links = ALL_LINKS.filter((l) => !l.roles || (l.roles as readonly string[]).includes(role));

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r bg-background">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <span className="font-heading text-base font-semibold tracking-tight">Reditus CRM</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                active && "bg-primary/10 text-primary",
              )}
            >
              <Icon className="size-4" />
              {link.label}
              {link.href === "/chat" && <ChatBadge userId={userId} />}
            </Link>
          );
        })}

        {role === "ceo" && (
          <>
            <div className="my-2 border-t" />
            <Link
              href="/ceo"
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                pathname.startsWith("/ceo") && "bg-primary/10 text-primary",
              )}
            >
              <Crown className="size-4" />
              Panel CEO
            </Link>
          </>
        )}
      </nav>

      <div className="flex flex-col gap-3 border-t p-3">
        <CurrencyWidget />
        {role === "ceo" && <RentabilidadWidget />}

        <div className="flex items-center justify-between gap-2">
          <Link href="/perfil" className="flex min-w-0 items-center gap-2 hover:opacity-80">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={name} className="size-8 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {name
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
            )}
            <span className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
            </span>
          </Link>
          <NotificationBell userId={userId} />
        </div>

        <form action={signOut}>
          <Button variant="outline" size="sm" type="submit" className="w-full justify-center gap-1.5">
            <LogOut className="size-3.5" />
            Salir
          </Button>
        </form>
      </div>
    </aside>
  );
}
