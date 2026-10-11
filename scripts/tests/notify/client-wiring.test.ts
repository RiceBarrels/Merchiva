// Wiring of the notification client that only shows in the source: the
// subscription batch stays out of the bootstrap batch, the layout mounts the
// runtime once around both branches (and no longer mounts the push prompt or a
// second watcher itself), the service worker never leaves the site and never
// navigates a device surface, and leaving an account drops its push row first.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("provider subscriptions", () => {
  const provider = read("lib/spacetimedb/provider.tsx");

  test("the notification tables are their own batch with an error handler, never in the bootstrap batch", () => {
    const bootstrap = /const BOOTSTRAP_SUBSCRIPTIONS = \[([\s\S]*?)\];/.exec(provider)?.[1] ?? "";
    expect(bootstrap).toContain('"SELECT * FROM notification"');
    for (const table of ["notification_delivery", "notification_pref", "chat_follow"]) {
      expect(bootstrap).not.toContain(table);
      expect(provider).toContain(`"SELECT * FROM ${table}"`);
    }
    const batch = provider.indexOf(".subscribe(notifySubscriptions())");
    expect(batch).toBeGreaterThan(-1);
    const builder = provider.lastIndexOf(".subscriptionBuilder()", batch);
    expect(provider.slice(builder, batch)).toContain(".onError(");
  });
});

describe("manager layout", () => {
  const layout = read("app/manager/layout.tsx");

  test("NotificationRuntime wraps both branches, inside PermissionsProvider", () => {
    expect(layout.match(/<NotificationRuntime>/g)?.length).toBe(1);
    const open = layout.indexOf("<NotificationRuntime>");
    const close = layout.indexOf("</NotificationRuntime>");
    expect(layout.indexOf("<PermissionsProvider")).toBeLessThan(open);
    expect(layout.indexOf("</PermissionsProvider>")).toBeGreaterThan(close);
    const inside = layout.slice(open, close);
    expect(inside).toContain("<ManagerShell>{children}</ManagerShell>");
    expect(inside).toContain("isSetupPath ?");
  });

  test("no direct push prompt or second notification watcher", () => {
    expect(layout).not.toContain("PushNotificationPrompt");
    expect(layout).not.toContain("TauriNotificationBridge");
    expect(existsSync(join(ROOT, "components/tauri-notification-bridge.tsx"))).toBe(false);
  });
});

describe("service worker", () => {
  const sw = read("public/sw.js");

  test("a click opens this site only, and leaves /store and /personal where they are", () => {
    expect(sw).toContain("candidate.origin === self.location.origin");
    expect(sw).toContain("isDeviceSurfacePath(clientUrl.pathname)");
    expect(sw).toContain('type: "merchiva:notification-click"');
  });

  test("a push for a visible, focused tab is offered to the tab, whatever its type", () => {
    expect(sw).toContain('c.visibilityState === "visible" && c.focused');
    expect(sw).toContain('type: "merchiva:push"');
    expect(sw).not.toContain('payload.type === "merchiva_reply"');
  });

  test("a push the tab does not answer for (or not in time) still becomes an OS notification", () => {
    expect(sw).toContain("new MessageChannel()");
    expect(sw).toContain("[channel.port2]");
    expect(sw).toContain("setTimeout(() => resolve(false), HANDOFF_TIMEOUT_MS)");
    expect(sw).toContain("event.data.handled === true");
    expect(sw).toContain("handled ? undefined : self.registration.showNotification(title, options)");
    // The page answers on the port it is given (lib/notifications/alerts.ts).
    const alerts = read("lib/notifications/alerts.ts");
    expect(alerts).toContain('"merchiva:push"');
    expect(alerts).toContain("port.postMessage({ handled:");
  });
});

describe("attention", () => {
  test("the manager page clears, and alerts pick a toast, only while someone is at the screen", () => {
    const dots = read("lib/notifications/dots-context.tsx");
    const clearing = dots.slice(dots.indexOf("function ManagerDotClearing"), dots.indexOf("const NO_APPS"));
    expect(clearing).toContain("useDocumentAttended()");
    expect(clearing).not.toContain("useDocumentVisible()");
    const alerts = read("lib/notifications/alerts.ts");
    expect(alerts).toContain("const front = documentAttended();");
  });
});

describe("leaving an account", () => {
  const auth = read("lib/auth/context.tsx");

  for (const name of ["signOut", "switchAccount"]) {
    test(`${name} drops this browser's push row before the session goes`, () => {
      const start = auth.indexOf(`const ${name} = useCallback`);
      expect(start).toBeGreaterThan(-1);
      const body = auth.slice(start, auth.indexOf("}, []);", start));
      const forget = body.indexOf("forgetBrowserPushEndpoint()");
      expect(forget).toBeGreaterThan(-1);
      const leave = Math.max(body.indexOf("localStorage.clear()"), body.indexOf("storeAuthTokens("));
      expect(leave).toBeGreaterThan(forget);
    });
  }
});
