import { describe, expect, test } from "bun:test";
import {
  emitShellCommand,
  hasShellCommandHandler,
  registerShellCommandHandler,
} from "@/lib/browser-shell/shell-context";
import { installShortcuts, type ShortcutEnv } from "@/lib/browser-shell/shortcuts";
import type { ShellCommand } from "@/lib/browser-shell/types";

/*
 * The installer's gatekeeping (plan §B1.7): a combo is swallowed only when something will act on
 * it. `toggleSidebar` and `toggleBookmarksBar` belong to the desktop chrome, so below the 1024px
 * breakpoint — and in the legacy shell — nothing registers them and the key must stay the
 * browser's (Alt+letter is the Firefox access-key modifier on Windows and Linux).
 *
 * Bun has no DOM, so `window` is stubbed with exactly the two methods the installer touches.
 */

const ENV: ShortcutEnv = { isTauri: false, isMac: false, isStandalonePwa: false, isChromium: true };

interface FakeKeyEvent {
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
  readonly repeat: boolean;
  defaultPrevented: boolean;
  prevented: boolean;
  preventDefault(): void;
  composedPath(): unknown[];
}

function keydown(code: string, mods: { alt?: boolean; shift?: boolean; ctrl?: boolean; repeat?: boolean } = {}): FakeKeyEvent {
  return {
    code,
    metaKey: false,
    ctrlKey: mods.ctrl === true,
    altKey: mods.alt === true,
    shiftKey: mods.shift === true,
    isComposing: false,
    repeat: mods.repeat === true,
    defaultPrevented: false,
    prevented: false,
    preventDefault(this: FakeKeyEvent) {
      this.prevented = true;
      this.defaultPrevented = true;
    },
    composedPath: () => [],
  };
}

type Listener = (event: FakeKeyEvent) => void;

/** Installs the listener against a stubbed window and returns a way to fire keys at it. */
function withInstaller(
  opts: Parameters<typeof installShortcuts>[2],
  run: (fire: (event: FakeKeyEvent) => void, dispatched: ShellCommand[]) => void,
): void {
  const scope = globalThis as { window?: unknown };
  const had = "window" in scope;
  const previous = scope.window;
  const listeners: Listener[] = [];
  scope.window = {
    addEventListener: (_type: string, fn: Listener) => {
      listeners.push(fn);
    },
    removeEventListener: (_type: string, fn: Listener) => {
      const index = listeners.indexOf(fn);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
  const dispatched: ShellCommand[] = [];
  let uninstall: (() => void) | null = null;
  try {
    uninstall = installShortcuts(ENV, (cmd) => dispatched.push(cmd), opts);
    run((event) => {
      for (const listener of listeners.slice()) listener(event);
    }, dispatched);
  } finally {
    uninstall?.();
    expect(listeners).toHaveLength(0);
    if (had) scope.window = previous;
    else delete scope.window;
  }
}

describe("installShortcuts gatekeeping", () => {
  test("a command no chrome listens for keeps its key: not prevented, not dispatched", () => {
    withInstaller({ canHandle: (cmd) => cmd !== "toggleSidebar" }, (fire, dispatched) => {
      const sidebar = keydown("KeyS", { alt: true });
      fire(sidebar);
      expect(sidebar.prevented).toBe(false);
      expect(dispatched).toEqual([]);

      // A command that IS handled still behaves exactly as before.
      const newTab = keydown("KeyT", { alt: true });
      fire(newTab);
      expect(newTab.prevented).toBe(true);
      expect(dispatched).toEqual(["newTab"]);
    });
  });

  test("with a handler present the sidebar toggle is swallowed and dispatched", () => {
    withInstaller({ canHandle: () => true }, (fire, dispatched) => {
      const event = keydown("KeyS", { alt: true });
      fire(event);
      expect(event.prevented).toBe(true);
      expect(dispatched).toEqual(["toggleSidebar"]);
    });
  });

  test("no canHandle predicate keeps the original behaviour", () => {
    withInstaller(undefined, (fire, dispatched) => {
      const event = keydown("KeyS", { alt: true });
      fire(event);
      expect(event.prevented).toBe(true);
      expect(dispatched).toEqual(["toggleSidebar"]);
    });
  });

  test("isEnabled still wins, and unbound combos are never touched", () => {
    withInstaller({ isEnabled: () => false, canHandle: () => true }, (fire, dispatched) => {
      const event = keydown("KeyS", { alt: true });
      fire(event);
      expect(event.prevented).toBe(false);
      expect(dispatched).toEqual([]);
    });
    withInstaller({ canHandle: () => true }, (fire, dispatched) => {
      // Alt+Q is in no table.
      const event = keydown("KeyQ", { alt: true });
      fire(event);
      expect(event.prevented).toBe(false);
      expect(dispatched).toEqual([]);
    });
  });

  test("a held key still swallows the repeat but only repeats the repeatable commands", () => {
    withInstaller({ canHandle: () => true }, (fire, dispatched) => {
      const repeatSidebar = keydown("KeyS", { alt: true, repeat: true });
      fire(repeatSidebar);
      expect(repeatSidebar.prevented).toBe(true);
      expect(dispatched).toEqual([]);

      const repeatNext = keydown("ArrowRight", { alt: true, shift: true, repeat: true });
      fire(repeatNext);
      expect(dispatched).toEqual(["nextTab"]);
    });
  });
});

describe("hasShellCommandHandler", () => {
  test("reports whether emitShellCommand would reach anyone", () => {
    const cmd: ShellCommand = "toggleSidebar";
    expect(hasShellCommandHandler(cmd)).toBe(false);
    let ran = 0;
    const remove = registerShellCommandHandler(cmd, () => {
      ran += 1;
    });
    expect(hasShellCommandHandler(cmd)).toBe(true);
    emitShellCommand(cmd);
    expect(ran).toBe(1);
    remove();
    expect(hasShellCommandHandler(cmd)).toBe(false);
    // Emitting into the void is still a no-op.
    emitShellCommand(cmd);
    expect(ran).toBe(1);
  });
});
