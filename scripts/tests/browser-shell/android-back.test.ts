// Android hardware back chain (lib/browser-shell/android-back.ts) against a minimal fake document.
// Globals are installed in beforeAll and restored in afterAll so other test files in this process
// keep their environment.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  FOREIGN_OVERLAY_SELECTOR,
  FOREIGN_OVERLAY_SETTLE_MS,
  handleShellBack,
  type AndroidBackHandlers,
} from "@/lib/browser-shell/android-back";

class FakeOverlay {
  open = true;
  isConnected = true;
  matches(selector: string): boolean {
    return this.open && this.isConnected && selector === FOREIGN_OVERLAY_SELECTOR;
  }
}

const overlays: FakeOverlay[] = [];
const escapes: { type: string; key: string }[] = [];
const focused = {
  dispatchEvent(event: Event): boolean {
    escapes.push({ type: event.type, key: (event as Event & { key?: string }).key ?? "" });
    return true;
  },
};
const fakeDocument = {
  activeElement: focused,
  body: focused,
  querySelectorAll(selector: string): FakeOverlay[] {
    return selector === FOREIGN_OVERLAY_SELECTOR ? overlays.filter((overlay) => overlay.matches(selector)) : [];
  },
  getElementById: () => null,
};

class FakeKeyboardEvent extends Event {
  readonly key: string;
  constructor(type: string, init?: EventInit & { key?: string }) {
    super(type, init);
    this.key = init?.key ?? "";
  }
}

const globals = globalThis as unknown as Record<string, unknown>;
const saved = new Map<string, { had: boolean; value: unknown }>();
const installs: Record<string, unknown> = {
  document: fakeDocument,
  location: { search: "" },
  KeyboardEvent: FakeKeyboardEvent,
};

beforeAll(() => {
  for (const [name, value] of Object.entries(installs)) {
    saved.set(name, { had: name in globals, value: globals[name] });
    globals[name] = value;
  }
});

afterAll(() => {
  for (const [name, previous] of saved) {
    if (previous.had) globals[name] = previous.value;
    else delete globals[name];
  }
});

function spyHandlers(canGoBack = true): AndroidBackHandlers & { backs: number } {
  const handlers = {
    backs: 0,
    canGoBack: () => canGoBack,
    goBack: () => {
      handlers.backs++;
    },
    closeToOpener: () => false,
  };
  return handlers;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, FOREIGN_OVERLAY_SETTLE_MS + 60));

function reset(): void {
  overlays.length = 0;
  escapes.length = 0;
}

describe("android back: foreign overlays", () => {
  test("Base UI popover popups (no data-slot) are matched", () => {
    const parts = FOREIGN_OVERLAY_SELECTOR.split(", ");
    expect(parts).toContain('[role="dialog"][data-side][data-open]');
    expect(parts).toContain('[data-slot="popover-content"][data-open]');
  });

  test("open vaul drawers are matched by Radix data-state, not the handle-only visible flag", () => {
    const parts = FOREIGN_OVERLAY_SELECTOR.split(", ");
    expect(parts).toContain('[data-vaul-drawer][data-state="open"]:not([data-shell-sheet])');
    expect(FOREIGN_OVERLAY_SELECTOR).not.toContain("data-vaul-drawer-visible");
  });

  test("an open overlay gets Escape on the focused element; tab history is untouched", () => {
    reset();
    overlays.push(new FakeOverlay());
    const handlers = spyHandlers();
    expect(handleShellBack(handlers)).toBe("handled");
    expect(escapes).toEqual([{ type: "keydown", key: "Escape" }]);
    expect(handlers.backs).toBe(0);
  });

  test("an overlay that closed and reopened (same element) gets Escape again", async () => {
    reset();
    const overlay = new FakeOverlay();
    overlays.push(overlay);
    const handlers = spyHandlers();
    expect(handleShellBack(handlers)).toBe("handled");
    overlay.open = false;
    await settle();
    overlay.open = true;
    expect(handleShellBack(handlers)).toBe("handled");
    expect(escapes.length).toBe(2);
    expect(handlers.backs).toBe(0);
  });

  test("an overlay that ignores Escape does not trap back: the next press continues the chain once", async () => {
    reset();
    overlays.push(new FakeOverlay());
    const handlers = spyHandlers();
    expect(handleShellBack(handlers)).toBe("handled");
    await settle();
    expect(handleShellBack(handlers)).toBe("handled");
    expect(handlers.backs).toBe(1);
    expect(escapes.length).toBe(1);
    // The press after that tries Escape again.
    expect(handleShellBack(handlers)).toBe("handled");
    expect(escapes.length).toBe(2);
    expect(handlers.backs).toBe(1);
    await settle();
  });

  test("nothing open, no history, no opener → minimize", () => {
    reset();
    expect(handleShellBack(spyHandlers(false))).toBe("minimize");
    expect(escapes.length).toBe(0);
  });
});
