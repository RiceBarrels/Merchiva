// The phone layout's single-tab policy (lib/browser-shell/single-tab.ts): what the tab actions,
// the shell commands, the context menu, the Drive item menu (files and documents) and keep-alive do while the
// mounted browser shell is "mobile", and that the desktop gets every call through untouched.

import { afterEach, describe, expect, test } from "bun:test";
import { driveActionGroups } from "@/components/drive/model/actions";
import type { DocEntry } from "@/components/drive/model/types";
import { buildContextMenu, type ContextMenuDeps, type ContextMenuHandlers } from "@/lib/browser-shell/context-menu-items";
import type { ShellContextHit } from "@/lib/browser-shell/context-menu";
import {
  MOBILE_KEEP_ALIVE,
  initialKeepAlive,
  keepAliveLimit,
  reconcileKeepAlive,
  type KeepAliveInput,
} from "@/lib/browser-shell/keep-alive";
import {
  isSingleTabLayout,
  isSingleTabShell,
  runTabCommand,
  shellCommandApplies,
  withSingleTabPolicy,
  withoutNewTabRows,
} from "@/lib/browser-shell/single-tab";
import type { OpenTabResult, ShellCommand, TabActions } from "@/lib/browser-shell/types";

// ─── A recording TabActions ──────────────────────────────────────────────────

type Call = readonly [string, ...unknown[]];

const STORE_RESULT: OpenTabResult = { ok: true, tabId: "t_new", reused: false };

function recorder(): { actions: TabActions; calls: Call[] } {
  const calls: Call[] = [];
  const record = (name: string, ...args: unknown[]): OpenTabResult => {
    calls.push([name, ...args]);
    return STORE_RESULT;
  };
  const actions: TabActions = {
    openTab: (url, opts) => record("openTab", url, opts),
    openNewTabPage: (opts) => record("openNewTabPage", opts),
    openUrl: (url, disposition) => void record("openUrl", url, disposition),
    activateTab: (id) => void record("activateTab", id),
    activateRelative: (delta) => void record("activateRelative", delta),
    activateIndex: (index) => void record("activateIndex", index),
    closeTab: (id, opts) => void record("closeTab", id, opts),
    closeOtherTabs: (id) => void record("closeOtherTabs", id),
    closeTabsToRight: (id) => void record("closeTabsToRight", id),
    closeAllTabs: () => void record("closeAllTabs"),
    reorderTab: (id, toIndex) => void record("reorderTab", id, toIndex),
    setPinned: (id, pinned) => void record("setPinned", id, pinned),
    duplicateTab: (id) => record("duplicateTab", id),
    reopenClosedTab: (closedId) => record("reopenClosedTab", closedId),
    navigateActive: (url, opts) => void record("navigateActive", url, opts),
    goBack: (opts) => void record("goBack", opts),
    goForward: () => void record("goForward"),
    goToEntry: (tabId, index) => void record("goToEntry", tabId, index),
    reload: (opts) => void record("reload", opts),
    goHome: () => void record("goHome"),
    prepareOrgSwitch: (orgId) => void record("prepareOrgSwitch", orgId),
  };
  return { actions, calls };
}

function policy(opts: { single: () => boolean; shown?: () => string | null }) {
  const { actions, calls } = recorder();
  const wrapped = withSingleTabPolicy(actions, { isSingleTab: opts.single, shownTabId: opts.shown ?? (() => "t_shown") });
  return { wrapped, calls };
}

/** Runs every tab action once with fixed arguments; returns what each call returned. */
function exercise(actions: TabActions): unknown[] {
  return [
    actions.openTab("/manager/sales", { activate: false, dedupe: "activateExisting" }),
    actions.openNewTabPage({ query: "eggs" }),
    actions.openUrl("/manager/sales", "new-foreground"),
    actions.openUrl("/manager/sales", "new-background"),
    actions.openUrl("/manager/sales", "current"),
    actions.activateTab("t_b"),
    actions.activateRelative(1),
    actions.activateIndex("last"),
    actions.closeTab("t_b", { source: "menu" }),
    actions.closeOtherTabs("t_b"),
    actions.closeTabsToRight("t_b"),
    actions.closeAllTabs(),
    actions.reorderTab("t_b", 2),
    actions.setPinned("t_b", true),
    actions.duplicateTab("t_b"),
    actions.reopenClosedTab("c_1"),
    actions.navigateActive("/manager/sales", { mode: "replace" }),
    actions.goBack({ closeToOpener: true }),
    actions.goForward(),
    actions.goToEntry("t_b", 1),
    actions.reload({ hard: true }),
    actions.goHome(),
    actions.prepareOrgSwitch("org_2"),
  ];
}

// ─── Tab actions ─────────────────────────────────────────────────────────────

describe("withSingleTabPolicy", () => {
  test("off the phone layout every call reaches the store unchanged, with its own result", () => {
    const direct = recorder();
    const expectedResults = exercise(direct.actions);
    const { wrapped, calls } = policy({ single: () => false });
    expect(exercise(wrapped)).toEqual(expectedResults);
    expect(calls).toEqual(direct.calls);
  });

  test("on the phone layout opening a tab navigates the tab on screen and reports it", () => {
    const { wrapped, calls } = policy({ single: () => true });
    expect(wrapped.openTab("/manager/sales", { activate: true, position: "end" })).toEqual({ ok: true, tabId: "t_shown", reused: true });
    expect(wrapped.openTab("/manager/sales", { activate: false })).toEqual({ ok: true, tabId: "t_shown", reused: true });
    expect(wrapped.openTab("/manager/sales", { dedupe: "activateExisting" })).toEqual({ ok: true, tabId: "t_shown", reused: true });
    expect(calls).toEqual([
      ["navigateActive", "/manager/sales"],
      ["navigateActive", "/manager/sales"],
      ["navigateActive", "/manager/sales"],
    ]);
  });

  test("every openUrl disposition navigates the tab on screen", () => {
    const { wrapped, calls } = policy({ single: () => true });
    wrapped.openUrl("/manager/docs/edit?id=1", "new-foreground");
    wrapped.openUrl("/manager/drive", "new-background");
    wrapped.openUrl("/manager/sales", "current");
    expect(calls).toEqual([
      ["navigateActive", "/manager/docs/edit?id=1"],
      ["navigateActive", "/manager/drive"],
      ["navigateActive", "/manager/sales"],
    ]);
  });

  test("the New Tab page opens in the tab on screen, with its trimmed query", () => {
    const { wrapped, calls } = policy({ single: () => true });
    expect(wrapped.openNewTabPage()).toEqual({ ok: true, tabId: "t_shown", reused: true });
    wrapped.openNewTabPage({ query: "  fresh eggs " });
    wrapped.openNewTabPage({ query: "   " });
    expect(calls).toEqual([
      ["navigateActive", "/manager/new-tab"],
      ["navigateActive", "/manager/new-tab?q=fresh%20eggs"],
      ["navigateActive", "/manager/new-tab"],
    ]);
  });

  test("a URL the store would refuse opens nothing and says notTabbable", () => {
    const { wrapped, calls } = policy({ single: () => true });
    expect(wrapped.openTab("/login")).toEqual({ ok: false, reason: "notTabbable" });
    expect(wrapped.openTab("https://example.com/manager/sales")).toEqual({ ok: false, reason: "notTabbable" });
    expect(wrapped.openTab("/manager/setup")).toEqual({ ok: false, reason: "notTabbable" });
    expect(calls).toEqual([]);
  });

  test("legacy paths count as tabbable once redirected, as in the store", () => {
    const { wrapped, calls } = policy({ single: () => true });
    expect(wrapped.openTab("/manager").ok).toBe(true);
    expect(wrapped.openTab("/~/inventory").ok).toBe(true);
    expect(calls).toEqual([
      ["navigateActive", "/manager"],
      ["navigateActive", "/~/inventory"],
    ]);
  });

  test("with no tab on screen the page still opens, reported like a shell-less open", () => {
    const { wrapped, calls } = policy({ single: () => true, shown: () => null });
    expect(wrapped.openTab("/manager/sales")).toEqual({ ok: false, reason: "noShell" });
    expect(calls).toEqual([["navigateActive", "/manager/sales"]]);
  });

  test("switching, duplicating and reopening never reveal a hidden tab", () => {
    const { wrapped, calls } = policy({ single: () => true });
    wrapped.activateTab("t_hidden");
    wrapped.activateRelative(1);
    wrapped.activateRelative(-1);
    wrapped.activateIndex(0);
    wrapped.activateIndex("last");
    const duplicated = wrapped.duplicateTab("t_shown");
    expect(duplicated.ok).toBe(false);
    // Callers only surface `reason === "limit"` (useTabActions contract).
    expect(duplicated.ok === false && duplicated.reason).toBe("noShell");
    expect(wrapped.reopenClosedTab()).toBeNull();
    expect(wrapped.reopenClosedTab("c_1")).toBeNull();
    expect(calls).toEqual([]);
  });

  test("navigation, history, reload, home, closing and org switch pass through on the phone", () => {
    const { wrapped, calls } = policy({ single: () => true });
    wrapped.navigateActive("/manager/sales", { mode: "replace" });
    wrapped.goBack({ closeToOpener: true });
    wrapped.goForward();
    wrapped.goToEntry("t_shown", 0);
    wrapped.reload({ hard: false });
    wrapped.goHome();
    wrapped.closeTab("t_shown", { source: "pointer" });
    wrapped.prepareOrgSwitch("org_2");
    expect(calls.map(([name]) => name)).toEqual([
      "navigateActive", "goBack", "goForward", "goToEntry", "reload", "goHome", "closeTab", "prepareOrgSwitch",
    ]);
    expect(calls[1]).toEqual(["goBack", { closeToOpener: true }]);
  });

  test("the layout is read on every call, so crossing 1024px switches the policy at once", () => {
    let single = false;
    const { wrapped, calls } = policy({ single: () => single });
    wrapped.openUrl("/manager/sales", "new-foreground");
    single = true;
    wrapped.openUrl("/manager/sales", "new-foreground");
    single = false;
    wrapped.activateTab("t_b");
    expect(calls).toEqual([
      ["openUrl", "/manager/sales", "new-foreground"],
      ["navigateActive", "/manager/sales"],
      ["activateTab", "t_b"],
    ]);
  });
});

// ─── Layout signal ───────────────────────────────────────────────────────────

describe("which layout is single-tab", () => {
  const realDocument = (globalThis as { document?: unknown }).document;

  function mountShell(layout: string | null): void {
    (globalThis as { document?: unknown }).document = {
      documentElement: { getAttribute: (name: string) => (name === "data-browser-shell" ? layout : null) },
    };
  }

  afterEach(() => {
    (globalThis as { document?: unknown }).document = realDocument;
  });

  test("only the mobile browser shell", () => {
    expect(isSingleTabLayout("mobile")).toBe(true);
    expect(isSingleTabLayout("desktop")).toBe(false);
    expect(isSingleTabLayout(null)).toBe(false);
  });

  test("read from <html data-browser-shell>; no shell (legacy shell, devices, server) is not single-tab", () => {
    mountShell("mobile");
    expect(isSingleTabShell()).toBe(true);
    mountShell("desktop");
    expect(isSingleTabShell()).toBe(false);
    mountShell(null);
    expect(isSingleTabShell()).toBe(false);
    (globalThis as { document?: unknown }).document = undefined;
    expect(isSingleTabShell()).toBe(false);
  });
});

// ─── Shell commands ──────────────────────────────────────────────────────────

const ALL_COMMANDS: readonly ShellCommand[] = [
  "newTab", "closeTab", "reopenClosedTab", "nextTab", "prevTab",
  "selectTab1", "selectTab2", "selectTab3", "selectTab4", "selectTab5", "selectTab6", "selectTab7", "selectTab8", "selectLastTab",
  "back", "forward", "reload", "hardReload", "home", "duplicateTab",
  "focusOmnibox", "showTabOverview", "toggleBookmarksBar", "toggleSidebar",
];
const DROPPED: readonly ShellCommand[] = [
  "closeTab", "reopenClosedTab", "nextTab", "prevTab",
  "selectTab1", "selectTab2", "selectTab3", "selectTab4", "selectTab5", "selectTab6", "selectTab7", "selectTab8", "selectLastTab",
  "duplicateTab",
];
const PASSED_ON_PHONE: readonly ShellCommand[] = ["back", "forward", "reload", "hardReload", "home"];

function commandRun(singleTab: boolean, ready = true) {
  const { actions, calls } = recorder();
  const executed: ShellCommand[] = [];
  const run = (cmd: ShellCommand) =>
    runTabCommand(cmd, {
      ready,
      singleTab,
      actions: withSingleTabPolicy(actions, { isSingleTab: () => singleTab, shownTabId: () => "t_shown" }),
      execute: (c) => {
        executed.push(c);
        return ready;
      },
    });
  return { run, executed, calls };
}

describe("shell commands", () => {
  test("off the phone layout every command goes to the store's runner, as before", () => {
    const { run, executed, calls } = commandRun(false);
    for (const cmd of ALL_COMMANDS) expect(run(cmd)).toBe(true);
    expect(executed).toEqual([...ALL_COMMANDS]);
    expect(calls).toEqual([]);
    for (const cmd of ALL_COMMANDS) expect(shellCommandApplies(cmd, false)).toBe(true);
  });

  test("off the phone layout an unbound store still reports false (the chrome gets the command)", () => {
    const { run, executed } = commandRun(false, false);
    expect(run("nextTab")).toBe(false);
    expect(executed).toEqual(["nextTab"]);
  });

  test("on the phone tab-switching commands are dropped and their keys stay with the browser", () => {
    const { run, executed, calls } = commandRun(true);
    for (const cmd of DROPPED) {
      expect(run(cmd)).toBe(false);
      expect(shellCommandApplies(cmd, true)).toBe(false);
    }
    expect(executed).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("on the phone New tab shows the New Tab page in the tab on screen", () => {
    const { run, executed, calls } = commandRun(true);
    expect(run("newTab")).toBe(true);
    expect(executed).toEqual([]);
    expect(calls).toEqual([["navigateActive", "/manager/new-tab"]]);
  });

  test("on the phone back, forward, reload and home still run through the store", () => {
    const { run, executed } = commandRun(true);
    for (const cmd of PASSED_ON_PHONE) {
      expect(run(cmd)).toBe(true);
      expect(shellCommandApplies(cmd, true)).toBe(true);
    }
    expect(executed).toEqual([...PASSED_ON_PHONE]);
  });

  test("on the phone chrome commands still apply, and nothing runs before the store binds", () => {
    for (const cmd of ["focusOmnibox", "showTabOverview", "toggleBookmarksBar", "toggleSidebar"] as const) {
      expect(shellCommandApplies(cmd, true)).toBe(true);
    }
    const { run, executed, calls } = commandRun(true, false);
    expect(run("newTab")).toBe(false);
    expect(run("back")).toBe(false);
    expect(executed).toEqual([]);
    expect(calls).toEqual([]);
  });
});

// ─── Menus ───────────────────────────────────────────────────────────────────

const noopHandlers: ContextMenuHandlers = {
  openInNewTab: () => {}, openExternal: () => {}, copy: () => {}, copyUrl: () => {},
  bookmark: () => {}, unbookmarkPage: () => {}, search: () => {}, cut: () => {},
  copySelectionInField: () => {}, paste: () => {}, selectAll: () => {},
  back: () => {}, forward: () => {}, reload: () => {}, newTab: () => {},
};

function menuIds(hit: ShellContextHit, overrides: Partial<ContextMenuDeps>): string[] {
  const deps: ContextMenuDeps = {
    t: (key) => key,
    inShell: true,
    canGoBack: true,
    canGoForward: false,
    pageUrl: "/manager/inventory",
    pageTitle: "Inventory",
    pageBookmarked: false,
    pageActions: [],
    shortcuts: {},
    on: noopHandlers,
    ...overrides,
  };
  return buildContextMenu(hit, deps).flatMap((group) => group.items.map((item) => item.id));
}

const LINK_HIT: ShellContextHit = {
  x: 0, y: 0, custom: [], image: null, editable: null, selection: "12 units",
  link: { href: "https://app.test/manager/sales", text: "Sales", inApp: "/manager/sales" },
};

describe("menus on the phone layout", () => {
  test("the shell context menu drops its new-tab and bookmark items and keeps the rest", () => {
    const desktop = menuIds(LINK_HIT, {});
    expect(desktop).toEqual(menuIds(LINK_HIT, { singleTab: false }));
    const phoneOnlyDrops = ["link-new-tab", "link-background-tab", "page-new-tab", "link-bookmark", "page-bookmark"];
    for (const id of phoneOnlyDrops) expect(desktop).toContain(id);
    const phone = menuIds(LINK_HIT, { singleTab: true });
    expect(phone).toEqual(desktop.filter((id) => !phoneOnlyDrops.includes(id)));
    expect(phone).toContain("selection-search");
    expect(phone).toContain("page-back");
  });

  test("item menus drop only their Open in new tab row, and only on the phone", () => {
    const groups = [["open", "openNewTab"], ["rename", "share"], ["trash"]];
    expect(withoutNewTabRows(groups, false)).toBe(groups);
    expect(withoutNewTabRows(groups, true)).toEqual([["open"], ["rename", "share"], ["trash"]]);
    expect(withoutNewTabRows([["openNewTab"], ["details"]], true)).toEqual([["details"]]);
  });

  test("the Drive item menu on a document (entry-menu.tsx) keeps Open and loses Open in new tab", () => {
    const entry = {
      key: "doc:1", type: "sheet", trashedAt: null, starred: false, location: { space: "my", ownerMemberId: "m", parentId: "" },
      access: { canOpen: true, canRename: true, canMove: true, canTrash: true, canShare: true, canStar: true },
    } as unknown as DocEntry;
    const groups = driveActionGroups(entry, { surface: "manager", section: "my", offline: false }, { toStore: false, toMy: false });
    expect(groups[0]).toEqual(["open", "openNewTab"]);
    expect(withoutNewTabRows(groups, true)[0]).toEqual(["open"]);
    expect(withoutNewTabRows(groups, false)).toBe(groups);
  });
});

// ─── Keep-alive ──────────────────────────────────────────────────────────────

function keepAliveInput(patch: Partial<KeepAliveInput>): KeepAliveInput {
  return {
    ready: true,
    tabIds: ["A", "B", "C"],
    activeTabId: "A",
    requestedTabId: "A",
    requestedShowsLive: true,
    mountNonce: 0,
    liveKey: "/manager/a",
    limit: keepAliveLimit("mobile"),
    ...patch,
  };
}

describe("keep-alive on the phone layout", () => {
  test("only the visible page stays mounted", () => {
    expect(MOBILE_KEEP_ALIVE).toBe(1);
    expect(keepAliveLimit("mobile")).toBe(1);
  });

  test("pages kept alive by the desktop chrome are dropped, the live one stays", () => {
    // Three tabs shown on the desktop (limit 8), then the window narrows to the phone layout.
    let state = initialKeepAlive(keepAliveInput({ limit: 8 }));
    state = reconcileKeepAlive(state, keepAliveInput({ limit: 8, activeTabId: "B", requestedTabId: "B", liveKey: "/manager/b" }));
    state = reconcileKeepAlive(state, keepAliveInput({ limit: 8, activeTabId: "C", requestedTabId: "C", liveKey: "/manager/c" }));
    expect(state.slots.length).toBe(3);
    const phone = keepAliveInput({ activeTabId: "C", requestedTabId: "C", liveKey: "/manager/c" });
    state = reconcileKeepAlive(state, phone);
    expect(state.slots.map((slot) => slot.tabId)).toEqual(["C"]);
    expect(reconcileKeepAlive(state, phone)).toBe(state);
  });
});
