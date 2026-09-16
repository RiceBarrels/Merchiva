import { describe, expect, test } from "bun:test";
import { dispositionFromKeyboard, dispositionFromPointer } from "@/lib/browser-shell/dispositions";
import { classifyLinkClick } from "@/lib/browser-shell/link-intercept";
import {
  formatShortcut,
  getShortcutBindings,
  isEditableShortcutTarget,
  matchShortcutEvent,
  type ShortcutEnv,
} from "@/lib/browser-shell/shortcuts";
import type { ShellCommand, ShortcutBinding } from "@/lib/browser-shell/types";

const ENVS: Record<string, ShortcutEnv> = {
  tauriMac: { isTauri: true, isMac: true, isStandalonePwa: false, isChromium: false },
  tauriWindows: { isTauri: true, isMac: false, isStandalonePwa: false, isChromium: false },
  chromeMac: { isTauri: false, isMac: true, isStandalonePwa: false, isChromium: true },
  chromeWindows: { isTauri: false, isMac: false, isStandalonePwa: false, isChromium: true },
  pwaWindows: { isTauri: false, isMac: false, isStandalonePwa: true, isChromium: true },
  safari: { isTauri: false, isMac: true, isStandalonePwa: false, isChromium: false },
  firefoxLinux: { isTauri: false, isMac: false, isStandalonePwa: false, isChromium: false },
};

function combo(b: ShortcutBinding): string {
  const parts = [b.mod && "Mod", b.ctrl && "Ctrl", b.alt && "Alt", b.shift && "Shift", b.code].filter(Boolean);
  return parts.join("+");
}

function bindingsFor(env: ShortcutEnv, command: ShellCommand): string[] {
  return getShortcutBindings(env).filter((b) => b.command === command).map(combo);
}

function has(env: ShortcutEnv, command: ShellCommand, wanted: string): boolean {
  return bindingsFor(env, command).includes(wanted);
}

describe("shortcut table (plan §B1.7)", () => {
  test("Tauri binds Mod combos; macOS lists Alt+W first for close tab", () => {
    const mac = ENVS.tauriMac;
    expect(bindingsFor(mac, "newTab")).toEqual(["Mod+KeyT"]);
    expect(bindingsFor(mac, "closeTab")).toEqual(["Alt+KeyW", "Mod+KeyW"]);
    expect(bindingsFor(mac, "reopenClosedTab")).toEqual(["Mod+Shift+KeyT"]);
    expect(has(mac, "nextTab", "Ctrl+Tab") && has(mac, "nextTab", "Mod+Alt+ArrowRight")).toBe(true);
    expect(has(mac, "selectTab1", "Mod+Digit1") && has(mac, "selectLastTab", "Mod+Digit9")).toBe(true);
    expect(has(mac, "back", "Mod+BracketLeft") && !has(mac, "back", "Alt+ArrowLeft")).toBe(true);
    expect(has(mac, "reload", "Mod+KeyR") && has(mac, "hardReload", "Mod+Shift+KeyR")).toBe(true);
    expect(bindingsFor(mac, "focusOmnibox")).toEqual(["Mod+KeyL", "Mod+KeyK", "F6"]);
    expect(bindingsFor(mac, "toggleBookmarksBar")).toEqual(["Mod+Shift+KeyB"]);
    expect(bindingsFor(mac, "toggleSidebar")).toEqual(["Alt+KeyS"]);
    expect(bindingsFor(ENVS.tauriWindows, "closeTab")).toEqual(["Mod+KeyW"]);
    expect(has(ENVS.tauriWindows, "back", "Alt+ArrowLeft")).toBe(true);
    expect(bindingsFor(ENVS.tauriWindows, "nextTab")).toEqual(["Ctrl+Tab"]);
  });

  test("web tabs use Alt combos; Chromium adds Mod+digits; nothing reserved is bound", () => {
    const chrome = ENVS.chromeWindows;
    expect(bindingsFor(chrome, "newTab")).toEqual(["Alt+KeyT"]);
    expect(bindingsFor(chrome, "closeTab")).toEqual(["Alt+KeyW"]);
    expect(bindingsFor(chrome, "reopenClosedTab")).toEqual(["Alt+Shift+KeyT"]);
    expect(bindingsFor(chrome, "nextTab")).toEqual(["Alt+Shift+ArrowRight"]);
    expect(bindingsFor(chrome, "selectTab3")).toEqual(["Mod+Digit3", "Alt+Digit3"]);
    expect(bindingsFor(chrome, "back")).toEqual([]);
    expect(bindingsFor(chrome, "reload")).toEqual([]);
    expect(bindingsFor(chrome, "home")).toEqual(["Alt+Home"]);
    expect(bindingsFor(chrome, "focusOmnibox")).toEqual(["Mod+KeyK", "Alt+KeyL"]);
    expect(bindingsFor(chrome, "showTabOverview")).toEqual(["Alt+Shift+KeyA"]);
    expect(bindingsFor(chrome, "toggleBookmarksBar")).toEqual([]);
    expect(bindingsFor(chrome, "toggleSidebar")).toEqual(["Alt+KeyS"]);
    for (const env of [ENVS.safari, ENVS.firefoxLinux]) {
      expect(bindingsFor(env, "selectTab1")).toEqual(["Alt+Digit1"]);
      expect(bindingsFor(env, "newTab")).toEqual(["Alt+KeyT"]);
    }
  });

  test("installed PWAs get the Mod combos Chromium reserves only in normal windows", () => {
    const pwa = ENVS.pwaWindows;
    expect(bindingsFor(pwa, "newTab")).toEqual(["Mod+KeyT", "Alt+KeyT"]);
    expect(bindingsFor(pwa, "closeTab")).toEqual(["Mod+KeyW", "Alt+KeyW"]);
    expect(bindingsFor(pwa, "reopenClosedTab")).toEqual(["Mod+Shift+KeyT", "Alt+Shift+KeyT"]);
    expect(bindingsFor(pwa, "nextTab")).toEqual(["Ctrl+Tab", "Alt+Shift+ArrowRight"]);
    expect(bindingsFor(pwa, "back")).toEqual(["Alt+ArrowLeft"]);
    expect(bindingsFor(pwa, "focusOmnibox")).toEqual(["Mod+KeyL", "Mod+KeyK", "Alt+KeyL"]);
    expect(bindingsFor(pwa, "toggleSidebar")).toEqual(["Alt+KeyS"]);
  });

  test("never binds Mod+D, Mod+Shift+M or the zoom keys; no combo maps to two commands", () => {
    for (const [name, env] of Object.entries(ENVS)) {
      const bindings = getShortcutBindings(env);
      const resolved = new Map<string, ShellCommand>();
      for (const b of bindings) {
        const meta = env.isMac && !!b.mod;
        const ctrl = env.isMac ? !!b.ctrl : !!(b.mod || b.ctrl);
        const key = `${meta}|${ctrl}|${!!b.alt}|${!!b.shift}|${b.code}`;
        const existing = resolved.get(key);
        if (existing && existing !== b.command) throw new Error(`${name}: ${key} bound to ${existing} and ${b.command}`);
        resolved.set(key, b.command);
        const forbidden = (b.code === "KeyD" && b.mod && !b.shift) || (b.code === "KeyM" && b.mod && b.shift)
          || (["Digit0", "Equal", "Minus"].includes(b.code) && b.mod);
        expect(Boolean(forbidden)).toBe(false);
      }
    }
  });

  test("the sidebar toggle is Alt+S everywhere and never collides with the docs editor keymap", () => {
    // Every docs editor shortcut is a Mod combo (lib/docs/shortcut-label.ts), so an Alt-only
    // binding that is skipped in editable targets can never take a key from the editor.
    for (const [name, env] of Object.entries(ENVS)) {
      expect(bindingsFor(env, "toggleSidebar")).toEqual(["Alt+KeyS"]);
      for (const b of getShortcutBindings(env).filter((x) => x.command === "toggleSidebar")) {
        expect({ name, mod: !!b.mod, ctrl: !!b.ctrl, inEditable: b.inEditable }).toEqual({ name, mod: false, ctrl: false, inEditable: false });
      }
    }
  });

  test("editable-field rule: Alt combos, Mod+K and Mod+[ ] never fire while typing", () => {
    for (const env of Object.values(ENVS)) {
      for (const b of getShortcutBindings(env)) {
        if (b.alt) expect(b.inEditable).toBe(false);
        if (b.code === "KeyK" && b.mod) expect(b.inEditable).toBe(false);
        if ((b.code === "BracketLeft" || b.code === "BracketRight") && b.mod) expect(b.inEditable).toBe(false);
      }
    }
    expect(getShortcutBindings(ENVS.tauriMac).find((b) => b.command === "newTab")?.inEditable).toBe(true);
    expect(isEditableShortcutTarget(null)).toBe(false);
  });
});

describe("matchShortcutEvent", () => {
  const key = (code: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
    code,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });

  test("Mod is ⌘ on macOS and Ctrl elsewhere, with exact modifier sets", () => {
    const mac = getShortcutBindings(ENVS.tauriMac);
    expect(matchShortcutEvent(key("KeyT", { metaKey: true }), mac, true)?.command).toBe("newTab");
    expect(matchShortcutEvent(key("KeyT", { ctrlKey: true }), mac, true)).toBeNull();
    expect(matchShortcutEvent(key("KeyT", { metaKey: true, shiftKey: true }), mac, true)?.command).toBe("reopenClosedTab");
    expect(matchShortcutEvent(key("Tab", { ctrlKey: true }), mac, true)?.command).toBe("nextTab");
    const win = getShortcutBindings(ENVS.tauriWindows);
    expect(matchShortcutEvent(key("KeyT", { ctrlKey: true }), win, false)?.command).toBe("newTab");
    expect(matchShortcutEvent(key("KeyT", { ctrlKey: true, altKey: true }), win, false)).toBeNull();
    const web = getShortcutBindings(ENVS.chromeMac);
    expect(matchShortcutEvent(key("KeyW", { altKey: true }), web, true)?.command).toBe("closeTab");
    expect(matchShortcutEvent(key("KeyW", { metaKey: true }), web, true)).toBeNull();
  });
});

describe("formatShortcut", () => {
  test("symbols on macOS, words elsewhere", () => {
    expect(formatShortcut({ command: "reopenClosedTab", code: "KeyT", mod: true, shift: true, inEditable: true }, true)).toBe("⇧⌘T");
    expect(formatShortcut({ command: "newTab", code: "KeyT", alt: true, shift: true, inEditable: false }, true)).toBe("⌥⇧T");
    expect(formatShortcut({ command: "nextTab", code: "Tab", ctrl: true, inEditable: true }, true)).toBe("⌃⇥");
    expect(formatShortcut({ command: "reopenClosedTab", code: "KeyT", mod: true, shift: true, inEditable: true }, false)).toBe("Ctrl+Shift+T");
    expect(formatShortcut({ command: "selectTab1", code: "Digit1", alt: true, inEditable: false }, false)).toBe("Alt+1");
    expect(formatShortcut({ command: "home", code: "Home", alt: true, inEditable: false }, false)).toBe("Alt+Home");
  });
});

describe("dispositions and link clicks (plan D22)", () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false };

  test("pointer dispositions", () => {
    expect(dispositionFromPointer(click, true, false)).toBe("current");
    expect(dispositionFromPointer({ ...click, metaKey: true }, true, false)).toBe("new-background");
    expect(dispositionFromPointer({ ...click, metaKey: true, shiftKey: true }, true, false)).toBe("new-foreground");
    expect(dispositionFromPointer({ ...click, ctrlKey: true }, false, false)).toBe("new-background");
    expect(dispositionFromPointer({ ...click, button: 1 }, false, false)).toBe("new-background");
    expect(dispositionFromPointer({ ...click, shiftKey: true }, false, false)).toBe("current");
    expect(dispositionFromPointer({ ...click, shiftKey: true }, false, true)).toBe("new-foreground");
  });

  test("keyboard dispositions", () => {
    const enter = { altKey: false, metaKey: false, ctrlKey: false, shiftKey: false };
    expect(dispositionFromKeyboard(enter, true)).toBe("current");
    expect(dispositionFromKeyboard({ ...enter, altKey: true }, true)).toBe("new-foreground");
    expect(dispositionFromKeyboard({ ...enter, metaKey: true, shiftKey: true }, true)).toBe("new-background");
    expect(dispositionFromKeyboard({ ...enter, ctrlKey: true }, false)).toBe("new-foreground");
  });

  test("link click classification", () => {
    const base = { button: 0, isAux: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    const web = { isMac: true, isTauri: false };
    expect(classifyLinkClick(base, web)).toBe("plain");
    expect(classifyLinkClick({ ...base, metaKey: true }, web)).toBe("background");
    expect(classifyLinkClick({ ...base, metaKey: true, shiftKey: true }, web)).toBe("foreground");
    expect(classifyLinkClick({ ...base, button: 1, isAux: true }, web)).toBe("background");
    expect(classifyLinkClick({ ...base, shiftKey: true }, web)).toBeNull();
    expect(classifyLinkClick({ ...base, shiftKey: true }, { isMac: false, isTauri: true })).toBe("foreground");
    expect(classifyLinkClick({ ...base, altKey: true, metaKey: true }, web)).toBeNull();
    expect(classifyLinkClick({ ...base, ctrlKey: true }, web)).toBeNull();
    expect(classifyLinkClick({ ...base, ctrlKey: true }, { isMac: false, isTauri: false })).toBe("background");
    expect(classifyLinkClick({ ...base, button: 2, isAux: true }, web)).toBeNull();
  });
});
