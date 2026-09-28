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
 * True when `el` sits in a subtree React is hiding: a hidden <Activity> (a background tab's
 * keep-alive page, its portals included) or a suspended Suspense boundary. React hides those
 * with an inline `display: none !important` on the subtree's top host nodes, which is what this
 * looks for. Such elements stay in the document, so global lookups must skip them.
 */
export function inHiddenSubtree(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement ?? null) {
    const style = (node as Partial<HTMLElement>).style;
    if (style?.getPropertyValue?.("display") === "none" && style.getPropertyPriority?.("display") === "important") return true;
  }
  return false;
}

/** DynamicUIElement's on-screen `mobile-dialog-N` pages (its mobile variant, <640px). */
function shownDialogPages(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[id^="mobile-dialog-"]')).filter((el) => !inHiddenSubtree(el));
}

/**
 * The on-screen `mobile-dialog-${depth}` page. A kept-alive background tab keeps its open dialogs
 * in the document, hidden, and their ids repeat the on-screen ones, so a plain getElementById can
 * return the hidden copy.
 */
export function displayedDialogPage(depth: number): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return shownDialogPages().find((el) => el.id === `mobile-dialog-${depth}`) ?? null;
}

/** The topmost on-screen dialog's close button (`[data-slot="dialog-close"]`, dynamic-ui-element.tsx:82, :654, :706). */
export function lastShownDialogClose(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const closes = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="dialog-close"]')).filter((el) => !inHiddenSubtree(el));
  return closes[closes.length - 1] ?? null;
}

/**
 * Closes the topmost DynamicUIElement dialog through its own DOM contract, so
 * components/ui/dynamic-ui-element.tsx needs no edit (plan §B1.6). Returns true if one closed.
 * Dialogs of kept-alive background tabs stay in the document, hidden: they are ignored.
 * Lives here (not in dialogs.ts) so the tab store can use it without importing React UI.
 */
export function closeTopDialog(): boolean {
  if (typeof document === "undefined") return false;
  const n = shownDialogPages().length || (new URLSearchParams(location.search).has("dialogs") ? 1 : 0);
  if (n <= 0) return false;
  const back = displayedDialogPage(n - 1)?.querySelector<HTMLButtonElement>("[data-dialog-back]"); // dynamic-ui-element.tsx:537-544
  if (back) { back.click(); return true; }
  const last = lastShownDialogClose();
  if (last) { last.click(); return true; }
  return false;
}
