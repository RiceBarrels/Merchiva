// The Slides keyboard map (lib/slides/editor/keys.ts, slides.md §7.2): Mod per platform, literal Ctrl+M, the rail's
// own meaning of Mod+↑/↓, and the typing hand-off (printable keys and the first IME key, never replayed).
import { describe, expect, test } from "bun:test";

import { isApplePlatform, slidesKeyCommand, type KeyLike } from "@/lib/slides/editor/keys";

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
const mac = { isMac: true, inRail: false };
const win = { isMac: false, inRail: false };

describe("slidesKeyCommand", () => {
  test("undo / redo with the platform's Mod", () => {
    expect(slidesKeyCommand(key("z", { metaKey: true }), mac)).toEqual({ kind: "undo" });
    expect(slidesKeyCommand(key("Z", { metaKey: true, shiftKey: true }), mac)).toEqual({ kind: "redo" });
    expect(slidesKeyCommand(key("y", { ctrlKey: true }), win)).toEqual({ kind: "redo" });
    expect(slidesKeyCommand(key("z", { ctrlKey: true }), mac)).toBeNull();
  });

  test("new slide is literal Ctrl+M on every platform (⌘M minimises on macOS)", () => {
    expect(slidesKeyCommand(key("m", { ctrlKey: true, code: "KeyM" }), mac)).toEqual({ kind: "newSlide" });
    expect(slidesKeyCommand(key("m", { ctrlKey: true, code: "KeyM" }), win)).toEqual({ kind: "newSlide" });
    expect(slidesKeyCommand(key("m", { metaKey: true }), mac)).toBeNull();
  });

  test("arrows nudge 1 pt, Shift 10 pt; Mod+arrows arrange; in the rail they move slides", () => {
    expect(slidesKeyCommand(key("ArrowLeft"), win)).toEqual({ kind: "nudge", dx: -1, dy: 0 });
    expect(slidesKeyCommand(key("ArrowDown", { shiftKey: true }), win)).toEqual({ kind: "nudge", dx: 0, dy: 10 });
    expect(slidesKeyCommand(key("ArrowUp", { metaKey: true }), mac)).toEqual({ kind: "arrange", op: "forward" });
    expect(slidesKeyCommand(key("ArrowDown", { ctrlKey: true, shiftKey: true }), win)).toEqual({ kind: "arrange", op: "back" });
    expect(slidesKeyCommand(key("ArrowDown", { metaKey: true }), { isMac: true, inRail: true })).toEqual({ kind: "moveSlides", dir: 1 });
  });

  test("present, slides, edit, escape, cycle, delete, duplicate, select all", () => {
    expect(slidesKeyCommand(key("Enter", { metaKey: true }), mac)).toEqual({ kind: "present", fromStart: false });
    expect(slidesKeyCommand(key("Enter", { metaKey: true, shiftKey: true }), mac)).toEqual({ kind: "present", fromStart: true });
    expect(slidesKeyCommand(key("PageDown"), win)).toEqual({ kind: "slide", dir: 1 });
    expect(slidesKeyCommand(key("Enter"), win)).toEqual({ kind: "edit" });
    expect(slidesKeyCommand(key("Escape"), win)).toEqual({ kind: "escape" });
    expect(slidesKeyCommand(key("Tab", { shiftKey: true }), win)).toEqual({ kind: "cycle", dir: -1 });
    expect(slidesKeyCommand(key("Backspace"), win)).toEqual({ kind: "delete" });
    expect(slidesKeyCommand(key("d", { ctrlKey: true }), win)).toEqual({ kind: "duplicate" });
    expect(slidesKeyCommand(key("a", { metaKey: true }), mac)).toEqual({ kind: "selectAll" });
  });

  test("typing: printable keys, AltGr / ⌥ characters and the first IME key hand off; compositions are ignored", () => {
    expect(slidesKeyCommand(key("q"), win)).toEqual({ kind: "type" });
    expect(slidesKeyCommand(key(" "), win)).toEqual({ kind: "type" });
    expect(slidesKeyCommand(key("@", { ctrlKey: true, altKey: true }), win)).toEqual({ kind: "type" });
    expect(slidesKeyCommand(key("é", { altKey: true }), mac)).toEqual({ kind: "type" });
    expect(slidesKeyCommand(key("Process", { keyCode: 229 }), win)).toEqual({ kind: "type" });
    expect(slidesKeyCommand(key("Unidentified", { keyCode: 229 }), mac)).toEqual({ kind: "type" });
    expect(slidesKeyCommand(key("n", { isComposing: true }), win)).toBeNull();
    expect(slidesKeyCommand(key("c", { metaKey: true }), mac)).toBeNull(); // copy stays a native clipboard event
    expect(slidesKeyCommand(key("F5"), win)).toBeNull();
  });
});

test("isApplePlatform", () => {
  expect(isApplePlatform({ platform: "MacIntel" })).toBe(true);
  expect(isApplePlatform({ platform: "", userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)" })).toBe(true);
  expect(isApplePlatform({ platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0)" })).toBe(false);
  expect(isApplePlatform(undefined)).toBe(false);
});
