import { useCallback, useEffect, useRef } from "react";
import type { AppIcon } from "@/components/device/app-icons";
import { canonicalizeUrl } from "./url";
import type { TabUrl } from "./types";

/*
 * The shell context menu: one right-click menu for everything under /manager, replacing the
 * browser's own. This file is the model — what a right-click landed on and which items the
 * page contributed — with no React rendering; components/browser-shell/shared/shell-context-menu.tsx
 * draws it.
 *
 * Precedence. The interceptor listens on `window`, in the bubble phase, and skips any event
 * whose default is already prevented. Every menu that owns its own patch of the UI already
 * calls preventDefault there — Base UI's ContextMenu.Trigger (tab strip, bookmarks bar, chat
 * messages) and the hand-rolled handler in app/manager/channel/page.tsx — so those keep their
 * menus with no edit, and this one fills in the rest of the page. `window` (not `document`) is
 * deliberate: Base UI's trigger marks the event from a `document` listener, and listeners on
 * `window` always run after it, whatever the mount order was.
 *
 * Opting out. `data-shell-context-menu="off"` on any ancestor hands the native menu back for
 * that subtree, mirroring `data-shell-intercept="off"` in link-intercept.ts. The menu's own popup
 * carries the attribute, so right-clicking a menu row does not reopen the menu on top of itself.
 *
 * Touch is not intercepted: a long press still selects text and opens the platform menu.
 */

/** `data-shell-context-menu="off"` restores the browser's own menu for a subtree. */
const OPT_OUT_SELECTOR = "[data-shell-context-menu='off']";

/** Custom items are capped so a deeply nested registration can't produce an endless menu. */
const MAX_CUSTOM_ITEMS = 12;

const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "checkbox", "radio", "range", "button", "submit", "reset", "file", "color", "image", "hidden",
]);

/** An item a page contributes for one element (a row, a card, a button). */
export interface ShellContextMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: AppIcon;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  /** Rendered at the end of the row, e.g. "⌘C". Purely a label — nothing is bound. */
  readonly shortcut?: string;
  onSelect(): void;
}

/** A link the right-click landed on. `inApp` is the canonical tab URL, or null when external. */
export interface ShellContextLink {
  readonly href: string;
  readonly text: string;
  readonly inApp: TabUrl | null;
}

export interface ShellContextImage {
  readonly src: string;
  readonly alt: string;
}

/** A text field the right-click landed in, with what the edit items may do to it. */
export interface ShellContextEditable {
  readonly element: HTMLElement;
  /** False for readonly / disabled fields: copy and select-all stay, cut and paste go. */
  readonly writable: boolean;
  readonly hasSelection: boolean;
  readonly hasContent: boolean;
  /** Password fields never offer copy or cut. */
  readonly masked: boolean;
}

/** Everything one right-click resolved to. Each part is independent — a link can be selected. */
export interface ShellContextHit {
  readonly x: number;
  readonly y: number;
  /** Contributed items, nearest registered ancestor first. */
  readonly custom: readonly ShellContextMenuItem[];
  readonly link: ShellContextLink | null;
  readonly image: ShellContextImage | null;
  readonly editable: ShellContextEditable | null;
  /** Selected text the click landed inside, outside of a text field. */
  readonly selection: string | null;
}

// ─── Registry ────────────────────────────────────────────────────────────────

/*
 * Elements register a builder rather than a fixed list so a row can read its own current state
 * when the menu opens, not when it rendered. A WeakMap keeps a detached node from pinning its
 * closure: an element that leaves the document is collected with its entry.
 */
type ItemBuilder = () => readonly ShellContextMenuItem[] | null;

const providers = new WeakMap<Element, ItemBuilder>();

/** Binds items to an element from non-React code. Returns the unregister function. */
export function registerContextMenuTarget(el: Element, build: ItemBuilder): () => void {
  providers.set(el, build);
  return () => {
    if (providers.get(el) === build) providers.delete(el);
  };
}

/**
 * Contributes context-menu items for the element this ref lands on:
 *
 * ```tsx
 * const menuRef = useContextMenuTarget(() => [
 *   { id: "edit", label: t("inventory.edit"), onSelect: () => setEditing(item.id) },
 * ]);
 * return <tr ref={menuRef}>…</tr>;
 * ```
 *
 * The builder runs when the menu opens, so it may close over fresh state; it is read through a
 * ref, so passing a new closure every render neither re-registers nor re-renders anything.
 * Nested registrations stack: a row inside a registered table shows the row's items first.
 * `null` contributes nothing, which is how an item set is conditionally withheld.
 */
export function useContextMenuTarget<T extends HTMLElement>(build: ItemBuilder): (node: T | null) => void {
  // The builder is read through a ref (the shape shell-context.tsx uses) so a fresh closure on
  // every render neither re-registers the element nor invalidates the returned callback.
  const latest = useRef(build);
  useEffect(() => {
    latest.current = build;
  });
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((node: T | null) => {
    cleanup.current?.();
    cleanup.current = node ? registerContextMenuTarget(node, () => latest.current()) : null;
  }, []);
}

/** Items from every registered ancestor of `el`, nearest first, capped at MAX_CUSTOM_ITEMS. */
function collectCustomItems(el: Element | null): readonly ShellContextMenuItem[] {
  const out: ShellContextMenuItem[] = [];
  const seen = new Set<string>();
  for (let node: Element | null = el; node && out.length < MAX_CUSTOM_ITEMS; node = node.parentElement) {
    const build = providers.get(node);
    if (!build) continue;
    let items: readonly ShellContextMenuItem[] | null;
    try {
      items = build();
    } catch {
      continue; // A throwing builder must not cost the user their whole menu.
    }
    if (!items) continue;
    for (const item of items) {
      if (out.length >= MAX_CUSTOM_ITEMS) break;
      // Nearest registration wins an id, so a row can override its table's entry.
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

// ─── Resolving a click ───────────────────────────────────────────────────────

function findLink(el: Element | null): HTMLAnchorElement | SVGAElement | null {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (typeof HTMLAnchorElement !== "undefined" && node instanceof HTMLAnchorElement) return node;
    if (typeof SVGAElement !== "undefined" && node instanceof SVGAElement) return node;
  }
  return null;
}

function hrefOf(link: HTMLAnchorElement | SVGAElement): string {
  if (typeof SVGAElement !== "undefined" && link instanceof SVGAElement) return link.href.baseVal;
  return (link as HTMLAnchorElement).href;
}

function resolveLink(el: Element | null): ShellContextLink | null {
  const link = findLink(el);
  if (!link) return null;
  const href = hrefOf(link);
  if (!href || href.startsWith("javascript:")) return null;
  const canonical = canonicalizeUrl(href);
  return {
    href,
    text: (link.textContent ?? "").replace(/\s+/g, " ").trim(),
    inApp: canonical?.tabbable ? canonical.url : null,
  };
}

function resolveImage(el: Element | null): ShellContextImage | null {
  if (typeof HTMLImageElement === "undefined" || !(el instanceof HTMLImageElement)) return null;
  // currentSrc resolves srcset / sizes to what the browser actually painted.
  const src = el.currentSrc || el.src;
  return src ? { src, alt: el.alt ?? "" } : null;
}

/** The text field `el` sits in — an input, a textarea, or a contenteditable host. */
export function findEditableHost(el: Element | null): HTMLElement | null {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (typeof HTMLTextAreaElement !== "undefined" && node instanceof HTMLTextAreaElement) return node;
    if (typeof HTMLInputElement !== "undefined" && node instanceof HTMLInputElement) {
      return NON_TEXT_INPUT_TYPES.has(node.type) ? null : node;
    }
    if (typeof HTMLElement !== "undefined" && node instanceof HTMLElement && node.isContentEditable) return node;
  }
  return null;
}

function resolveEditable(el: Element | null): ShellContextEditable | null {
  const host = findEditableHost(el);
  if (!host) return null;
  if (host instanceof HTMLInputElement || host instanceof HTMLTextAreaElement) {
    const { selectionStart, selectionEnd } = host;
    return {
      element: host,
      writable: !host.readOnly && !host.disabled,
      hasSelection: selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd,
      hasContent: host.value.length > 0,
      masked: host instanceof HTMLInputElement && host.type === "password",
    };
  }
  const selection = typeof window !== "undefined" ? window.getSelection() : null;
  const inHost = !!selection && !selection.isCollapsed && selection.rangeCount > 0 && selection.containsNode(host, true);
  return {
    element: host,
    writable: true,
    hasSelection: inHost,
    hasContent: (host.textContent ?? "").length > 0,
    masked: false,
  };
}

/** Selected text, but only when the click landed inside the selection (Chrome's rule). */
function resolveSelection(target: Node | null): string | null {
  if (typeof window === "undefined" || !target) return null;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  let inside = false;
  try {
    inside = selection.containsNode(target, true);
  } catch {
    return null; // containsNode throws on a detached node.
  }
  if (!inside) return null;
  const text = selection.toString().trim();
  return text.length > 0 ? text : null;
}

/**
 * Where the menu should open. The ContextMenu key and Shift+F10 fire a `contextmenu` event with
 * no pointer behind it, which browsers report at (0, 0) or thereabouts; anchoring to the focused
 * element instead puts the menu where the user is looking rather than in the window corner.
 */
function menuPosition(event: MouseEvent, target: Element | null): { x: number; y: number } {
  if (event.clientX > 0 || event.clientY > 0) return { x: event.clientX, y: event.clientY };
  const rect = typeof target?.getBoundingClientRect === "function" ? target.getBoundingClientRect() : null;
  if (!rect || (rect.width === 0 && rect.height === 0)) return { x: event.clientX, y: event.clientY };
  return { x: rect.left, y: rect.bottom };
}

/**
 * What a `contextmenu` event landed on, or null when the shell must leave it to the browser
 * (already handled by a nearer menu, or inside an opted-out subtree).
 */
export function resolveContextHit(event: MouseEvent): ShellContextHit | null {
  if (event.defaultPrevented) return null;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(OPT_OUT_SELECTOR)) return null;
  const editable = resolveEditable(target);
  const { x, y } = menuPosition(event, target);
  return {
    x,
    y,
    custom: collectCustomItems(target),
    link: resolveLink(target),
    image: resolveImage(target),
    editable,
    // A selection inside a text field is the editable group's business, not the page group's.
    selection: editable ? null : resolveSelection(target),
  };
}

/**
 * Installs the `window` contextmenu listener; returns the uninstall function. `onHit` receives
 * every click the shell takes over — the event is already default-prevented by then.
 */
export function installContextMenuInterceptor(onHit: (hit: ShellContextHit) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handle = (event: MouseEvent) => {
    const hit = resolveContextHit(event);
    if (!hit) return;
    event.preventDefault();
    onHit(hit);
  };
  window.addEventListener("contextmenu", handle);
  return () => window.removeEventListener("contextmenu", handle);
}
