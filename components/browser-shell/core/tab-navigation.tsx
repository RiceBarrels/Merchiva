"use client";

import { useContext, useMemo, type ContextType, type ReactNode } from "react";
import {
  AppRouterContext,
  GlobalLayoutRouterContext,
  LayoutRouterContext,
  type NavigateOptions,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  NavigationPromisesContext,
  PathParamsContext,
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { urlKeyOf } from "@/lib/browser-shell/model";
import { tabsStore } from "@/lib/browser-shell/store";
import { TabSlotContext } from "@/lib/browser-shell/tab-slot-context";
import type { TabId, UrlKey } from "@/lib/browser-shell/types";

/*
 * The Next.js router state a tab page reads, captured so a keep-alive slot keeps rendering the
 * navigation it last showed while the live router serves another tab. The manager layout's
 * `children` is Next's layout router, which reads its segment tree and cache node from
 * LayoutRouterContext rather than from props, and every navigation hook (usePathname,
 * useSearchParams, useParams, useSelectedLayoutSegment(s), and in development the
 * NavigationPromisesContext they read first) reads a context. Re-providing the captured values
 * under a slot therefore keeps its page on its own route. Cache nodes are never mutated once
 * filled (Next only resolves their pending data in place), so a captured tree stays renderable.
 *
 * These are the module instances Next's app router itself uses: in the client bundle both
 * resolve to `next/dist/shared/lib/*.shared-runtime.js [app-client]` (checked for 16.2.7; there
 * is no ESM duplicate), the same path PageTransition's FrozenRouter relies on.
 */

type AppRouter = NonNullable<ContextType<typeof AppRouterContext>>;

export interface TabNavigation {
  /** The layout router's parent tree / cache node, also read by useSelectedLayoutSegment(s). */
  readonly layoutRouter: ContextType<typeof LayoutRouterContext>;
  /** Tree and focus/scroll intent, read by the layout router's scroll handler. */
  readonly globalLayoutRouter: ContextType<typeof GlobalLayoutRouterContext>;
  readonly router: ContextType<typeof AppRouterContext>;
  readonly pathname: ContextType<typeof PathnameContext>;
  readonly searchParams: ContextType<typeof SearchParamsContext>;
  readonly params: ContextType<typeof PathParamsContext>;
  /** Development only (null in production builds). */
  readonly promises: ContextType<typeof NavigationPromisesContext>;
  /** UrlKey of this navigation's location, as the tab model keys entries. */
  readonly urlKey: UrlKey | null;
}

/** The live router state at this point of the tree; a new object whenever any part changes. */
export function useLiveTabNavigation(): TabNavigation {
  const layoutRouter = useContext(LayoutRouterContext);
  const globalLayoutRouter = useContext(GlobalLayoutRouterContext);
  const router = useContext(AppRouterContext);
  const pathname = useContext(PathnameContext);
  const searchParams = useContext(SearchParamsContext);
  const params = useContext(PathParamsContext);
  const promises = useContext(NavigationPromisesContext);
  const urlKey = useMemo(() => {
    if (pathname === null) return null;
    const search = searchParams?.toString() ?? "";
    return urlKeyOf(search ? `${pathname}?${search}` : pathname);
  }, [pathname, searchParams]);
  return useMemo(
    () => ({ layoutRouter, globalLayoutRouter, router, pathname, searchParams, params, promises, urlKey }),
    [layoutRouter, globalLayoutRouter, router, pathname, searchParams, params, promises, urlKey],
  );
}

/** Provides `navigation` (and the slot's tab id) to a slot's page. */
export function TabNavigationProvider({
  navigation,
  router,
  tabId,
  children,
}: {
  navigation: TabNavigation;
  router: TabNavigation["router"];
  tabId: TabId | null;
  children: ReactNode;
}) {
  return (
    <AppRouterContext.Provider value={router}>
      <GlobalLayoutRouterContext.Provider value={navigation.globalLayoutRouter}>
        <LayoutRouterContext.Provider value={navigation.layoutRouter}>
          <PathnameContext.Provider value={navigation.pathname}>
            <SearchParamsContext.Provider value={navigation.searchParams}>
              <PathParamsContext.Provider value={navigation.params}>
                <NavigationPromisesContext.Provider value={navigation.promises}>
                  <TabSlotContext.Provider value={tabId}>{children}</TabSlotContext.Provider>
                </NavigationPromisesContext.Provider>
              </PathParamsContext.Provider>
            </SearchParamsContext.Provider>
          </PathnameContext.Provider>
        </LayoutRouterContext.Provider>
      </GlobalLayoutRouterContext.Provider>
    </AppRouterContext.Provider>
  );
}

/** A navigation a hidden page asked for; it runs when the page's tab is shown again. */
export type DeferredNavigation =
  | { readonly kind: "push" | "replace"; readonly href: string; readonly options?: NavigateOptions }
  | { readonly kind: "back" | "forward" };

/** Holds a hidden page's navigations (see `guard`). */
export interface NavigationGate {
  /** The slot is displayed (set from the slot's layout effect). */
  setShown(shown: boolean): void;
  /** The held navigation, if any; clears it. */
  take(): DeferredNavigation | null;
  /**
   * `router` for the slot's page. A hidden page's async work keeps running (a save that resolves
   * later, a timer that was already queued), and the app router only knows the live route, so a
   * push / replace / back from a hidden page would navigate whichever tab is on screen. While the
   * slot is hidden those calls are held instead (the latest wins); refresh and prefetch pass through.
   */
  guard(router: AppRouter): AppRouter;
}

export function createNavigationGate(shown: boolean): NavigationGate {
  let isShown = shown;
  let held: DeferredNavigation | null = null;
  const hold = (navigation: DeferredNavigation) => {
    held = navigation;
  };
  return {
    setShown(value) {
      isShown = value;
    },
    take() {
      const navigation = held;
      held = null;
      return navigation;
    },
    guard: (router) => ({
      ...router,
      push: (href, options) => (isShown ? router.push(href, options) : hold({ kind: "push", href, options })),
      replace: (href, options) => (isShown ? router.replace(href, options) : hold({ kind: "replace", href, options })),
      back: () => (isShown ? router.back() : hold({ kind: "back" })),
      forward: () => (isShown ? router.forward() : hold({ kind: "forward" })),
    }),
  };
}

/**
 * Runs a held navigation once its tab is shown. Back / forward go through the tab store: the
 * browser entry before the current one belongs to the tab that was on screen before.
 */
export function replayNavigation(navigation: DeferredNavigation, router: AppRouter): void {
  switch (navigation.kind) {
    case "push":
      router.push(navigation.href, navigation.options);
      return;
    case "replace":
      router.replace(navigation.href, navigation.options);
      return;
    case "back":
      if (tabsStore.isReady()) tabsStore.actions.goBack();
      else router.back();
      return;
    case "forward":
      if (tabsStore.isReady()) tabsStore.actions.goForward();
      else router.forward();
      return;
  }
}
