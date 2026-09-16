"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  SHELL_MOBILE_BREAKPOINT,
  type PageAction,
  type ShellChromeRequest,
  type ShellCommand,
  type ShellInfo,
  type ShellLayout,
} from "./types";

/*
 * Lightweight shell context. Deliberately imports nothing from the tab store or
 * the route registry: components/page-header.tsx and personnel/hub-nav.tsx
 * import this file directly so /store and /personal bundles stay small.
 *
 * Registries (chrome requests, command handlers, back handlers, page actions)
 * are module-level so plain functions (emitShellCommand, runShellBackHandlers)
 * work from non-React code such as the shortcut and Android back handlers.
 * Only one browser shell is ever mounted, so a single registry is enough.
 * Every registering hook is a no-op without a ShellInfoProvider (plan §B1.5).
 */

// ─── Tiny signal ─────────────────────────────────────────────────────────────

interface Signal {
  subscribe(listener: () => void): () => void;
  emit(): void;
}

function createSignal(): Signal {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit() {
      for (const listener of Array.from(listeners)) listener();
    },
  };
}

/** Keeps the latest callback in a ref without re-registering on every render. */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

// ─── ShellInfo ───────────────────────────────────────────────────────────────

const ShellInfoContext = createContext<ShellInfo | null>(null);

/** Core-internal: rendered by BrowserShellProvider. */
export function ShellInfoProvider({ value, children }: { value: ShellInfo; children: ReactNode }) {
  return <ShellInfoContext.Provider value={value}>{children}</ShellInfoContext.Provider>;
}

/** `null` outside the browser shell (legacy MobileShell, /store, /personal, device app catalog). */
export function useShellInfo(): ShellInfo | null {
  return useContext(ShellInfoContext);
}

/** The single layout breakpoint (plan D2): below 1024px → "mobile", otherwise "desktop". */
export function useShellLayoutQuery(): ShellLayout {
  return useIsMobile(SHELL_MOBILE_BREAKPOINT) ? "mobile" : "desktop";
}

// ─── Chrome requests ─────────────────────────────────────────────────────────

type MobileChromeMode = "overlay" | "docked";

export interface ShellChromeState {
  immersive: boolean;
  mobileChrome: MobileChromeMode;
}

const DEFAULT_CHROME_STATE: ShellChromeState = Object.freeze({ immersive: false, mobileChrome: "overlay" });

const chromeRequests = new Map<symbol, ShellChromeRequest>();
const chromeSignal = createSignal();
let routeChromeDefault: MobileChromeMode = "overlay";
let chromeState: ShellChromeState = DEFAULT_CHROME_STATE;

function recomputeChromeState(): void {
  let immersive = false;
  let docked = false;
  let overlay = false;
  for (const request of chromeRequests.values()) {
    if (request.immersive) immersive = true;
    if (request.mobileChrome === "docked") docked = true;
    else if (request.mobileChrome === "overlay") overlay = true;
  }
  // An explicit page request beats the route registry default; "docked" wins ties.
  const mobileChrome: MobileChromeMode = docked ? "docked" : overlay ? "overlay" : routeChromeDefault;
  if (immersive === chromeState.immersive && mobileChrome === chromeState.mobileChrome) return;
  chromeState = immersive || mobileChrome !== "overlay" ? { immersive, mobileChrome } : DEFAULT_CHROME_STATE;
  chromeSignal.emit();
}

/**
 * Core-internal: the active route's `RouteDef.mobileChrome` (default "overlay").
 * Set by BrowserShellProvider whenever the rendered route changes.
 */
export function setRouteChromeDefault(mode: MobileChromeMode): void {
  if (routeChromeDefault === mode) return;
  routeChromeDefault = mode;
  recomputeChromeState();
}

/**
 * Page request for chrome behaviour (docs editor: immersive while editing, docked chrome).
 * Merge: immersive = OR; mobileChrome = "docked" if any request docks, else "overlay" if any
 * request asks for it, else the route default. Removed on unmount. `null` registers nothing.
 */
export function useShellChrome(req: ShellChromeRequest | null): void {
  const active = useContext(ShellInfoContext) !== null && req !== null;
  const [token] = useState(() => Symbol("shell-chrome"));
  const immersive = req?.immersive;
  const mobileChrome = req?.mobileChrome;
  useEffect(() => {
    if (!active) return;
    chromeRequests.set(token, { immersive, mobileChrome });
    recomputeChromeState();
    return () => {
      chromeRequests.delete(token);
      recomputeChromeState();
    };
  }, [active, token, immersive, mobileChrome]);
}

function getChromeState(): ShellChromeState {
  return chromeState;
}

function getServerChromeState(): ShellChromeState {
  return DEFAULT_CHROME_STATE;
}

/** Merged chrome requests, read by the chromes. */
export function useShellChromeState(): { immersive: boolean; mobileChrome: "overlay" | "docked" } {
  return useSyncExternalStore(chromeSignal.subscribe, getChromeState, getServerChromeState);
}

// ─── Command bus ─────────────────────────────────────────────────────────────

const commandHandlers = new Map<ShellCommand, Array<{ readonly run: () => void }>>();

/** Runs every handler registered for `cmd` (the chrome owns focusOmnibox / showTabOverview / toggleBookmarksBar). */
export function emitShellCommand(cmd: ShellCommand): void {
  const handlers = commandHandlers.get(cmd);
  if (!handlers || handlers.length === 0) return;
  for (const handler of handlers.slice()) handler.run();
}

/**
 * Whether any handler would run for `cmd` right now. The shortcut installer asks before
 * swallowing a key: `toggleSidebar` and `toggleBookmarksBar` are desktop-chrome commands, so
 * below the 1024px breakpoint (and in the legacy shell) nothing is registered and the key must
 * stay the browser's — Alt+letter is the access-key modifier in Firefox on Windows and Linux.
 */
export function hasShellCommandHandler(cmd: ShellCommand): boolean {
  return (commandHandlers.get(cmd)?.length ?? 0) > 0;
}

/**
 * Core-internal: registers a command handler outside React (BrowserShellProvider's tab-command
 * executor, so `emitShellCommand("newTab")` from a chrome menu runs the tab action).
 */
export function registerShellCommandHandler(cmd: ShellCommand, handler: () => void): () => void {
  const entry = { run: handler };
  const list = commandHandlers.get(cmd) ?? [];
  list.push(entry);
  commandHandlers.set(cmd, list);
  return () => {
    const current = commandHandlers.get(cmd);
    if (!current) return;
    const index = current.indexOf(entry);
    if (index >= 0) current.splice(index, 1);
    if (current.length === 0) commandHandlers.delete(cmd);
  };
}

/** Subscribes to a shell command while mounted inside the browser shell. */
export function useShellCommand(cmd: ShellCommand, handler: () => void): void {
  const active = useContext(ShellInfoContext) !== null;
  const latest = useLatest(handler);
  useEffect(() => {
    if (!active) return;
    const entry = { run: () => latest.current() };
    const list = commandHandlers.get(cmd) ?? [];
    list.push(entry);
    commandHandlers.set(cmd, list);
    return () => {
      const current = commandHandlers.get(cmd);
      if (!current) return;
      const index = current.indexOf(entry);
      if (index >= 0) current.splice(index, 1);
      if (current.length === 0) commandHandlers.delete(cmd);
    };
  }, [active, cmd, latest]);
}

// ─── Back handlers (LIFO) ────────────────────────────────────────────────────

const backHandlers: Array<{ readonly run: () => boolean }> = [];

/** Offers a back press to chrome overlays, newest first. Returns true if one handled it. */
export function runShellBackHandlers(): boolean {
  for (let i = backHandlers.length - 1; i >= 0; i--) {
    if (backHandlers[i].run()) return true;
  }
  return false;
}

/**
 * Registers an overlay back handler (tab overview, omnibox, sheets). The handler
 * returns true when it consumed the back press. Enabling pushes it on top.
 */
export function useShellBackHandler(handler: () => boolean, enabled: boolean = true): void {
  const active = useContext(ShellInfoContext) !== null && enabled;
  const latest = useLatest(handler);
  useEffect(() => {
    if (!active) return;
    const entry = { run: () => latest.current() };
    backHandlers.push(entry);
    return () => {
      const index = backHandlers.indexOf(entry);
      if (index >= 0) backHandlers.splice(index, 1);
    };
  }, [active, latest]);
}

// ─── Page actions ────────────────────────────────────────────────────────────

const EMPTY_PAGE_ACTIONS: readonly PageAction[] = Object.freeze([]);
const pageActionRegistrations = new Map<symbol, readonly PageAction[]>();
const pageActionsSignal = createSignal();
let pageActionsSnapshot: readonly PageAction[] = EMPTY_PAGE_ACTIONS;
let pageActionOwners: readonly symbol[] = [];
let pageActionsRebuildQueued = false;

function rebuildPageActions(): void {
  pageActionsRebuildQueued = false;
  const next: PageAction[] = [];
  const owners: symbol[] = [];
  for (const [token, actions] of pageActionRegistrations) {
    for (const action of actions) {
      const id = action.id;
      next.push({
        id,
        label: action.label,
        icon: action.icon,
        // Always calls the latest registered callback, so pages may pass fresh closures.
        onSelect: () => {
          pageActionRegistrations.get(token)?.find((candidate) => candidate.id === id)?.onSelect();
        },
      });
      owners.push(token);
    }
  }
  const unchanged =
    next.length === pageActionsSnapshot.length &&
    next.every((action, i) => {
      const prev = pageActionsSnapshot[i];
      return prev.id === action.id && prev.label === action.label && prev.icon === action.icon && pageActionOwners[i] === owners[i];
    });
  if (unchanged) return;
  pageActionsSnapshot = next.length > 0 ? next : EMPTY_PAGE_ACTIONS;
  pageActionOwners = owners;
  pageActionsSignal.emit();
}

function queuePageActionsRebuild(): void {
  if (pageActionsRebuildQueued) return;
  pageActionsRebuildQueued = true;
  queueMicrotask(rebuildPageActions);
}

/** Pages register menu items for the mobile page menu (Share, Comments, Outline …). `null` registers nothing. */
export function useRegisterPageActions(actions: readonly PageAction[] | null): void {
  const active = useContext(ShellInfoContext) !== null;
  const [token] = useState(() => Symbol("page-actions"));
  useEffect(() => {
    if (!active || !actions) return;
    pageActionRegistrations.set(token, actions);
    queuePageActionsRebuild();
    return () => {
      pageActionRegistrations.delete(token);
      queuePageActionsRebuild();
    };
  }, [active, token, actions]);
}

function getPageActions(): readonly PageAction[] {
  return pageActionsSnapshot;
}

function getServerPageActions(): readonly PageAction[] {
  return EMPTY_PAGE_ACTIONS;
}

/** Page actions registered by the rendered page. */
export function usePageActions(): readonly PageAction[] {
  return useSyncExternalStore(pageActionsSignal.subscribe, getPageActions, getServerPageActions);
}
