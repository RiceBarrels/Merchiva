import { useSyncExternalStore } from "react";
import { isNativeShell } from "@/lib/native-shell";
import type { ShellCommand, ShortcutBinding } from "./types";

/*
 * The single shortcut table (plan §B1.7). Mod = ⌘ on macOS, Ctrl elsewhere; keys match on
 * `e.code`. `inEditable` says whether a binding still fires while focus is in an input,
 * textarea, select, contenteditable or .ProseMirror (plan D21).
 * Never bound: Mod+Shift+M (quick dialog), Mod+D (team canvas), Mod+0 / Mod+= / Mod+-, and the
 * docs editor keymap (Mod+B/I/U/K/S and Mod+backslash, Mod+Shift+S/L/E/J/7/8/9/Z, Mod+Alt+0-3/M,
 * Mod+Enter). `toggleSidebar` is Alt+S in every environment: the natural Mod combos are taken
 * (Mod+B and Mod+backslash by the docs editor, Mod+Shift+B by the bookmarks bar), while Alt+S is
 * free of the core table, the docs keymap, the quick dialog and the browser/OS combos in Tauri, a
 * plain web tab and an installed PWA alike — and Alt bindings never fire while typing (plan D21),
 * so the docs editor keeps every key while the caret is in the document.
 */

export interface ShortcutEnv {
  readonly isTauri: boolean;
  readonly isMac: boolean;
  readonly isStandalonePwa: boolean;
  readonly isChromium: boolean;
}

interface Mods {
  readonly mod?: boolean;
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
}

const SELECT_TAB_COMMANDS: readonly ShellCommand[] = [
  "selectTab1", "selectTab2", "selectTab3", "selectTab4", "selectTab5", "selectTab6", "selectTab7", "selectTab8",
];

/** Bindings for an environment, in preference order (the first binding of a command is its label). */
export function getShortcutBindings(env: {
  isTauri: boolean;
  isMac: boolean;
  isStandalonePwa: boolean;
  isChromium: boolean;
}): readonly ShortcutBinding[] {
  const out: ShortcutBinding[] = [];
  const add = (command: ShellCommand, code: string, mods: Mods, inEditable: boolean) => {
    out.push({ command, code, ...mods, inEditable });
  };
  const selectTabs = (mods: Mods, inEditable: boolean) => {
    SELECT_TAB_COMMANDS.forEach((command, i) => add(command, `Digit${i + 1}`, mods, inEditable));
    add("selectLastTab", "Digit9", mods, inEditable);
  };

  if (env.isTauri) {
    add("newTab", "KeyT", { mod: true }, true);
    // macOS: the default app menu owns ⌘W until the phase-2 Rust menu ships (plan Q6), so
    // Alt+W is bound too and listed first so tooltips show a combo that works.
    if (env.isMac) add("closeTab", "KeyW", { alt: true }, false);
    add("closeTab", "KeyW", { mod: true }, true);
    add("reopenClosedTab", "KeyT", { mod: true, shift: true }, true);
    add("nextTab", "Tab", { ctrl: true }, true);
    add("prevTab", "Tab", { ctrl: true, shift: true }, true);
    if (env.isMac) {
      add("nextTab", "ArrowRight", { mod: true, alt: true }, false);
      add("prevTab", "ArrowLeft", { mod: true, alt: true }, false);
    }
    selectTabs({ mod: true }, true);
    add("back", "BracketLeft", { mod: true }, false);
    add("forward", "BracketRight", { mod: true }, false);
    if (!env.isMac) {
      add("back", "ArrowLeft", { alt: true }, false);
      add("forward", "ArrowRight", { alt: true }, false);
    }
    add("reload", "KeyR", { mod: true }, true);
    add("hardReload", "KeyR", { mod: true, shift: true }, true);
    add("home", "KeyH", { mod: true, shift: true }, true);
    add("duplicateTab", "KeyD", { mod: true, shift: true }, true);
    add("focusOmnibox", "KeyL", { mod: true }, true);
    add("focusOmnibox", "KeyK", { mod: true }, false);
    add("focusOmnibox", "F6", {}, true);
    add("showTabOverview", "KeyA", { mod: true, shift: true }, true);
    add("toggleBookmarksBar", "KeyB", { mod: true, shift: true }, true);
    add("toggleSidebar", "KeyS", { alt: true }, false);
    return out;
  }

  const pwa = env.isStandalonePwa;
  // Chromium reserves Mod+T/W/Shift+T/Tab in normal windows but not in app (PWA) windows.
  if (pwa) add("newTab", "KeyT", { mod: true }, true);
  add("newTab", "KeyT", { alt: true }, false);
  if (pwa) add("closeTab", "KeyW", { mod: true }, true);
  add("closeTab", "KeyW", { alt: true }, false);
  if (pwa) add("reopenClosedTab", "KeyT", { mod: true, shift: true }, true);
  add("reopenClosedTab", "KeyT", { alt: true, shift: true }, false);
  if (pwa) {
    add("nextTab", "Tab", { ctrl: true }, true);
    add("prevTab", "Tab", { ctrl: true, shift: true }, true);
  }
  add("nextTab", "ArrowRight", { alt: true, shift: true }, false);
  add("prevTab", "ArrowLeft", { alt: true, shift: true }, false);
  // Mod+1..9 is not reserved by Chromium; Safari/Firefox delivery is unverified, so Alt+digit always exists.
  if (pwa || env.isChromium) selectTabs({ mod: true }, true);
  selectTabs({ alt: true }, false);
  if (pwa) {
    add("back", "ArrowLeft", { alt: true }, false);
    add("forward", "ArrowRight", { alt: true }, false);
  }
  add("home", "Home", { alt: true }, false);
  add("duplicateTab", "KeyD", { alt: true, shift: true }, false);
  if (pwa) add("focusOmnibox", "KeyL", { mod: true }, true);
  add("focusOmnibox", "KeyK", { mod: true }, false);
  add("focusOmnibox", "KeyL", { alt: true }, false);
  add("showTabOverview", "KeyA", { alt: true, shift: true }, false);
  add("toggleSidebar", "KeyS", { alt: true }, false);
  return out;
}

const KEY_LABELS: Readonly<Record<string, { readonly mac: string; readonly other: string }>> = {
  BracketLeft: { mac: "[", other: "[" },
  BracketRight: { mac: "]", other: "]" },
  ArrowLeft: { mac: "←", other: "←" },
  ArrowRight: { mac: "→", other: "→" },
  ArrowUp: { mac: "↑", other: "↑" },
  ArrowDown: { mac: "↓", other: "↓" },
  Tab: { mac: "⇥", other: "Tab" },
  Home: { mac: "↖", other: "Home" },
  End: { mac: "↘", other: "End" },
  Enter: { mac: "↩", other: "Enter" },
  Escape: { mac: "⎋", other: "Esc" },
  Space: { mac: "Space", other: "Space" },
};

function keyLabel(code: string, isMac: boolean): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const known = KEY_LABELS[code];
  if (known) return isMac ? known.mac : known.other;
  return code;
}

/** Menu / tooltip label: "⌥⇧T" on macOS (⌃⌥⇧⌘ order), "Alt+Shift+T" elsewhere. */
export function formatShortcut(b: ShortcutBinding, isMac: boolean): string {
  if (isMac) {
    let label = "";
    if (b.ctrl) label += "⌃";
    if (b.alt) label += "⌥";
    if (b.shift) label += "⇧";
    if (b.mod) label += "⌘";
    return label + keyLabel(b.code, true);
  }
  const parts: string[] = [];
  if (b.mod || b.ctrl) parts.push("Ctrl");
  if (b.alt) parts.push("Alt");
  if (b.shift) parts.push("Shift");
  parts.push(keyLabel(b.code, false));
  return parts.join("+");
}

/** First binding whose code and exact modifier set match the event. */
export function matchShortcutEvent(
  e: Pick<KeyboardEvent, "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  bindings: readonly ShortcutBinding[],
  isMac: boolean,
): ShortcutBinding | null {
  for (const b of bindings) {
    if (b.code !== e.code) continue;
    const wantMeta = isMac && !!b.mod;
    const wantCtrl = isMac ? !!b.ctrl : !!(b.mod || b.ctrl);
    if (e.metaKey !== wantMeta || e.ctrlKey !== wantCtrl || e.altKey !== !!b.alt || e.shiftKey !== !!b.shift) continue;
    return b;
  }
  return null;
}

interface NavigatorWithHints extends Navigator {
  readonly userAgentData?: { readonly brands?: ReadonlyArray<{ readonly brand: string }>; readonly platform?: string };
  readonly standalone?: boolean;
}

const SERVER_ENV: ShortcutEnv = Object.freeze({ isTauri: false, isMac: false, isStandalonePwa: false, isChromium: false });

/** Detects the shortcut environment. SSR: all false. */
export function getShortcutEnv(): ShortcutEnv {
  if (typeof window === "undefined" || typeof navigator === "undefined") return SERVER_ENV;
  const nav = navigator as NavigatorWithHints;
  const ua = nav.userAgent || "";
  const platform = nav.userAgentData?.platform || nav.platform || ua;
  const isMac = /mac|iphone|ipad|ipod/i.test(platform);
  const media = (query: string) => typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  const isStandalonePwa =
    media("(display-mode: standalone)") || media("(display-mode: window-controls-overlay)") || nav.standalone === true;
  const brands = nav.userAgentData?.brands;
  const isChromium = brands
    ? brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/i.test(b.brand))
    : /\b(Chrome|Chromium|Edg)\//.test(ua) && !/Firefox|FxiOS/.test(ua);
  return { isTauri: isNativeShell(), isMac, isStandalonePwa, isChromium };
}

let cachedEnv: ShortcutEnv | null = null;
let cachedBindings: readonly ShortcutBinding[] | null = null;

function clientEnv(): { env: ShortcutEnv; bindings: readonly ShortcutBinding[] } {
  if (!cachedEnv || !cachedBindings) {
    cachedEnv = getShortcutEnv();
    cachedBindings = getShortcutBindings(cachedEnv);
  }
  return { env: cachedEnv, bindings: cachedBindings };
}

function subscribeNever(): () => void {
  return () => {};
}

/** First binding of `cmd` for this device, formatted; null on the server or when unbound. */
export function useShortcutLabel(cmd: ShellCommand): string | null {
  return useSyncExternalStore(
    subscribeNever,
    () => {
      const { env, bindings } = clientEnv();
      const binding = bindings.find((b) => b.command === cmd);
      return binding ? formatShortcut(binding, env.isMac) : null;
    },
    () => null,
  );
}

const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable]:not([contenteditable='false']), .ProseMirror";

/** Inputs, textareas, selects, contenteditable and ProseMirror targets (plan D21). */
export function isEditableShortcutTarget(el: Element | null): boolean {
  if (!el) return false;
  if (typeof HTMLElement !== "undefined" && el instanceof HTMLElement && el.isContentEditable) return true;
  try {
    return el.closest(EDITABLE_SELECTOR) !== null;
  } catch {
    return false;
  }
}

/** Commands that may auto-repeat while the keys are held (every other binding fires once). */
const REPEATABLE: ReadonlySet<ShellCommand> = new Set<ShellCommand>(["nextTab", "prevTab"]);

/**
 * Installed by BrowserShellProvider: one `keydown` listener on window in the capture phase.
 * Skips composition, already-handled events and `[data-shell-shortcuts="off"]` subtrees;
 * bindings without `inEditable` are skipped while typing, and `canHandle` skips commands no
 * chrome is listening for. A match that survives all of that calls `preventDefault()` and
 * dispatches the command.
 */
export function installShortcuts(
  env: ShortcutEnv,
  dispatch: (cmd: ShellCommand) => void,
  opts?: { isEnabled?: () => boolean; canHandle?: (cmd: ShellCommand) => boolean },
): () => void {
  if (typeof window === "undefined") return () => {};
  const bindings = getShortcutBindings(env);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.defaultPrevented) return;
    if (opts?.isEnabled && !opts.isEnabled()) return;
    const binding = matchShortcutEvent(event, bindings, env.isMac);
    if (!binding) return;
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const origin = path.find((node): node is Element => typeof Element !== "undefined" && node instanceof Element)
      ?? (typeof document !== "undefined" ? document.activeElement : null);
    if (origin?.closest('[data-shell-shortcuts="off"]')) return;
    if (!binding.inEditable && isEditableShortcutTarget(origin)) return;
    // A command nothing is listening for stays the browser's key. `toggleSidebar` and
    // `toggleBookmarksBar` belong to the desktop chrome, so below the 1024px breakpoint — and in
    // the legacy shell — no handler is registered, and swallowing the combo there would cost the
    // user a working browser shortcut (Alt+letter is the Firefox access-key modifier).
    if (opts?.canHandle && !opts.canHandle(binding.command)) return;
    event.preventDefault();
    if (event.repeat && !REPEATABLE.has(binding.command)) return;
    dispatch(binding.command);
  };
  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
