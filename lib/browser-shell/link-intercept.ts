import { canonicalizeUrl } from "./url";
import type { TabId, TabUrl } from "./types";

/*
 * Link interception (tab-state spec §10, plan D22). Capture-phase listeners on `document`
 * (dialogs and popovers portal to <body>) turn modified clicks on in-app links into tabs:
 *   Mod-click / middle-click → background tab
 *   Mod+Shift-click          → foreground tab
 *   Shift-click (Tauri only) → foreground tab; on the web the browser keeps plain Shift-click
 * Only `preventDefault` is called (never stopPropagation) so onClick side effects still run,
 * and Next's <Link> sees `defaultPrevented` and skips its own navigation.
 */

export interface LinkInterceptOptions {
  readonly isMac: boolean;
  readonly isTauri: boolean;
  /** Interception only happens while this returns true (the tab store is bound). */
  isEnabled(): boolean;
  getActiveTabId(): TabId | null;
  open(url: TabUrl, opts: { activate: boolean; openerTabId: TabId | null }): void;
  /** A plain left click on an in-app link that will navigate the current tab (tab spinner). */
  onPlainNavigate?(url: TabUrl): void;
}

type LinkElement = HTMLAnchorElement | SVGAElement;

function findLink(event: MouseEvent): LinkElement | null {
  for (const node of event.composedPath()) {
    if (typeof HTMLAnchorElement !== "undefined" && node instanceof HTMLAnchorElement) return node;
    if (typeof SVGAElement !== "undefined" && node instanceof SVGAElement) return node;
  }
  return null;
}

function hrefOf(link: LinkElement): string {
  if (typeof SVGAElement !== "undefined" && link instanceof SVGAElement) return link.href.baseVal;
  return (link as HTMLAnchorElement).href;
}

/** What a click on an in-app link should do, or null when the browser keeps it. */
export function classifyLinkClick(
  event: { button: number; isAux: boolean; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  env: { isMac: boolean; isTauri: boolean },
): "plain" | "background" | "foreground" | null {
  const middle = event.isAux && event.button === 1;
  const plainLeft = !event.isAux && event.button === 0;
  if (!middle && !plainLeft) return null;
  // Alt+click downloads in Chrome; macOS Ctrl+click opens the context menu.
  if (event.altKey || (env.isMac && event.ctrlKey)) return null;
  if (middle) return "background";
  const mod = env.isMac ? event.metaKey : event.ctrlKey;
  if (mod) return event.shiftKey ? "foreground" : "background";
  if (event.shiftKey) return env.isTauri ? "foreground" : null;
  if (event.metaKey || event.ctrlKey) return null;
  return "plain";
}

/** Installs the click / auxclick interceptors; returns the uninstall function. */
export function installLinkInterceptor(opts: LinkInterceptOptions): () => void {
  if (typeof document === "undefined") return () => {};

  const handle = (event: MouseEvent, isAux: boolean) => {
    if (event.defaultPrevented || !opts.isEnabled()) return;
    const kind = classifyLinkClick(
      { button: event.button, isAux, metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey },
      opts,
    );
    if (!kind) return;
    const link = findLink(event);
    if (!link) return;
    const href = hrefOf(link);
    if (!href || link.hasAttribute("download")) return;
    const target = link.getAttribute("target");
    if (target && target !== "_self") return;
    if (link.closest("[data-shell-intercept='off']")) return;
    const canonical = canonicalizeUrl(href);
    if (!canonical || !canonical.tabbable) return; // external, /login, /store… → browser default

    if (kind === "plain") {
      const here = canonicalizeUrl(window.location.href);
      if (here?.key !== canonical.key) opts.onPlainNavigate?.(canonical.url);
      return;
    }
    event.preventDefault();
    opts.open(canonical.url, { activate: kind === "foreground", openerTabId: opts.getActiveTabId() });
  };

  const onClick = (event: MouseEvent) => handle(event, false);
  const onAuxClick = (event: MouseEvent) => handle(event, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("auxclick", onAuxClick, true);
  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("auxclick", onAuxClick, true);
  };
}
