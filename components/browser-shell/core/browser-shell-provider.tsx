"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { isCapacitorHiddenPath, useIsCapacitor } from "@/lib/capacitor";
import { usePermissions } from "@/lib/context/permissions";
import { useT } from "@/lib/i18n/context";
import { isNativeShell } from "@/lib/native-shell";
import { useAccessContext } from "@/lib/browser-shell/access";
import { installAndroidBack } from "@/lib/browser-shell/android-back";
import { OPEN_TAB_EVENT, useTab, useTabPresentation, useTabsSnapshot } from "@/lib/browser-shell/hooks";
import { installLinkInterceptor } from "@/lib/browser-shell/link-intercept";
import { matchRoute } from "@/lib/browser-shell/routes";
import {
  ShellInfoProvider,
  emitShellCommand,
  hasShellCommandHandler,
  registerShellCommandHandler,
  setRouteChromeDefault,
} from "@/lib/browser-shell/shell-context";
import { markBrowserShellMounted } from "@/lib/browser-shell/shell-dom";
import { installSignOutPurge } from "@/lib/browser-shell/sign-out";
import { getShortcutEnv, installShortcuts } from "@/lib/browser-shell/shortcuts";
import { TAB_COMMANDS, executeShellCommand, tabsStore } from "@/lib/browser-shell/store";
import type { BrowserTab, ShellInfo, ShellLayout, TabsSnapshot } from "@/lib/browser-shell/types";
import { canonicalizeUrl } from "@/lib/browser-shell/url";
import { RouterInvariantGuard } from "./router-invariant-guard";

const COARSE_POINTER_QUERY = "(pointer: coarse)";

function subscribeCoarsePointer(onChange: () => void): () => void {
  const query = window.matchMedia(COARSE_POINTER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readCoarsePointer(): boolean {
  return window.matchMedia(COARSE_POINTER_QUERY).matches;
}

function renderedTab(snapshot: TabsSnapshot): BrowserTab | null {
  return snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId) ?? null;
}

/** `document.title = "<tab title> | Merchiva"` (template in app/layout.tsx), for the rendered tab. */
function DocumentTitleSync(): null {
  const snapshot = useTabsSnapshot();
  const tab = useTab(snapshot.activeTabId);
  const { title } = useTabPresentation(tab);
  const pathname = usePathname();
  useEffect(() => {
    document.title = `${title} | Merchiva`;
  }, [title, pathname]);
  useEffect(() => {
    const initial = document.title;
    return () => {
      document.title = initial;
    };
  }, []);
  return null;
}

/**
 * Binds the tab store to the signed-in user, current org and Next router, and installs every
 * shared shell behaviour (plan §B2.1): history bridge, invariant guard, link interception,
 * shortcuts, Android back, OPEN_TAB_EVENT, the Capacitor-hidden bounce, the
 * `<html data-browser-shell>` mark and `document.title`. Chromes render inside it and only
 * read the public API.
 */
export function BrowserShellProvider({ layout, children }: { layout: ShellLayout; children: ReactNode }): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const { user } = useAuth();
  const { organizationId } = usePermissions();
  const access = useAccessContext();
  const isCapacitor = useIsCapacitor();
  const coarse = useSyncExternalStore(subscribeCoarsePointer, readCoarsePointer, () => false);
  const info = useMemo<ShellInfo>(() => ({ layout, coarse }), [layout, coarse]);
  const userId = user?.id ?? null;

  useLayoutEffect(() => markBrowserShellMounted(layout), [layout]);

  useLayoutEffect(() => {
    tabsStore.setTranslator(t);
  }, [t]);

  useLayoutEffect(() => {
    tabsStore.setAccess(access);
  }, [access]);

  useLayoutEffect(() => () => tabsStore.setAccess(null), []);

  // Bound before first paint so the chrome never renders an empty strip. A layout change
  // (crossing 1024px) re-renders this provider but never re-binds.
  useLayoutEffect(() => {
    if (!userId || !organizationId) return;
    return tabsStore.bind({ scope: { userId, organizationId }, router });
  }, [userId, organizationId, router]);

  useEffect(() => {
    setRouteChromeDefault(matchRoute(pathname ?? "")?.mobileChrome ?? "overlay");
  }, [pathname]);

  useEffect(() => () => setRouteChromeDefault("overlay"), []);

  useEffect(() => {
    const env = getShortcutEnv();
    const removeShortcuts = installShortcuts(
      env,
      (cmd) => {
        if (!executeShellCommand(cmd)) emitShellCommand(cmd);
      },
      {
        isEnabled: tabsStore.isReady,
        // Only swallow a combo something will act on: `toggleSidebar` and `toggleBookmarksBar`
        // are desktop-chrome commands, so on the mobile chrome nothing registers them and the
        // key belongs to the browser.
        canHandle: (cmd) => TAB_COMMANDS.includes(cmd) || hasShellCommandHandler(cmd),
      },
    );
    const removeLinks = installLinkInterceptor({
      isMac: env.isMac,
      isTauri: isNativeShell(),
      isEnabled: tabsStore.isReady,
      getActiveTabId: () => tabsStore.getState().activeTabId,
      open: (url, { activate }) => tabsStore.actions.openUrl(url, activate ? "new-foreground" : "new-background"),
      onPlainNavigate: (url) => tabsStore.markPlainNavigation(url),
    });
    const removeCommands = TAB_COMMANDS.map((cmd) =>
      registerShellCommandHandler(cmd, () => {
        executeShellCommand(cmd);
      }),
    );
    const removeBack = installAndroidBack({
      canGoBack: () => (renderedTab(tabsStore.getState())?.history.index ?? 0) > 0,
      goBack: () => tabsStore.actions.goBack(),
      closeToOpener: () => {
        const snapshot = tabsStore.getState();
        const tab = renderedTab(snapshot);
        if (!tab || tab.history.index > 0 || !tab.openerTabId) return false;
        if (!snapshot.tabs.some((candidate) => candidate.id === tab.openerTabId)) return false;
        tabsStore.actions.closeTab(tab.id);
        return true;
      },
    });
    const onOpenTab = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: unknown; activate?: unknown }>).detail;
      if (!detail || typeof detail.url !== "string") return;
      if (tabsStore.isReady()) {
        tabsStore.actions.openUrl(detail.url, detail.activate === false ? "new-background" : "new-foreground");
        return;
      }
      const target = canonicalizeUrl(detail.url);
      if (target?.tabbable) router.push(target.url);
    };
    window.addEventListener(OPEN_TAB_EVENT, onOpenTab);
    // lib/auth signOut dispatches SHELL_SIGN_OUT_EVENT synchronously, before it wipes storage and unmounts the shell.
    const removeSignOutPurge = installSignOutPurge();
    return () => {
      removeShortcuts();
      removeSignOutPurge();
      removeLinks();
      for (const remove of removeCommands) remove();
      removeBack();
      window.removeEventListener(OPEN_TAB_EVENT, onOpenTab);
    };
  }, [router]);

  // In the native Capacitor app, SEO/marketing routes are hidden (same bounce as sidebar.tsx MobileShell).
  useEffect(() => {
    if (isCapacitor && pathname && isCapacitorHiddenPath(pathname)) router.replace("/manager/");
  }, [isCapacitor, pathname, router]);

  return (
    <ShellInfoProvider value={info}>
      {children}
      <DocumentTitleSync />
      <Suspense fallback={null}>
        <RouterInvariantGuard />
      </Suspense>
    </ShellInfoProvider>
  );
}
