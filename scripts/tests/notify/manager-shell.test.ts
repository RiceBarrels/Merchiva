// Built-in notifications on /manager have no UI of their own: no inbox page, no bell, no drawer
// row, no unread counts — a dot on each feature's entry point instead. These guards read the
// sources (like scripts/tests/browser-desktop/toolbar-composition.test.ts) for what a server
// render cannot show: the removed pieces stay removed, and the entry points that only light up
// in a live shell (background tabs, the hidden sidebar's toggle, the store switchers, Mr.
// Merchiva's rail) ask the dot provider the right question. Where the dots land on the sidebar,
// the menu button, the store list and the launcher is rendered in manager-dots.test.ts.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { categoryTarget } from "@/lib/merchiva/tool-targets";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SHELL = join(ROOT, "components", "browser-shell");

function read(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), "utf8");
}

/** Comments describe what was removed, so the checks look at code only. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the inbox is gone", () => {
  test("its page, list, bell and link helpers are deleted", () => {
    for (const file of [
      "app/manager/notifications/page.tsx",
      "components/notification-center.tsx",
      "components/browser-shell/desktop/notifications-button.tsx",
      "lib/notification-link.ts",
      "lib/browser-shell/mobile-app/notification-link.ts",
    ]) {
      expect(existsSync(join(ROOT, file)), file).toBe(false);
    }
  });

  test("nothing in the shell, the dock or the dashboard still reaches for it", () => {
    const files = [
      "components/browser-shell/desktop/toolbar.tsx",
      "components/browser-shell/mobile-app/mobile-app-chrome.tsx",
      "components/browser-shell/mobile-app/sidebar-drawer.tsx",
      "components/browser-shell/mobile-app/menu-button.tsx",
      "components/browser-shell/mobile/mobile-browser-chrome.tsx",
      "components/browser-shell/mobile/bottom-chrome.tsx",
      "components/browser-shell/mobile/address-pill.tsx",
      "components/browser-shell/mobile/page-menu-sheet.tsx",
      "components/merchiva-chat-dashboard.tsx",
    ];
    for (const file of files) {
      const text = code(read(file));
      for (const gone of ["notification-center", "NotificationCenter", "useUnreadCount", "unreadCount", "UNREAD_BADGE_CLASS", "notification-link", "NotificationsCard"]) {
        expect(text, `${file} still mentions ${gone}`).not.toContain(gone);
      }
    }
    expect(code(read("components/browser-shell/desktop/chrome-classes.ts"))).not.toContain("UNREAD_BADGE_CLASS");
  });

  test("the phone drawer is the sidebar alone: no Notifications row or sheet", () => {
    const drawer = code(read("components/browser-shell/mobile-app/sidebar-drawer.tsx"));
    expect(drawer).toContain('<BrowserSidebar collapsed={false} variant="drawer" />');
    expect(drawer).not.toContain("ShellDrawer");
    expect(code(read("components/browser-shell/desktop/sidebar/sidebar.tsx"))).not.toContain("extraRows");
  });

  test("the old page menu lost its Notifications row and sheet, the address pill its dot", () => {
    const menu = code(read("components/browser-shell/mobile/page-menu-sheet.tsx"));
    expect(menu).not.toContain('"notifications"');
    expect(menu).not.toContain("Bell");
    expect(code(read("components/browser-shell/mobile/address-pill.tsx"))).not.toContain("pageMenuUnread");
    expect(read("scripts/i18n/browser-mobile.ts")).not.toContain("pageMenuUnread");
  });

  test("the route is gone from the shell registry and Mr. Merchiva's cursor targets", () => {
    const routes = code(read("lib/browser-shell/routes.ts"));
    expect(routes).not.toContain('prefix: "/manager/notifications"');
    expect(routes).not.toContain("NotificationsIcon");
    expect(routes).toContain('{ from: "/manager/notifications", to: "/manager", match: "exact" }');
    // createNotification's category has no page to point his cursor at any more.
    expect(categoryTarget("notifications")).toBeNull();
    expect(categoryTarget("inventory")?.route).toBe("/manager/inventory");
    expect(code(read("lib/merchiva/tool-targets.ts"))).not.toContain("/manager/notifications");
  });

  test("the dashboard lost its notifications card but still reads Mr. Merchiva's replies it shows", () => {
    const dashboard = code(read("components/merchiva-chat-dashboard.tsx"));
    expect(dashboard).not.toContain("merchiva.notifications.");
    expect(dashboard).not.toContain("markNotificationRead(");
    // Watching a reply stream in reads its "Mr. Merchiva replied" row, batched through the dots.
    expect(dashboard).toContain("const { markRead: markDotsRead } = useNotificationDots();");
    expect(dashboard).toContain("if (ids.length > 0) markDotsRead(ids);");
  });

  test("the design-system specimens show the dot, not a bell or a count", () => {
    const page = code(read("app/design-system/page.tsx"));
    expect(page).not.toContain(">Notifications<");
    expect(page).not.toContain("No notifications");
    expect(page).not.toContain("it.count");
    expect(page).toContain("<NotificationDot show={!!it.dot}");
  });
});

describe("entry points that light up in a live shell", () => {
  test("a background tab's favicon carries the dot of the page it shows; the tab on screen never does", () => {
    const tab = code(read("components/browser-shell/desktop/tab-item.tsx"));
    expect(tab).toContain("const dot = useDot({ url: presentation.url }) && !active && !pending && mode.icon;");
    // Inside the favicon's relative box, with the strip's ring.
    expect(tab).toMatch(/<span className="relative flex size-4[^>]*>[\s\S]*<NotificationDot show=\{dot\} className=\{TAB_DOT_CLASS\} \/>\s*<\/span>/);
  });

  test("the store switchers carry one dot for the other stores; their lists show which", () => {
    const menu = code(read("components/browser-shell/shared/workspace-menu.tsx"));
    expect(menu).toContain("const dot = useOtherOrgDot(org.id) && !current;");
    expect(menu).toContain("export function useOtherStoresDot(");
    for (const file of ["desktop/sidebar/workspace-switcher.tsx", "desktop/store-chip.tsx"]) {
      const text = code(readFileSync(join(SHELL, file), "utf8"));
      expect(text, file).toContain("useOtherStoresDot(workspace.stores,");
      expect(text, file).toContain("<NotificationDot show={dot}");
      expect(text, file).toContain("StoreSwitchList");
    }
  });

  test("Mr. Merchiva's rail shows his dot only while the dock is closed, and no new button opens him", () => {
    const panel = code(read("components/merchiva-dock/dock-panel.tsx"));
    expect(panel).toContain('const dot = useDot({ app: "merchiva" }) && !open;');
    // The rail's one open button carries it; the panel still has exactly its two buttons.
    expect(panel.split("onClick={openMerchivaDock}").length - 1).toBe(1);
    expect(panel.split("<button").length + panel.split("<Button").length - 2).toBe(2);
    const root = code(read("components/merchiva-dock/index.tsx"));
    expect(root).toContain("useMerchivaDotClearing(open);");
  });

  test("every dot reads the shared provider; no entry point reads a table", () => {
    // The store switchers read it through workspace-menu.tsx's useOtherStoresDot (checked above).
    const files = [
      "components/browser-shell/desktop/sidebar/sidebar.tsx",
      "components/browser-shell/desktop/sidebar/sidebar-toggle.tsx",
      "components/browser-shell/desktop/tab-item.tsx",
      "components/browser-shell/core/new-tab-page.tsx",
      "components/browser-shell/mobile-app/menu-button.tsx",
      "components/browser-shell/shared/workspace-menu.tsx",
      "components/merchiva-dock/dock-panel.tsx",
      "components/merchiva-dock/dock-dots.ts",
    ];
    for (const file of files) {
      const text = code(read(file));
      expect(text, file).toContain("@/lib/notifications/dots-context");
      expect(text, file).not.toContain("useTable(");
      expect(text, file).not.toContain("useNotifications(");
    }
  });
});
