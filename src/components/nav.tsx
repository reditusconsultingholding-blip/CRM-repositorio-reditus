"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/(protected)/actions";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

const ALL_LINKS = [
  { href: "/dashboard", label: "Dashboard", roles: null },
  { href: "/ingresos", label: "Ingresos", roles: ["ceo", "gerente_comercial"] },
  { href: "/requerimientos", label: "Requerimientos", roles: null },
  { href: "/admin/usuarios", label: "Usuarios", roles: ["ceo"] },
] as const;

export function Nav({
  role,
  name,
  userId,
}: {
  role: UserRole;
  name: string;
  userId: string;
}) {
  const pathname = usePathname();
  const links = ALL_LINKS.filter((l) => !l.roles || (l.roles as readonly string[]).includes(role));

  return (
    <header className="sticky top-0 z-10 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <span className="font-semibold tracking-tight">Reditus CRM</span>
        <nav className="flex flex-1 items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                pathname.startsWith(link.href) && "bg-muted text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <NotificationBell userId={userId} />
        <div className="flex items-center gap-3 border-l pl-3">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
          </div>
          <form action={signOut}>
            <Button variant="outline" size="sm" type="submit">
              Salir
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
