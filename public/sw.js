// Merchiva push service worker.
// Receives Web Push events and surfaces them as OS-level notifications. The
// payload comes from the notification cron (/api/cron/notifications): a
// localized title / body, tag = notification id, link = an in-app /manager path.
// The app also calls registration.showNotification itself for a new row while
// its tab is in the background (lib/notifications/alerts.ts), with the same tag,
// so the two never stack.
//
// A push that arrives while a tab of this site is visible and focused is handed
// to that tab first: it answers whether it has already dealt with the row (shown
// it, is about to, or it is read). Anything else — another store's row, a row
// from before the tab connected, a page with no notification runtime, no answer
// within HANDOFF_TIMEOUT_MS — still becomes an OS notification.

/** How long a focused tab has to answer for a push. */
const HANDOFF_TIMEOUT_MS = 1500;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** /store and /personal are device surfaces: a notification never navigates them to /manager. */
function isDeviceSurfacePath(pathname) {
  return (
    pathname === "/store" ||
    pathname.startsWith("/store/") ||
    pathname === "/personal" ||
    pathname.startsWith("/personal/")
  );
}

/** Asks a tab whether it has dealt with a push; resolves false on no answer. */
function askTab(client, payload) {
  return new Promise((resolve) => {
    let channel;
    try {
      channel = new MessageChannel();
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => resolve(false), HANDOFF_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(!!(event.data && event.data.handled === true));
    };
    try {
      client.postMessage({ type: "merchiva:push", payload }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

function sameOriginWindows() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) =>
    clients.filter((c) => {
      try {
        return new URL(c.url).origin === self.location.origin;
      } catch {
        return false;
      }
    }),
  );
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Merchiva", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Merchiva";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || payload.id || undefined,
    data: {
      link: payload.link || "/manager",
      type: payload.type || "general",
    },
    requireInteraction: false,
  };

  // Someone is looking at Merchiva right now (a visible, focused tab of this
  // site): ask that tab first, so a row it already alerted is not raised again
  // on top of it.
  event.waitUntil(
    sameOriginWindows().then((clients) => {
      const watching = clients.find((c) => c.visibilityState === "visible" && c.focused);
      if (!watching) return self.registration.showNotification(title, options);
      return askTab(watching, payload).then((handled) =>
        handled ? undefined : self.registration.showNotification(title, options),
      );
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let targetUrl = new URL("/manager", self.location.origin).href;
  try {
    const candidate = new URL(data.link || "/manager", self.location.origin);
    // Only ever open this site; anything else falls back to the app's home.
    if (candidate.origin === self.location.origin) targetUrl = candidate.href;
  } catch {
    // Unparseable link: keep /manager.
  }

  event.waitUntil(
    sameOriginWindows().then((clients) => {
      const client =
        clients.find((c) => c.focused) || clients.find((c) => c.visibilityState === "visible") || clients[0];
      if (!client) return self.clients.openWindow(targetUrl);
      const clientUrl = new URL(client.url);
      if (isDeviceSurfacePath(clientUrl.pathname)) {
        // A store tablet or a personal phone stays on its surface: bring it forward
        // and tell it what was tapped.
        if ("focus" in client) client.focus();
        client.postMessage({ type: "merchiva:notification-click", link: targetUrl, notificationType: data.type || "general" });
        return;
      }
      if ("focus" in client) client.focus();
      if (client.navigate && clientUrl.href !== targetUrl) {
        return client.navigate(targetUrl).catch(() => {});
      }
    }),
  );
});
