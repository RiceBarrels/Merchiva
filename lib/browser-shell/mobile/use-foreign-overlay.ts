import { useCallback, useSyncExternalStore } from "react";

/**
 * Overlays that are not the shell's own sheets but can open on top of a DynamicUIElement page:
 * vaul drawers (z-50), alert dialogs (z-50), Base UI select / context / dropdown menu popups
 * (z-50) and the in-flow Combobox list (z-50 inside the page). The raised mobile chrome (z 50 + N)
 * would cover them, so it slides away while one is open (mobile-safari spec §16.3, plan D28).
 * Shell sheets carry `data-shell-sheet` and are excluded.
 *
 * vaul's `Drawer.Content` is a Radix Dialog content: its open state is Radix's `data-state`.
 * (`data-vaul-drawer-visible` only exists on `Drawer.Handle`, which never carries
 * `data-vaul-drawer`.)
 */
export const FOREIGN_OVERLAY_SELECTOR = [
  '[data-vaul-drawer][data-state="open"]:not([data-shell-sheet])',
  '[data-slot="alert-dialog-content"][data-open]',
  '[data-slot="select-content"][data-open]',
  '[data-slot="context-menu-content"][data-open]',
  '[data-slot="dropdown-menu-content"][data-open]',
  '[data-slot="combobox-content"][data-open]',
].join(", ");

/** Attributes whose changes can open or close one of the overlays above. */
export const FOREIGN_OVERLAY_ATTRIBUTES: readonly string[] = ["data-state", "data-open", "data-closed"];

function readForeignOverlay(): boolean {
  try {
    return document.querySelector(FOREIGN_OVERLAY_SELECTOR) !== null;
  } catch {
    return false;
  }
}

/**
 * True while a foreign overlay is open. Observes the DOM only while `enabled` (the chrome
 * enables it while dialogs are open, since without a dialog it already sits under every overlay).
 */
export function useForeignOverlayOpen(enabled: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!enabled || typeof MutationObserver === "undefined" || typeof document === "undefined") return () => {};
      let frame = 0;
      const schedule = () => {
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          onChange();
        });
      };
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [...FOREIGN_OVERLAY_ATTRIBUTES],
      });
      schedule();
      return () => {
        observer.disconnect();
        if (frame) window.cancelAnimationFrame(frame);
      };
    },
    [enabled],
  );

  const getSnapshot = useCallback(() => (enabled ? readForeignOverlay() : false), [enabled]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
