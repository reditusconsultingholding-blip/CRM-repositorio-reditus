// Reditus CRM — service worker: instala la PWA y maneja notificaciones push.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Chrome exige un listener de "fetch" para considerar el sitio realmente
// instalable como app (no solo un acceso directo/bookmark) — sin esto,
// "Agregar a inicio" en algunos Android termina creando un simple enlace
// en vez de instalar la app de verdad. No cachea nada, solo deja pasar
// la petición tal cual a la red — la app siempre trae datos en vivo.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Reditus CRM", body: event.data.text() };
  }

  const title = payload.title || "Reditus CRM";
  const options = {
    body: payload.body || "",
    icon: "/icon-192",
    badge: "/icon-192",
    data: { url: payload.url || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (clients.length > 0) {
        clients[0].navigate(url);
        return clients[0].focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
