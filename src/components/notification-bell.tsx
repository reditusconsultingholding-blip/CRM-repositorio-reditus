"use client";

import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Notification = {
  id: string;
  title: string;
  link: string | null;
  read: boolean;
  created_at: string;
};

export function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const supabase = createClient();

  useEffect(() => {
    let active = true;

    supabase
      .from("notifications")
      .select("id, title, link, read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (active && data) setNotifications(data);
      });

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // A propósito NO se marca todo leído solo con abrir la campana — cada
  // quien confirma que vio cada aviso presionando su check verde.
  function confirmar(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    supabase.from("notifications").update({ read: true }).eq("id", id);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative" />}>
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full p-0 text-[10px]">
            {unreadCount}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Notificaciones — presiona el check para confirmar que la viste
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            No tienes notificaciones.
          </p>
        )}
        {notifications.map((n, i) => (
          <div key={n.id}>
            {i > 0 && <DropdownMenuSeparator />}
            <div className="flex items-start gap-2 px-2 py-1.5">
              <a
                href={n.link ?? "#"}
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm px-1 py-0.5 text-sm hover:bg-muted/60",
                  !n.read && "font-medium",
                )}
              >
                <span className="whitespace-normal">{n.title}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </a>
              <button
                type="button"
                onClick={() => confirmar(n.id)}
                disabled={n.read}
                title={n.read ? "Ya confirmada" : "Marcar como vista"}
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  n.read ? "border-green-500 bg-green-500 text-white" : "border-input hover:border-green-500 hover:text-green-600",
                )}
              >
                <Check className="size-3" />
              </button>
            </div>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
