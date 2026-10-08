// components/device/mini-app-shell.tsx: Escape closes the open device app, unless content inside it already
// handled the key (defaultPrevented: a dialog, a slideshow), and nothing listens while the app is closed.
// Rendered through Ink's reconciler (this suite has no DOM): with no MiniAppSurface above it the shell renders
// nothing, but its effects still run, against a small fake window.

import { afterEach, describe, expect, test } from "bun:test";
import { createElement as h } from "react";
import { render } from "ink-testing-library";
import { MiniAppShell } from "@/components/device/mini-app-shell";

type KeyListener = (event: KeyboardEvent) => void;

const g = globalThis as { window?: unknown };
let app: ReturnType<typeof render> | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  delete g.window;
});

function installWindow() {
  const listeners = new Set<KeyListener>();
  g.window = {
    addEventListener: (type: string, fn: KeyListener) => {
      if (type === "keydown") listeners.add(fn);
    },
    removeEventListener: (type: string, fn: KeyListener) => {
      if (type === "keydown") listeners.delete(fn);
    },
  };
  const press = (key: string, defaultPrevented = false) => {
    for (const fn of [...listeners]) fn({ key, defaultPrevented } as KeyboardEvent);
  };
  return { listeners, press };
}

/** Lets passive effects run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function show(open: boolean, onClose: () => void) {
  const element = h(MiniAppShell, { open, onClose, title: "App", children: null });
  if (app) app.rerender(element);
  else app = render(element);
}

describe("MiniAppShell Escape", () => {
  test("Escape closes the open app; an Escape something inside already handled does not", async () => {
    const win = installWindow();
    let closes = 0;
    const onClose = () => void closes++;
    show(true, onClose);
    await settle();
    expect(win.listeners.size).toBe(1);

    win.press("Escape", true);
    expect(closes).toBe(0);
    win.press("Enter");
    expect(closes).toBe(0);
    win.press("Escape");
    expect(closes).toBe(1);
  });

  test("no listener while closed, and none left after unmount", async () => {
    const win = installWindow();
    let closes = 0;
    const onClose = () => void closes++;
    show(false, onClose);
    await settle();
    expect(win.listeners.size).toBe(0);
    win.press("Escape");
    expect(closes).toBe(0);

    show(true, onClose);
    await settle();
    expect(win.listeners.size).toBe(1);
    app?.unmount();
    app = null;
    await settle();
    expect(win.listeners.size).toBe(0);
  });
});
