// Isolated fixture for scripts/tests/plugins/install.test.ts — NOT auto-discovered by `bun test`. It replaces the
// install state, permissions, the signed-in member, the offline flag, sonner, Next's router and the alert-dialog
// primitives with mock.module, so it runs in its own process.
//
// usePluginInstall (under Ink's reconciler): who may download where, and install() resolving true with the
// "ready" toast or false with the "couldn't" one. PluginInstallBody / PluginInstallPage / PermissionGuard (static
// markup): the plugin's name and copy, Download and the Plugins link for people who may install, the ask-a-manager
// line for everyone else, Download off while offline, and the guard's prompt in place of a page whose plugin is off.
// PluginInstallDialog (Ink, primitives mocked to record the footer): Download installs, closes and continues; a
// failure stays open; a close mid-download drops the continuation; without the right, one Close button.

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement as h, type ReactNode } from "react";
import type { PluginInstall } from "@/components/plugins/use-plugin-install";

const noop = () => {};
const NAMES: Record<string, string> = { "device.catalog.docs": "Docs", "device.catalog.sheets": "Sheets", "device.catalog.sales": "Sales" };
const WITH_APP = new Set([
  "pluginInstall.missingTitle", "pluginInstall.openBody", "pluginInstall.createBody", "pluginInstall.pageBody",
  "pluginInstall.askManager", "pluginInstall.askOtherDevice", "pluginInstall.installed", "pluginInstall.failed",
]);
/** `key`, or `key(<app>)` for copy that names the plugin, so assertions see both the key and the name. */
const tr = (key: string) => NAMES[key] ?? (WITH_APP.has(key) ? `${key}({app})` : key);

const state = {
  role: "owner" as string,
  permissions: {} as Record<string, unknown>,
  canView: true,
  tabletRole: "owner" as string | null,
  installed: new Set<string>(),
  ready: true,
  savingId: null as string | null,
  offline: false,
  path: "/manager/sales",
  /** The next setInstalled rejects with this. */
  fail: null as unknown,
  /** setInstalled waits for this before settling, when set. */
  hold: null as Promise<void> | null,
};
const installs: Array<[string, boolean]> = [];
const toasts: Array<[string, string]> = [];

mock.module("sonner", () => ({
  toast: Object.assign((message: string) => void toasts.push(["info", message]), {
    success: (message: string) => void toasts.push(["success", message]),
    error: (message: string) => void toasts.push(["error", message]),
  }),
}));
mock.module("@/lib/i18n/context", () => ({ useT: () => tr, useI18n: () => ({ locale: "en", dir: "ltr", setLocale: noop, t: tr }) }));
mock.module("@/lib/haptics", () => ({ hapticLight: noop, hapticMedium: noop, hapticHeavy: noop, hapticSuccess: noop, hapticError: noop, hapticWarning: noop }));
mock.module("@/lib/context/permissions", () => ({
  usePermissions: () => ({
    organizationId: "org-1", role: state.role, permissions: state.permissions, isOwner: state.role === "owner",
    can: () => state.canView, organizations: [], currentOrg: null,
  }),
}));
mock.module("@/lib/spacetimedb/hooks/useDeviceApps", () => ({
  useDeviceApps: () => ({
    installed: state.installed,
    installedIds: [...state.installed],
    isInstalled: (id: string) => state.installed.has(id),
    setInstalled: async (id: string, on: boolean) => {
      installs.push([id, on]);
      if (state.hold) await state.hold;
      const fail = state.fail;
      state.fail = null;
      if (fail) throw fail;
      if (on) state.installed.add(id);
    },
    savingId: state.savingId,
    isReady: state.ready,
    loading: !state.ready,
  }),
}));
mock.module("@/lib/spacetimedb/hooks/useDocs", () => ({
  useSignedInMember: () => ({ memberId: "tablet-1", role: state.tabletRole, ready: true }),
}));
mock.module("@/lib/offline-mode", () => ({
  useOfflineMode: () => ({ isOffline: state.offline, pendingCount: 0, cachedSnapshot: null, snapshotLoaded: true }),
}));
mock.module("next/navigation", () => ({
  usePathname: () => state.path,
  useRouter: () => ({ push: noop, replace: noop, back: noop, forward: noop, refresh: noop, prefetch: noop }),
}));
mock.module("next/link", () => ({
  default: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children?: ReactNode } & Record<string, unknown>) => {
    void prefetch;
    return h("a", { href, ...rest }, children);
  },
}));

// The dialog renders through Ink, which has no DOM elements: the primitives pass their children through, the header
// (tile and copy) is recorded as text, and the footer's props are kept to press its buttons.
interface Footer { onCancel?: () => void; onConfirm?: () => void; cancelLabel?: string; confirmLabel?: string; saving?: boolean; disabled?: boolean }
let footer: Footer | null = null;
let headerText = "";
const through = ({ children }: { children?: ReactNode }) => children ?? null;
const textOf = (node: ReactNode): string =>
  node == null || typeof node === "boolean" ? "" : typeof node === "string" || typeof node === "number" ? String(node)
    : Array.isArray(node) ? node.map(textOf).join("")
    : typeof node === "object" && "props" in node ? textOf((node.props as { children?: ReactNode }).children) : "";
mock.module("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children?: ReactNode }) => (open ? children : null),
  AlertDialogContent: through,
  AlertDialogHeader: ({ children }: { children?: ReactNode }) => {
    headerText = textOf(children);
    return null;
  },
  AlertDialogMedia: through,
  AlertDialogTitle: through,
  AlertDialogDescription: through,
}));
mock.module("@/components/ui/dialog-actions", () => ({
  DialogActions: (props: Footer) => {
    footer = props;
    return null;
  },
}));

const { render } = await import("ink-testing-library");
const { renderToStaticMarkup } = await import("react-dom/server");
const { usePluginInstall } = await import("@/components/plugins/use-plugin-install");
const { PluginInstallBody, PluginInstallDialog, PluginInstallPage } = await import("@/components/plugins/plugin-install-prompt");
const { PermissionGuard } = await import("@/components/permission-guard");

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

function Probe({ surface, report }: { surface?: "manager" | "store" | "personal"; report(value: PluginInstall): void }) {
  report(usePluginInstall({ surface }));
  return null;
}
function mountHook(surface?: "manager" | "store" | "personal"): () => PluginInstall {
  const box: { current: PluginInstall | null } = { current: null };
  render(h(Probe, { surface, report: (value: PluginInstall) => void (box.current = value) }));
  return () => {
    if (!box.current) throw new Error("not rendered");
    return box.current;
  };
}
const markup = (node: ReactNode) => renderToStaticMarkup(h("div", null, node)).replace(/&#x27;/g, "'");

beforeEach(() => {
  Object.assign(state, {
    role: "owner", permissions: {}, canView: true, tabletRole: "owner", installed: new Set<string>(), ready: true,
    savingId: null, offline: false, path: "/manager/sales", fail: null, hold: null,
  });
  installs.length = 0;
  toasts.length = 0;
  footer = null;
  headerText = "";
});

describe("usePluginInstall", () => {
  test("install state passes through; canInstall follows the role, and on /store the tablet account too", () => {
    state.installed = new Set(["docs"]);
    state.ready = false;
    const owner = mountHook()();
    expect([owner.ready, owner.isInstalled("docs"), owner.isInstalled("sheets"), owner.canInstall]).toEqual([false, true, false, true]);
    state.role = "staff";
    expect(mountHook()().canInstall).toBe(false);
    state.permissions = { settings: { view: true, edit: true } };
    expect(mountHook("personal")().canInstall).toBe(true);
    state.role = "manager";
    state.tabletRole = "staff";
    expect(mountHook("store")().canInstall).toBe(false);
    expect(mountHook("manager")().canInstall).toBe(true);
  });

  test("install(): true with the ready toast once the org-wide write lands", async () => {
    const install = mountHook();
    expect(await install().install("sheets")).toBe(true);
    expect(installs).toEqual([["sheets", true]]);
    expect(toasts).toEqual([["success", "pluginInstall.installed(Sheets)"]]);
  });

  test("install(): false with the couldn't toast when the write fails", async () => {
    state.fail = new Error("not allowed");
    const original = console.warn;
    console.warn = noop;
    try {
      expect(await mountHook()().install("docs")).toBe(false);
    } finally {
      console.warn = original;
    }
    expect(toasts).toEqual([["error", "pluginInstall.failed(Docs)"]]);
  });

  test("install() without the right never sends the write and says who to ask", async () => {
    state.role = "staff";
    expect(await mountHook()().install("docs")).toBe(false);
    expect(installs).toEqual([]);
    expect(toasts).toEqual([["error", "pluginInstall.askManager(Docs)"]]);
  });
});

const install = (over: Partial<PluginInstall> = {}): PluginInstall => ({
  ready: true, isInstalled: () => false, canInstall: true, askKey: "pluginInstall.askManager", savingId: null, install: async () => true, ...over,
});

describe("PluginInstallBody", () => {
  test("names the plugin with the copy for what the person was doing", () => {
    const open = markup(h(PluginInstallBody, { appId: "sheets", mode: "open", install: install() }));
    expect(open).toContain("pluginInstall.missingTitle(Sheets)");
    expect(open).toContain("pluginInstall.openBody(Sheets)");
    expect(open).not.toContain("askManager");
    expect(markup(h(PluginInstallBody, { appId: "docs", mode: "create", install: install() }))).toContain("pluginInstall.createBody(Docs)");
    expect(markup(h(PluginInstallBody, { appId: "docs", mode: "page", install: install() }))).toContain("pluginInstall.pageBody(Docs)");
  });

  test("tells people who can't download to ask; offline only matters to people who can", () => {
    const member = markup(h(PluginInstallBody, { appId: "docs", mode: "open", install: install({ canInstall: false }), offline: true }));
    expect(member).toContain("pluginInstall.askManager(Docs)");
    expect(member).not.toContain("pluginInstall.offline");
    expect(markup(h(PluginInstallBody, { appId: "docs", mode: "open", install: install(), offline: true }))).toContain("pluginInstall.offline");
  });
});

describe("PluginInstallPage and PermissionGuard", () => {
  const page = () => h(PermissionGuard, { section: "dashboard", children: h("main", null, "the page") });

  test("a route whose plugin is off shows the plugin's prompt with Download and the Plugins link", () => {
    const html = markup(page());
    expect(html).not.toContain("the page");
    expect(html).toContain("pluginInstall.missingTitle(Sales)");
    expect(html).toContain("pluginInstall.pageBody(Sales)");
    expect(html).toMatch(/<button[^>]*>.*pluginInstall\.download<\/button>/);
    expect(html).toContain('href="/manager/apps"');
    expect(html).toContain("pluginInstall.openPlugins");
  });

  test("people who can't download only get the ask-a-manager line", () => {
    state.role = "staff";
    const html = markup(page());
    expect(html).toContain("pluginInstall.askManager(Sales)");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("/manager/apps");
  });

  test("offline: Download is off and says why; while saving it spins", () => {
    state.offline = true;
    const offline = markup(h(PluginInstallPage, { appId: "sales" }));
    expect(offline).toMatch(/<button[^>]*disabled[^>]*>/);
    expect(offline).toContain("pluginInstall.offline");
    state.offline = false;
    state.savingId = "sales";
    const saving = markup(h(PluginInstallPage, { appId: "sales" }));
    expect(saving).toContain("pluginInstall.downloading");
    expect(saving).toMatch(/<button[^>]*disabled[^>]*>/);
  });

  test("the page itself once the plugin is installed, before install state loads, and on always-on routes", () => {
    state.installed = new Set(["sales"]);
    expect(markup(page())).toContain("the page");
    state.installed = new Set();
    state.ready = false;
    expect(markup(page())).toContain("the page");
    state.ready = true;
    state.path = "/manager/inventory";
    expect(markup(page())).toContain("the page");
  });

  test("no view permission still shows the no-access notice, not the prompt", () => {
    state.canView = false;
    const html = markup(page());
    expect(html).toContain("components.permissionGuard.noAccess");
    expect(html).not.toContain("pluginInstall");
  });
});

describe("PluginInstallDialog", () => {
  function mountDialog(props: { mode?: "open" | "create"; surface?: "manager" | "store" } = {}) {
    const events: string[] = [];
    const element = (open: boolean) =>
      h(PluginInstallDialog, {
        open,
        appId: "sheets",
        mode: props.mode ?? "open",
        surface: props.surface,
        onOpenChange: (next: boolean) => void events.push(`openChange:${next}`),
        onInstalled: () => void events.push("installed"),
      });
    const app = render(element(true));
    return { events, close: () => app.rerender(element(false)) };
  }

  test("Download installs, closes and continues", async () => {
    const { events } = mountDialog({ mode: "create" });
    expect(headerText).toContain("pluginInstall.missingTitle(Sheets)");
    expect(headerText).toContain("pluginInstall.createBody(Sheets)");
    expect(footer?.confirmLabel).toBe("pluginInstall.download");
    expect(footer?.cancelLabel).toBe("pluginInstall.notNow");
    footer?.onConfirm?.();
    await flush();
    expect(installs).toEqual([["sheets", true]]);
    expect(events).toEqual(["openChange:false", "installed"]);
  });

  test("a failed download stays open for a retry", async () => {
    state.fail = new Error("boom");
    const original = console.warn;
    console.warn = noop;
    try {
      const { events } = mountDialog();
      footer?.onConfirm?.();
      await flush();
      expect(events).toEqual([]);
      expect(footer?.saving).toBe(false);
      expect(toasts).toEqual([["error", "pluginInstall.failed(Sheets)"]]);
    } finally {
      console.warn = original;
    }
  });

  test("closing while it downloads drops the continuation", async () => {
    let release = noop;
    state.hold = new Promise<void>((resolve) => (release = resolve));
    const { events, close } = mountDialog();
    footer?.onConfirm?.();
    await flush();
    expect(footer?.saving).toBe(true);
    footer?.onCancel?.();
    close();
    release();
    await flush();
    expect(events).toEqual(["openChange:false"]);
  });

  test("offline: Download is off and the copy says why", () => {
    state.offline = true;
    mountDialog();
    expect(footer?.disabled).toBe(true);
    expect(headerText).toContain("pluginInstall.offline");
  });

  test("a staff operator is told to ask an owner or a manager", () => {
    state.role = "staff";
    mountDialog({ surface: "store" });
    expect(headerText).toContain("pluginInstall.askManager(Sheets)");
    expect(footer?.confirmLabel).toBe("common.close");
  });

  test("without the right (a staff tablet on /store) there is one Close button and the line to use another device", () => {
    state.tabletRole = "staff";
    const { events } = mountDialog({ surface: "store" });
    // The operator may manage plugins; only the tablet's account stands in the way, so asking a manager is wrong.
    expect(headerText).toContain("pluginInstall.askOtherDevice(Sheets)");
    expect(footer?.onCancel).toBeUndefined();
    expect(footer?.confirmLabel).toBe("common.close");
    footer?.onConfirm?.();
    expect(events).toEqual(["openChange:false"]);
    expect(installs).toEqual([]);
  });
});
