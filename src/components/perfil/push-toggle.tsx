"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";
import { savePushSubscription, removePushSubscription } from "@/app/(protected)/perfil/push-actions";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushToggle() {
  const [supported] = useState(
    () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window,
  );
  const [subscribed, setSubscribed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    });
  }, [supported]);

  function activar() {
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast.error("No autorizaste las notificaciones en el navegador.");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicKey) {
          toast.error("Falta configurar las notificaciones push del lado del servidor.");
          return;
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        const json = sub.toJSON();
        await savePushSubscription({
          endpoint: json.endpoint!,
          keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
        });
        setSubscribed(true);
        toast.success("Notificaciones activadas en este dispositivo");
      } catch {
        toast.error("No se pudo activar las notificaciones");
      }
    });
  }

  function desactivar() {
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await removePushSubscription(sub.endpoint);
          await sub.unsubscribe();
        }
        setSubscribed(false);
        toast.success("Notificaciones desactivadas en este dispositivo");
      } catch {
        toast.error("No se pudo desactivar");
      }
    });
  }

  if (!supported) {
    return (
      <p className="text-sm text-muted-foreground">
        Este navegador no soporta notificaciones push, o la app todavía no está instalada.
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {subscribed ? "Recibirás notificaciones en este dispositivo." : "Actívalas para no perderte avisos importantes."}
      </p>
      {subscribed ? (
        <Button variant="outline" size="sm" onClick={desactivar} disabled={pending}>
          <BellOff className="size-3.5" /> Desactivar
        </Button>
      ) : (
        <Button size="sm" onClick={activar} disabled={pending}>
          <Bell className="size-3.5" /> Activar
        </Button>
      )}
    </div>
  );
}
