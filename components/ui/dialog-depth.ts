import * as React from "react";

/*
 * Stacking depth of the open DynamicUIElement dialogs (components/ui/dynamic-ui-element.tsx):
 * the page at depth N is `mobile-dialog-N`, sits at z-index 50 + N and pushes depth N - 1 aside
 * (depth 0 pushes the app shell).
 *
 * A dialog's depth is its rank, in the order the dialogs opened, among the dialogs shown now.
 * Counting layout effects as they run would follow effect order instead, and React runs the
 * layout effects of a subtree that is shown again (a kept-alive browser tab's <Activity>, see
 * components/browser-shell/core/tab-slot.tsx) children first: a nested dialog would take the
 * depth of the dialog it was opened from and end up under it. A hidden tab's dialogs leave the
 * stack (their layout effects are cleaned up) and keep their place in the open order.
 */

export interface DialogStackEntry {
  /** Place in the open order, taken on the first registration (0 before). */
  seq: number;
  /** Depth last given to the dialog (-1 before). */
  depth: number;
  /** Told the dialog's new depth. */
  readonly onDepth: (depth: number) => void;
}

export interface DialogStack {
  /**
   * A dialog opened, or was shown again. Every shown dialog is ranked again, and the ones whose
   * depth changed are told (before paint when this runs in a layout effect).
   */
  register(entry: DialogStackEntry): void;
  /**
   * A dialog closed or was hidden. The others keep their depth until the next registration:
   * ranking here would renumber dialogs that are being unmounted or hidden along with it.
   */
  unregister(entry: DialogStackEntry): void;
  /** Number of shown dialogs. */
  readonly size: number;
}

export function createDialogStack(): DialogStack {
  const shown = new Set<DialogStackEntry>();
  let opened = 0;
  return {
    register(entry) {
      if (entry.seq === 0) entry.seq = ++opened;
      shown.add(entry);
      Array.from(shown)
        .sort((a, b) => a.seq - b.seq)
        .forEach((dialog, depth) => {
          if (dialog.depth === depth) return;
          dialog.depth = depth;
          dialog.onDepth(depth);
        });
    },
    unregister(entry) {
      shown.delete(entry);
    },
    get size() {
      return shown.size;
    },
  };
}

const stack = createDialogStack();
const countListeners = new Set<(count: number) => void>();

function notifyCount(): void {
  countListeners.forEach((fn) => fn(stack.size));
}

/** Number of open (shown) DynamicUIElement dialogs. */
export function useOpenDynamicUIElementCount(): number {
  const [count, setCount] = React.useState(stack.size);
  React.useEffect(() => {
    countListeners.add(setCount);
    setCount(stack.size);
    return () => { countListeners.delete(setCount); };
  }, []);
  return count;
}

/**
 * The dialog's depth. The first render produces -1 (skip side effects), then the layout effect
 * commits the real depth before paint.
 */
export function useDialogDepth(): number {
  const [depth, setDepth] = React.useState(-1);
  const entryRef = React.useRef<DialogStackEntry | null>(null);
  React.useLayoutEffect(() => {
    // The same entry across an <Activity> hide / show keeps the dialog's place in the open order.
    entryRef.current ??= { seq: 0, depth: -1, onDepth: setDepth };
    const entry = entryRef.current;
    stack.register(entry);
    notifyCount();
    return () => {
      stack.unregister(entry);
      notifyCount();
    };
  }, []);
  return depth;
}
