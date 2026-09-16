import { canonicalizeUrl } from "./url";
import { HOME_URL, NEW_TAB_URL, type OpenTabResult, type TabActions } from "./types";

/*
 * Tab actions without a bound browser shell (plan §B1.5): the legacy MobileShell, /store and
 * /personal device surfaces, the device app catalog, and the moment before the store binds.
 * Navigation falls back to the Next router; tab-only operations are no-ops. Callers must only
 * surface an error when `reason === "limit"`.
 */

export interface FallbackRouter {
  push(href: string): void;
  replace(href: string): void;
  back(): void;
  forward(): void;
  refresh(): void;
}

export const NO_SHELL_RESULT: OpenTabResult = Object.freeze({ ok: false, reason: "noShell" });

function noop(): void {}

/** Same-origin canonical URL, or null for anything that must never reach the router (XSS note in use-router.md). */
function safeHref(url: string): string | null {
  return canonicalizeUrl(url)?.url ?? null;
}

export function createFallbackTabActions(router: FallbackRouter): TabActions {
  const push = (url: string) => {
    const href = safeHref(url);
    if (href) router.push(href);
  };
  return {
    openTab: (url) => {
      push(url);
      return NO_SHELL_RESULT;
    },
    openNewTabPage: (opts) => {
      push(opts?.query ? `${NEW_TAB_URL}?q=${encodeURIComponent(opts.query)}` : NEW_TAB_URL);
      return NO_SHELL_RESULT;
    },
    openUrl: (url) => push(url),
    activateTab: noop,
    activateRelative: noop,
    activateIndex: noop,
    closeTab: noop,
    closeOtherTabs: noop,
    closeTabsToRight: noop,
    closeAllTabs: noop,
    reorderTab: noop,
    setPinned: noop,
    duplicateTab: () => NO_SHELL_RESULT,
    reopenClosedTab: () => null,
    navigateActive: (url, opts) => {
      const href = safeHref(url);
      if (!href) return;
      if (opts?.mode === "replace") router.replace(href);
      else router.push(href);
    },
    goBack: () => router.back(),
    goForward: () => router.forward(),
    goToEntry: noop,
    reload: (opts) => {
      if (opts?.hard) window.location.reload();
      else router.refresh();
    },
    goHome: () => router.push(HOME_URL),
    prepareOrgSwitch: noop,
  };
}
