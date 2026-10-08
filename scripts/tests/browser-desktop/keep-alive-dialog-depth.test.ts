import { describe, expect, test } from "bun:test";
import { createDialogStack, type DialogStackEntry } from "@/components/ui/dialog-depth";

// DynamicUIElement dialog depths (components/ui/dialog-depth.ts) follow the order the dialogs
// opened. When a kept-alive tab is hidden React cleans up its dialogs' layout effects parent
// first, and when it is shown again it runs them children first (reappearLayoutEffects), so the
// order dialogs register in is not the order they opened in.

interface Dialog extends DialogStackEntry {
  /** Every depth the dialog was told, in order (React applies the last one). */
  readonly told: number[];
}

function dialog(): Dialog {
  const told: number[] = [];
  return { seq: 0, depth: -1, onDepth: (depth) => told.push(depth), told };
}

describe("dialog stack", () => {
  test("a nested dialog stays above the dialog it was opened from when its tab is shown again", () => {
    const stack = createDialogStack();
    const preferences = dialog();
    const language = dialog();
    stack.register(preferences);
    stack.register(language);
    expect([preferences.depth, language.depth]).toEqual([0, 1]);

    // Another tab is shown: the dialogs are hidden, parent first.
    stack.unregister(preferences);
    stack.unregister(language);
    expect(stack.size).toBe(0);

    // Back to the tab: children first.
    stack.register(language);
    stack.register(preferences);
    expect([preferences.depth, language.depth]).toEqual([0, 1]);
    expect(preferences.told.at(-1)).toBe(0);
    expect(language.told.at(-1)).toBe(1);
    expect(stack.size).toBe(2);
  });

  test("a background tab's dialogs leave the stack and keep their place in the open order", () => {
    const stack = createDialogStack();
    const inA = dialog();
    stack.register(inA);
    stack.unregister(inA);

    const inB = dialog();
    stack.register(inB);
    expect(inB.depth).toBe(0);

    stack.unregister(inB);
    stack.register(inA);
    expect(inA.depth).toBe(0);
    const nested = dialog();
    stack.register(nested);
    expect(nested.depth).toBe(1);
    expect(inA.told).toEqual([0]);
  });

  test("a dialog opened after an earlier one closed never shares a depth with one still open", () => {
    const stack = createDialogStack();
    const first = dialog();
    const second = dialog();
    stack.register(first);
    stack.register(second);
    stack.unregister(first);

    const third = dialog();
    stack.register(third);
    expect([second.depth, third.depth]).toEqual([0, 1]);
  });

  test("closing a dialog renumbers nothing (dialogs unmounting with it are not told)", () => {
    const stack = createDialogStack();
    const parent = dialog();
    const child = dialog();
    stack.register(parent);
    stack.register(child);
    stack.unregister(parent);
    stack.unregister(child);
    expect(parent.told).toEqual([0]);
    expect(child.told).toEqual([1]);
  });
});
