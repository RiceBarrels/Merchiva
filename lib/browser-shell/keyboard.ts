import { useMemo, useSyncExternalStore } from "react";
import { isCapacitorNative } from "@/lib/capacitor";
import type { VirtualKeyboardState } from "./types";

/*
 * The only keyboard-inset hook (plan D30), used by the mobile chrome and the docs
 * editor's format bar. Algorithm: mobile-safari spec §17.
 *   native (Capacitor): @capacitor/keyboard keyboardWillShow / keyboardWillHide; iOS reports
 *                       the keyboard height as inset (fixed UI must lift), Android resizes the webview
 *   web:                visualViewport resize/scroll; open = editable focused && inset > 120px
 *   no visualViewport:  open = editable focused && coarse pointer
 * Listeners are installed on the first subscriber and removed with the last.
 */

const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "checkbox", "radio", "range", "button", "submit", "reset", "file", "color", "image", "hidden",
]);
const DEFAULT_IGNORE_WITHIN = "[data-shell-sheet]";
const KEYBOARD_MIN_INSET = 120;
const FOCUS_OUT_DELAY_MS = 120;

/** Whether focusing `el` brings up a text keyboard (text inputs, textareas, contenteditable). */
export function isEditableElement(el: Element | null): boolean {
  if (!el || typeof HTMLElement === "undefined" || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  return el.isContentEditable;
}

interface KeyboardSignals {
  readonly focused: HTMLElement | null;
  readonly native: boolean;
  readonly nativeOpen: boolean;
  readonly nativeInset: number;
  readonly hasViewport: boolean;
  readonly viewportInset: number;
  readonly coarse: boolean;
}

const INITIAL_SIGNALS: KeyboardSignals = Object.freeze({
  focused: null,
  native: false,
  nativeOpen: false,
  nativeInset: 0,
  hasViewport: false,
  viewportInset: 0,
  coarse: false,
});

let signals: KeyboardSignals = INITIAL_SIGNALS;
const listeners = new Set<() => void>();
let teardown: (() => void) | null = null;

function update(patch: Partial<KeyboardSignals>): void {
  let changed = false;
  for (const key of Object.keys(patch) as (keyof KeyboardSignals)[]) {
    if (patch[key] !== signals[key]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  signals = { ...signals, ...patch };
  for (const listener of Array.from(listeners)) listener();
}

function editableActiveElement(): HTMLElement | null {
  const active = document.activeElement;
  return isEditableElement(active) ? (active as HTMLElement) : null;
}

function capacitorPlatform(): string | null {
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    return cap?.getPlatform?.() ?? null;
  } catch {
    return null;
  }
}

function install(): () => void {
  const viewport = window.visualViewport ?? null;
  const coarseQuery = typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null;
  const native = isCapacitorNative();
  update({
    focused: editableActiveElement(),
    native,
    hasViewport: viewport !== null,
    coarse: coarseQuery?.matches ?? false,
  });

  let focusTimer: number | undefined;
  const onFocusIn = () => {
    window.clearTimeout(focusTimer);
    update({ focused: editableActiveElement() });
  };
  const onFocusOut = () => {
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => update({ focused: editableActiveElement() }), FOCUS_OUT_DELAY_MS);
  };
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);

  const onViewport = () => {
    if (!viewport) return;
    update({ viewportInset: Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)) });
  };
  viewport?.addEventListener("resize", onViewport);
  viewport?.addEventListener("scroll", onViewport);
  onViewport();

  const onCoarse = (event: MediaQueryListEvent) => update({ coarse: event.matches });
  coarseQuery?.addEventListener("change", onCoarse);

  let disposed = false;
  const handles: Array<{ remove: () => Promise<void> }> = [];
  if (native) {
    import("@capacitor/keyboard")
      .then(async ({ Keyboard }) => {
        if (disposed) return;
        const ios = capacitorPlatform() === "ios";
        const show = await Keyboard.addListener("keyboardWillShow", (info) =>
          update({ nativeOpen: true, nativeInset: ios ? Math.max(0, info.keyboardHeight) : 0 }),
        );
        const hide = await Keyboard.addListener("keyboardWillHide", () => update({ nativeOpen: false, nativeInset: 0 }));
        if (disposed) {
          show.remove().catch(() => {});
          hide.remove().catch(() => {});
          return;
        }
        handles.push(show, hide);
      })
      .catch(() => {
        // Plugin unavailable (web build of the native shell): focus signals still work.
      });
  }

  return () => {
    disposed = true;
    window.clearTimeout(focusTimer);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    viewport?.removeEventListener("resize", onViewport);
    viewport?.removeEventListener("scroll", onViewport);
    coarseQuery?.removeEventListener("change", onCoarse);
    for (const handle of handles) handle.remove().catch(() => {});
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!teardown) teardown = install();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && teardown) {
      const stop = teardown;
      teardown = null;
      stop();
      signals = INITIAL_SIGNALS;
    }
  };
}

function getSnapshot(): KeyboardSignals {
  return signals;
}

function getServerSnapshot(): KeyboardSignals {
  return INITIAL_SIGNALS;
}

function isInside(el: HTMLElement, selector: string): boolean {
  if (!selector) return false;
  try {
    return el.closest(selector) !== null;
  } catch {
    return false;
  }
}

/**
 * Virtual keyboard state. `ignoreWithin` (default `[data-shell-sheet]`) excludes fields inside
 * shell sheets so their own inputs don't collapse the chrome.
 */
export function useVirtualKeyboard(opts?: { ignoreWithin?: string }): VirtualKeyboardState {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ignoreWithin = opts?.ignoreWithin ?? DEFAULT_IGNORE_WITHIN;
  return useMemo<VirtualKeyboardState>(() => {
    const focused = s.focused;
    const editableFocused = !!focused && focused.isConnected && !isInside(focused, ignoreWithin);
    if (s.native) {
      return { open: s.nativeOpen, inset: s.nativeOpen ? s.nativeInset : 0, editableFocused };
    }
    if (s.hasViewport) {
      const open = editableFocused && s.viewportInset > KEYBOARD_MIN_INSET;
      return { open, inset: open ? s.viewportInset : 0, editableFocused };
    }
    return { open: editableFocused && s.coarse, inset: 0, editableFocused };
  }, [s, ignoreWithin]);
}
