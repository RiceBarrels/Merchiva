// Drive manager selection, results keyboard map, bulk actions and nav sections (drive-ui §6.4, §7.2–§7.4):
// the pure parts, in process. The hooks, the keyboard handler and the rendered pieces run in ui.isolated.ts.

import { describe, expect, test } from "bun:test";
import {
  EMPTY_SELECTION,
  driveKeyCommand,
  extendSelection,
  pruneSelection,
  replaceSelection,
  toggleSelection,
  type DriveKeyInput,
  type SelectionState,
} from "@/components/drive/list/use-selection";
import { visibleSections } from "@/components/drive/nav/section-meta";
import { selectionActions } from "@/components/drive/toolbar/selection-actions";
import { ANA, BEN, item, world } from "./fixture";

describe("selection reducers", () => {
  test("toggle adds and removes a key, moves the anchor, and touch mode ends with the last key", () => {
    let s = { ...EMPTY_SELECTION, mode: true };
    s = toggleSelection(s, "a");
    expect([...s.keys]).toEqual(["a"]);
    expect(s.anchor).toBe("a");
    expect(s.mode).toBe(true);
    s = toggleSelection(s, "a");
    expect(s.keys.size).toBe(0);
    expect(s.mode).toBe(false);
  });

  test("Shift extends the clicked key's new state over the range, in both directions", () => {
    const ordered = ["a", "b", "c", "d", "e"];
    let s = toggleSelection(EMPTY_SELECTION, "b");
    s = extendSelection(s, "d", ordered);
    expect([...s.keys].sort()).toEqual(["b", "c", "d"]);
    expect(s.anchor).toBe("d");
    s = extendSelection(s, "c", ordered);
    expect([...s.keys].sort()).toEqual(["b"]);
    expect([...extendSelection(toggleSelection(EMPTY_SELECTION, "e"), "a", ordered).keys].sort()).toEqual(ordered);
  });

  test("Shift without a visible anchor toggles the key", () => {
    const s = extendSelection(EMPTY_SELECTION, "c", ["a", "c"]);
    expect([...s.keys]).toEqual(["c"]);
    expect(s.anchor).toBe("c");
  });

  test("prune keeps the same object when nothing goes; drops hidden keys and a hidden anchor", () => {
    const s = replaceSelection(EMPTY_SELECTION, ["a", "b"]);
    expect(pruneSelection(s, new Set(["a", "b", "c"]))).toBe(s);
    const pruned = pruneSelection(s, new Set(["a"]));
    expect([...pruned.keys]).toEqual(["a"]);
    expect(pruned.anchor).toBeNull();
    const inMode: SelectionState = { ...s, mode: true };
    expect(pruneSelection(inMode, new Set<string>()).mode).toBe(false);
  });
});

describe("results keyboard map", () => {
  const key = (k: string, mods: Partial<DriveKeyInput> = {}): DriveKeyInput => ({
    key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
  });

  test("Mod+A selects all except while typing", () => {
    expect(driveKeyCommand(key("a", { metaKey: true }), "link")).toBe("selectAll");
    expect(driveKeyCommand(key("A", { ctrlKey: true }), "other")).toBe("selectAll");
    expect(driveKeyCommand(key("a", { ctrlKey: true }), "text")).toBeNull();
    expect(driveKeyCommand(key("a", { ctrlKey: true, shiftKey: true }), "other")).toBeNull();
  });

  test("Enter and Space keep their native job on links, buttons and checkboxes", () => {
    expect(driveKeyCommand(key("Enter"), "link")).toBeNull();
    expect(driveKeyCommand(key("Enter"), "control")).toBeNull();
    expect(driveKeyCommand(key("Enter"), "other")).toBe("open");
    expect(driveKeyCommand(key(" "), "link")).toBe("preview");
    expect(driveKeyCommand(key(" "), "control")).toBeNull();
  });

  test("F2, Delete, Backspace and Escape; never while typing, composing or with Alt", () => {
    expect(driveKeyCommand(key("F2"), "link")).toBe("rename");
    expect(driveKeyCommand(key("Delete"), "control")).toBe("trash");
    expect(driveKeyCommand(key("Backspace"), "other")).toBe("trash");
    expect(driveKeyCommand(key("Backspace"), "text")).toBeNull();
    expect(driveKeyCommand(key("Escape"), "link")).toBe("clear");
    expect(driveKeyCommand(key("Delete", { altKey: true }), "link")).toBeNull();
    expect(driveKeyCommand(key("Enter", { composing: true }), "other")).toBeNull();
    expect(driveKeyCommand(key("x"), "other")).toBeNull();
  });
});

describe("selection actions", () => {
  const mine = item({ name: "a.pdf" });
  const storeFile = item({ space: "store", name: "menu.pdf", ownerMemberId: BEN.id, createdByMemberId: BEN.id });
  const tree = world(ANA, [mine, storeFile]);
  const entry = (id: string) => {
    const found = tree.byKey.get(`item:${id}`);
    if (!found) throw new Error(`no entry ${id}`);
    return found;
  };

  test("online: what every selected entry allows; offline: downloading only", () => {
    expect(selectionActions([entry(mine.id)], "my", false)).toEqual(["move", "download", "trash"]);
    expect(selectionActions([entry(mine.id)], "my", true)).toEqual(["download"]);
  });

  test("a store file the actor may not move or trash leaves only what every entry allows", () => {
    expect(selectionActions([entry(storeFile.id)], "store", false)).toEqual(["download"]);
    expect(selectionActions([entry(mine.id), entry(storeFile.id)], "my", false)).toEqual(["download"]);
  });

  test("nothing selected offers nothing", () => {
    expect(selectionActions([], "my", false)).toEqual([]);
  });
});

describe("nav sections", () => {
  test("Shared shows when something is shared or it is open; Members' files for those who see everyone's", () => {
    expect(visibleSections({ canViewAll: false, sharedCount: 0, current: "my" })).toEqual(["my", "store", "recent", "starred", "trash", "apps"]);
    expect(visibleSections({ canViewAll: true, sharedCount: 2, current: "my" })).toEqual([
      "my", "store", "shared", "recent", "starred", "trash", "apps", "members",
    ]);
    expect(visibleSections({ canViewAll: false, sharedCount: 0, current: "shared" })).toContain("shared");
  });
});
