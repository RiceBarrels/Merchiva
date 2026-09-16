import { useSyncExternalStore } from "react";
import type { ShellLayout } from "./types";

/**
 * DOM signal for components that render outside the shell's React providers
 * (NativeTitleBar sits above the providers in app/layout.tsx, the offline
 * indicator styles itself with a `html[data-browser-shell]` selector).
 */
export const BROWSER_SHELL_EVENT = "merchiva:browser-shell-change";

/**
 * Dispatch on `window` when signing out; the browser shell then purges its persisted tab state
 * (lib/browser-shell/sign-out.ts). Defined here, not in sign-out.ts, so lib/auth can import it
 * without pulling in the tab store (store → browsing-history → lib/auth would be a cycle).
 */
export const SHELL_SIGN_OUT_EVENT = "merchiva:sign-out";

const ATTR = "data-browser-shell";
let markToken = 0;

function isShellLayout(value: string | null): value is ShellLayout {
  return value === "desktop" || value === "mobile";
}

function notify(): void {
  window.dispatchEvent(new Event(BROWSER_SHELL_EVENT));
}

/** Current `<html data-browser-shell>` value, or null when no browser shell is mounted. */
export function readMountedBrowserShell(): ShellLayout | null {
  if (typeof document === "undefined") return null;
  const value = document.documentElement.getAttribute(ATTR);
  return isShellLayout(value) ? value : null;
}

/**
 * Core-internal (called by BrowserShellProvider in a layout effect). Sets
 * `<html data-browser-shell=layout>` and dispatches BROWSER_SHELL_EVENT. The
 * returned cleanup only removes the attribute if no newer mark replaced it.
 */
export function markBrowserShellMounted(layout: ShellLayout): () => void {
  if (typeof document === "undefined") return () => {};
  const token = ++markToken;
  document.documentElement.setAttribute(ATTR, layout);
  notify();
  return () => {
    if (token !== markToken) return;
    document.documentElement.removeAttribute(ATTR);
    notify();
  };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(BROWSER_SHELL_EVENT, onChange);
  return () => window.removeEventListener(BROWSER_SHELL_EVENT, onChange);
}

/** Which browser shell layout is mounted, if any. Server snapshot: null. */
export function useMountedBrowserShell(): ShellLayout | null {
  return useSyncExternalStore(subscribe, readMountedBrowserShell, () => null);
}

/**
 * Closes the topmost DynamicUIElement dialog through its own DOM contract, so
 * components/ui/dynamic-ui-element.tsx needs no edit (plan §B1.6). Returns true if one closed.
 * Lives here (not in dialogs.ts) so the tab store can use it without importing React UI.
 */
export function closeTopDialog(): boolean {
  if (typeof document === "undefined") return false;
  const n = document.querySelectorAll('[id^="mobile-dialog-"]').length
    || (new URLSearchParams(location.search).has("dialogs") ? 1 : 0);
  if (n <= 0) return false;
  const top = document.getElementById(`mobile-dialog-${n - 1}`);           // mobile page variant (<640px)
  const back = top?.querySelector<HTMLButtonElement>("[data-dialog-back]");  // dynamic-ui-element.tsx:538-545
  if (back) { back.click(); return true; }
  const closes = document.querySelectorAll<HTMLElement>('[data-slot="dialog-close"]'); // :202-205, :655, :707
  const last = closes[closes.length - 1];
  if (last) { last.click(); return true; }
  return false;
}
