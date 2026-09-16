import { describe, expect, test } from "bun:test";
import { CHROME, CHROME_COARSE } from "@/components/browser-shell/desktop/chrome-geometry";
import { computeTabStripLayout, tabContentMode } from "@/components/browser-shell/desktop/use-tab-strip-layout";

describe("computeTabStripLayout", () => {
  test("tabs take the standard width while there is room", () => {
    expect(computeTabStripLayout(2000, 0, 3, null)).toEqual({ unpinnedWidth: CHROME.TAB_STANDARD_W, overflow: false });
  });

  test("tabs shrink evenly before the strip overflows", () => {
    expect(computeTabStripLayout(600, 0, 5, null)).toEqual({ unpinnedWidth: 120, overflow: false });
  });

  test("pinned tabs take their fixed width first", () => {
    expect(computeTabStripLayout(600, 2, 4, null)).toEqual({ unpinnedWidth: Math.floor((600 - 2 * CHROME.TAB_PINNED_W) / 4), overflow: false });
  });

  test("below the minimum width tabs clamp and the tablist scrolls", () => {
    expect(computeTabStripLayout(400, 0, 10, null)).toEqual({ unpinnedWidth: CHROME.TAB_MIN_W, overflow: true });
  });

  test("a frozen width survives a close (close-freeze)", () => {
    expect(computeTabStripLayout(2000, 0, 2, 150)).toEqual({ unpinnedWidth: 150, overflow: false });
    expect(computeTabStripLayout(200, 0, 2, 150)).toEqual({ unpinnedWidth: 150, overflow: true });
  });

  test("a strip of only pinned tabs overflows when they don't fit", () => {
    expect(computeTabStripLayout(100, 3, 0, null)).toEqual({ unpinnedWidth: CHROME.TAB_STANDARD_W, overflow: true });
    expect(computeTabStripLayout(400, 3, 0, null)).toEqual({ unpinnedWidth: CHROME.TAB_STANDARD_W, overflow: false });
  });

  test("coarse density (touch at >=1024px) uses larger minimums", () => {
    expect(computeTabStripLayout(400, 0, 10, null, CHROME_COARSE)).toEqual({ unpinnedWidth: CHROME_COARSE.TAB_MIN_W, overflow: true });
    expect(CHROME_COARSE.TAB_H).toBeGreaterThanOrEqual(36);
  });
});

describe("tabContentMode", () => {
  test("wide tabs show icon, title and close", () => {
    expect(tabContentMode(240, false)).toEqual({ icon: true, title: true, close: "always" });
  });

  test("medium inactive tabs reveal close on hover; the active one always shows it", () => {
    expect(tabContentMode(100, false)).toEqual({ icon: true, title: true, close: "hover" });
    expect(tabContentMode(100, true)).toEqual({ icon: true, title: true, close: "always" });
  });

  test("narrow tabs: active shows only close, inactive only the icon", () => {
    expect(tabContentMode(60, true)).toEqual({ icon: false, title: false, close: "always" });
    expect(tabContentMode(60, false)).toEqual({ icon: true, title: false, close: "never" });
  });

  test("coarse pointers never hide close behind hover", () => {
    expect(tabContentMode(100, false, true)).toEqual({ icon: true, title: true, close: "always" });
    expect(tabContentMode(80, false, true)).toEqual({ icon: true, title: false, close: "never" });
    expect(tabContentMode(80, true, true)).toEqual({ icon: false, title: false, close: "always" });
  });
});
