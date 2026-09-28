import { describe, expect, test } from "bun:test";
import {
  isMerchivaShortcut,
  merchivaShortcutLabel,
  type MerchivaShortcutEvent,
} from "@/components/merchiva-dock/shortcut";

function press(key: string, code: string, mods: Partial<MerchivaShortcutEvent> = {}): MerchivaShortcutEvent {
  return {
    key,
    code,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
    ...mods,
  };
}

describe("isMerchivaShortcut", () => {
  test("⌘⇧M and Ctrl+Shift+M toggle the dock", () => {
    expect(isMerchivaShortcut(press("M", "KeyM", { metaKey: true, shiftKey: true }))).toBe(true);
    expect(isMerchivaShortcut(press("M", "KeyM", { ctrlKey: true, shiftKey: true }))).toBe(true);
    // Caps Lock or a layout that reports the lower-case letter.
    expect(isMerchivaShortcut(press("m", "KeyM", { metaKey: true, shiftKey: true }))).toBe(true);
  });

  test("needs Mod and Shift, and no Alt", () => {
    expect(isMerchivaShortcut(press("m", "KeyM", { metaKey: true }))).toBe(false);
    expect(isMerchivaShortcut(press("M", "KeyM", { shiftKey: true }))).toBe(false);
    expect(isMerchivaShortcut(press("M", "KeyM", { metaKey: true, shiftKey: true, altKey: true }))).toBe(false);
  });

  test("ignores key repeat and IME composition, so holding the keys cannot flicker the dock", () => {
    expect(isMerchivaShortcut(press("M", "KeyM", { metaKey: true, shiftKey: true, repeat: true }))).toBe(false);
    expect(isMerchivaShortcut(press("M", "KeyM", { metaKey: true, shiftKey: true, isComposing: true }))).toBe(false);
  });

  test("follows the printed M on AZERTY, not the physical QWERTY position", () => {
    // AZERTY prints M on the key QWERTY calls Semicolon, and "?" on the one it calls KeyM.
    expect(isMerchivaShortcut(press("M", "Semicolon", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isMerchivaShortcut(press("?", "KeyM", { ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  test("falls back to the physical key on layouts with no Latin M", () => {
    // Russian ЙЦУКЕН puts Ь on KeyM; Arabic puts ة there.
    expect(isMerchivaShortcut(press("Ь", "KeyM", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isMerchivaShortcut(press("ة", "KeyM", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isMerchivaShortcut(press("Ь", "KeyN", { ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  test("other letters and named keys never match", () => {
    expect(isMerchivaShortcut(press("N", "KeyN", { metaKey: true, shiftKey: true }))).toBe(false);
    expect(isMerchivaShortcut(press("Enter", "Enter", { metaKey: true, shiftKey: true }))).toBe(false);
  });
});

describe("merchivaShortcutLabel", () => {
  test("macOS symbols, spelled out elsewhere", () => {
    expect(merchivaShortcutLabel(true)).toBe("⌘⇧M");
    expect(merchivaShortcutLabel(false)).toBe("Ctrl+Shift+M");
  });
});
