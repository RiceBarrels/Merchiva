// Merchiva push service worker.
// Receives Web Push events and surfaces them as OS-level notifications. The
// click handler focuses an existing tab when possible and otherwise opens the
// payload's `link`. Payload shape comes from /api/push/send.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_e) {
    payload = { title: "Merchiva", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Merchiva";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || payload.id || undefined,
    data: {
      link: payload.link || "/~/dashboard",
      type: payload.type || "general",
    },
    requireInteraction: false,
  };

  // Mr. Merchiva reply pings exist for when the user has LEFT the page. If a
  // chat/dashboard tab is focused and visible, they're already watching the
  // reply stream in — suppress the redundant OS notification.
  if (payload.type === "merchiva_reply") {
    event.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
          const watching = clients.some((c) => {
            if (c.visibilityState !== "visible" || !c.focused) return false;
            const path = new URL(c.url).pathname;
            return path.startsWith("/~/chat") || path.startsWith("/~/dashboard");
          });
          if (watching) return;
          return self.registration.showNotification(title, options);
        }),
    );
    return;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/~/dashboard";
  const targetUrl = new URL(link, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === self.location.origin && "focus" in client) {
            client.focus();
            if (client.navigate && clientUrl.href !== targetUrl) {
              return client.navigate(targetUrl).catch(() => {});
            }
            return;
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
