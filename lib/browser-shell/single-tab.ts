import { resolveLegacyRedirect } from "./routes";
import { readMountedBrowserShell, useMountedBrowserShell } from "./shell-dom";
import { canonicalizeUrl } from "./url";
import { NEW_TAB_URL, type OpenTabResult, type ShellCommand, type ShellLayout, type TabActions, type TabId } from "./types";

/*
 * Single-tab policy of the phone layout (the "mobile" browser shell, below 1024px). That chrome
 * has no tab strip, overview or switcher, so nothing on it may open a tab, switch to one or
 * reveal a hidden one: every "open in a new tab" shows its page in the tab on screen instead.
 *
 * Tabs the store already holds (restored from storage, or opened while the window was wider) are
 * never closed here. They stay hidden, unmounted (keep-alive.ts MOBILE_KEEP_ALIVE), and come back
 * with the desktop chrome. The policy is read on every call from `<html data-browser-shell>`, the
 * layout actually rendered, so it switches with the chrome when a window crosses 1024px.
 *
 * Pure apart from that one DOM read: the store binding lives in hooks.ts (shellTabActions) and
 * BrowserShellProvider, so the rules are testable without a tab store.
 */

/** The layout that runs single-tab: the phone chrome. Null (no browser shell) never does. */
export function isSingleTabLayout(layout: ShellLayout | null): boolean {
  return layout === "mobile";
}

/** True while the mounted browser shell is the single-tab phone layout. */
export function isSingleTabShell(): boolean {
  return isSingleTabLayout(readMountedBrowserShell());
}

/** React form of isSingleTabShell, for menus that drop their tab rows on the phone layout. */
export function useSingleTabShell(): boolean {
  return isSingleTabLayout(useMountedBrowserShell());
}

export interface SingleTabEnv {
  /** Whether the policy applies right now (isSingleTabShell for the live store). */
  isSingleTab(): boolean;
  /** The tab on screen (`requestedTabId ?? activeTabId`), or null while there is none. */
  shownTabId(): TabId | null;
}

const NOT_TABBABLE_RESULT: OpenTabResult = Object.freeze({ ok: false, reason: "notTabbable" });
/** What a tab-only operation reports without a tab to show it in (as fallback.ts does). */
const NO_TABS_RESULT: OpenTabResult = Object.freeze({ ok: false, reason: "noShell" });

/** The store's own target rule (store.ts resolveTabUrl): same origin, legacy redirects applied, tabbable. */
function isTabbableTarget(url: string): boolean {
  const first = canonicalizeUrl(url);
  if (!first) return false;
  const redirected = resolveLegacyRedirect(first.url);
  const final = redirected === first.url ? first : canonicalizeUrl(redirected);
  return final?.tabbable === true;
}

/**
 * `actions` under the single-tab policy. While `env.isSingleTab()`:
 * - openTab, openUrl (every disposition) and openNewTabPage navigate the tab on screen (a push)
 *   and report success with its id (`reused: true`), so no caller toasts or retries;
 * - activateTab, activateRelative and activateIndex do nothing: they could only reveal a hidden tab;
 * - duplicateTab reports `noShell` and reopenClosedTab `null`, exactly as without a shell
 *   (fallback.ts), since callers only surface `reason === "limit"`.
 * Everything else (navigateActive, back / forward, reload, home, closing, pinning, org switch)
 * passes through, and so does every call while the policy is off: the desktop is unchanged.
 */
export function withSingleTabPolicy(actions: TabActions, env: SingleTabEnv): TabActions {
  const showHere = (url: string): OpenTabResult => {
    if (!isTabbableTarget(url)) return NOT_TABBABLE_RESULT;
    actions.navigateActive(url);
    const tabId = env.shownTabId();
    return tabId ? { ok: true, tabId, reused: true } : NO_TABS_RESULT;
  };
  return {
    ...actions,
    openTab: (url, opts) => (env.isSingleTab() ? showHere(url) : actions.openTab(url, opts)),
    openNewTabPage: (opts) => {
      if (!env.isSingleTab()) return actions.openNewTabPage(opts);
      const query = opts?.query?.trim();
      return showHere(query ? `${NEW_TAB_URL}?q=${encodeURIComponent(query)}` : NEW_TAB_URL);
    },
    openUrl: (url, disposition) => {
      if (env.isSingleTab()) actions.navigateActive(url);
      else actions.openUrl(url, disposition);
    },
    activateTab: (id) => {
      if (!env.isSingleTab()) actions.activateTab(id);
    },
    activateRelative: (delta) => {
      if (!env.isSingleTab()) actions.activateRelative(delta);
    },
    activateIndex: (index) => {
      if (!env.isSingleTab()) actions.activateIndex(index);
    },
    duplicateTab: (id) => (env.isSingleTab() ? NO_TABS_RESULT : actions.duplicateTab(id)),
    reopenClosedTab: (closedId) => (env.isSingleTab() ? null : actions.reopenClosedTab(closedId)),
  };
}

/**
 * Tab commands that mean nothing with one tab: each would switch to, close, duplicate or reopen a
 * tab. The phone layout leaves them unhandled, so their keys stay with the browser.
 */
const SINGLE_TAB_DROPPED_COMMANDS: ReadonlySet<ShellCommand> = new Set<ShellCommand>([
  "closeTab", "reopenClosedTab", "nextTab", "prevTab",
  "selectTab1", "selectTab2", "selectTab3", "selectTab4", "selectTab5", "selectTab6", "selectTab7", "selectTab8", "selectLastTab",
  "duplicateTab",
]);

/** False for a tab command the single-tab layout drops; every command applies otherwise. */
export function shellCommandApplies(cmd: ShellCommand, singleTab: boolean): boolean {
  return !(singleTab && SINGLE_TAB_DROPPED_COMMANDS.has(cmd));
}

export interface TabCommandDeps {
  /** The tab store is bound (no command runs before). */
  readonly ready: boolean;
  readonly singleTab: boolean;
  /** Tab actions under this policy (withSingleTabPolicy). */
  readonly actions: TabActions;
  /** The store's own command runner (store.ts executeShellCommand). */
  execute(cmd: ShellCommand): boolean;
}

/**
 * Runs a core tab command under the policy: `execute` as before, except on the single-tab layout,
 * where "newTab" shows the New Tab page in the tab on screen and the dropped commands do nothing.
 * Returns false when nothing handled the command (it then goes to the chrome, as before).
 */
export function runTabCommand(cmd: ShellCommand, deps: TabCommandDeps): boolean {
  if (!deps.singleTab) return deps.execute(cmd);
  if (!deps.ready || !shellCommandApplies(cmd, true)) return false;
  if (cmd === "newTab") {
    deps.actions.openNewTabPage();
    return true;
  }
  return deps.execute(cmd);
}

/** The "Open in new tab" row of the Drive and Docs item menus (DriveAction, DocItemAction). */
const OPEN_NEW_TAB_ROW = "openNewTab";

/**
 * Item-menu groups without their "Open in new tab" row on the single-tab layout, empty groups
 * dropped. `groups` itself otherwise, so the desktop menus are untouched.
 */
export function withoutNewTabRows<A extends string>(groups: A[][], singleTab: boolean): A[][] {
  if (!singleTab) return groups;
  return groups
    .map((group) => group.filter((action) => action !== OPEN_NEW_TAB_ROW))
    .filter((group) => group.length > 0);
}
