import { isCapacitorNative } from "@/lib/capacitor";
import { isEditableElement } from "./keyboard";
import { runShellBackHandlers } from "./shell-context";
import { closeTopDialog, inHiddenSubtree } from "./shell-dom";

/*
 * Android hardware back (plan D29, mobile-safari spec §19). Registering a Capacitor
 * `backButton` listener replaces the WebView's default history behaviour, so the shell owns
 * the whole chain, stopping at the first step that applies:
 *   1. a foreign overlay (vaul drawer, alert dialog, Base UI popup) → Escape
 *   2. a shell overlay registered with useShellBackHandler
 *   3. the top DynamicUIElement dialog
 *   4. blur a focused text field (hides the keyboard)
 *   5. tab history back
 *   6. close the tab back to its opener
 *   7. minimize the app
 */

const REPEAT_GUARD_MS = 350;

/** Time an overlay gets to close after the dispatched Escape before it counts as ignoring it. */
export const FOREIGN_OVERLAY_SETTLE_MS = 400;

export const FOREIGN_OVERLAY_SELECTOR = [
  // vaul's Drawer.Content is a Radix Dialog content, so its open state is Radix's data-state
  // (data-vaul-drawer-visible only exists on Drawer.Handle, which never carries data-vaul-drawer).
  '[data-vaul-drawer][data-state="open"]:not([data-shell-sheet])',
  '[data-slot="alert-dialog-content"][data-open]',
  '[data-slot="popover-content"][data-open]',
  // Base UI Popover popups (components/ui/popover.tsx sets no data-slot): useRole gives the popup
  // role="dialog" and the positioner state adds data-side. Dialog popups have no side; menus,
  // listboxes and tooltips have other roles.
  '[role="dialog"][data-side][data-open]',
  '[data-slot="select-content"][data-open]',
  '[data-slot="dropdown-menu-content"][data-open]',
  '[data-slot="context-menu-content"][data-open]',
  '[data-slot="combobox-content"][data-open]',
].join(", ");

export interface AndroidBackHandlers {
  canGoBack(): boolean;
  goBack(): void;
  /** Closes the active tab when it has a live opener and never navigated; true if it did. */
  closeToOpener(): boolean;
}

function isAndroid(): boolean {
  if (!isCapacitorNative()) return false;
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    return cap?.getPlatform?.() === "android";
  } catch {
    return false;
  }
}

/** The overlay still open FOREIGN_OVERLAY_SETTLE_MS after our Escape. */
let ignoredEscape: Element | null = null;
let settleTimer: ReturnType<typeof setTimeout> | undefined;

function topForeignOverlay(): Element | null {
  try {
    // Overlays of kept-alive background tabs stay in the document, hidden: skip them.
    const open = Array.from(document.querySelectorAll(FOREIGN_OVERLAY_SELECTOR)).filter((el) => !inHiddenSubtree(el));
    // Overlays portal to the end of <body>: the last match in document order is the topmost.
    return open.length > 0 ? open[open.length - 1] : null;
  } catch {
    return null;
  }
}

function closeForeignOverlay(): boolean {
  const open = topForeignOverlay();
  if (!open) {
    ignoredEscape = null;
    return false;
  }
  if (open === ignoredEscape) {
    // It ignored the last Escape (no Escape dismissal, or something swallowed the key). Let this
    // press continue down the chain instead of trapping back; the next press tries Escape again.
    ignoredEscape = null;
    return false;
  }
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  if (settleTimer !== undefined) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    settleTimer = undefined;
    let stillOpen = false;
    try {
      stillOpen = open.isConnected && open.matches(FOREIGN_OVERLAY_SELECTOR);
    } catch {
      stillOpen = false;
    }
    ignoredEscape = stillOpen ? open : null;
  }, FOREIGN_OVERLAY_SETTLE_MS);
  return true;
}

/** Runs one back press through the chain (exported for the provider's shared handling). */
export function handleShellBack(handlers: AndroidBackHandlers): "handled" | "minimize" {
  if (closeForeignOverlay()) return "handled";
  if (runShellBackHandlers()) return "handled";
  if (closeTopDialog()) return "handled";
  const active = document.activeElement;
  if (isEditableElement(active)) {
    (active as HTMLElement).blur();
    return "handled";
  }
  if (handlers.canGoBack()) {
    handlers.goBack();
    return "handled";
  }
  if (handlers.closeToOpener()) return "handled";
  return "minimize";
}

/** Installs the Capacitor Android back listener (no-op elsewhere); returns uninstall. */
export function installAndroidBack(handlers: AndroidBackHandlers): () => void {
  if (typeof window === "undefined" || !isAndroid()) return () => {};
  let disposed = false;
  let handle: { remove: () => Promise<void> } | null = null;
  let last = 0;

  const onBack = () => {
    const now = Date.now();
    if (now - last < REPEAT_GUARD_MS) return;
    last = now;
    if (handleShellBack(handlers) === "minimize") {
      import("@capacitor/app")
        .then(({ App }) => App.minimizeApp())
        .catch(() => {
          // Plugin unavailable: nothing else to do.
        });
    }
  };

  import("@capacitor/app")
    .then(async ({ App }) => {
      if (disposed) return;
      const registered = await App.addListener("backButton", onBack);
      if (disposed) {
        registered.remove().catch(() => {});
        return;
      }
      handle = registered;
    })
    .catch(() => {
      // Plugin unavailable (web build inside a native wrapper): default back behaviour stays.
    });

  return () => {
    disposed = true;
    handle?.remove().catch(() => {});
    handle = null;
  };
}
