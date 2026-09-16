import { describe, expect, test } from "bun:test";
import {
  BODY_EXPANDED,
  CHROME,
  COLLAPSE_ROW_DY,
  COLLAPSE_SURFACE_DY,
  Z,
  bottomPad,
  chromeZIndex,
  expandedFootprint,
  minimizedFootprint,
} from "../../../lib/browser-shell/mobile/geometry";
import { canAutoMinimize, isChromeHidden, type ChromeInputs } from "../../../lib/browser-shell/mobile/use-chrome-state";

describe("chrome geometry (mobile-safari spec §6.1)", () => {
  test("expanded body is 94px and the collapse offsets match the spec", () => {
    expect(BODY_EXPANDED).toBe(94);
    expect(COLLAPSE_SURFACE_DY).toBe(66);
    expect(COLLAPSE_ROW_DY).toBe(53);
    expect(CHROME.toolbarH).toBe(44);
  });

  test("footprints add the bottom inset with a 4px minimum", () => {
    expect(bottomPad(0)).toBe(4);
    expect(bottomPad(34)).toBe(34);
    expect(expandedFootprint(0)).toBe(98);
    expect(expandedFootprint(34)).toBe(128);
    expect(minimizedFootprint(0)).toBe(32);
    expect(minimizedFootprint(34)).toBe(62);
  });

  test("z-index is 48 normally and 50 + N over N dialog pages (plan D28)", () => {
    expect(chromeZIndex(0)).toBe(48);
    expect(chromeZIndex(1)).toBe(51);
    expect(chromeZIndex(3)).toBe(53);
    expect(Z.shellDrawer).toBeGreaterThan(Z.overview);
    expect(Z.overview).toBeGreaterThan(chromeZIndex(9));
  });
});

const BASE: ChromeInputs = {
  keyboardOpen: false,
  editableFocusedInPage: false,
  immersive: false,
  overviewOpen: false,
  searchOpen: false,
  openDialogs: 0,
  foreignOverlayOpen: false,
  docked: false,
  autoMinimize: true,
  reducedMotion: false,
  navKey: "t_1|/manager/inventory|0",
};

describe("chrome state inputs (spec §7)", () => {
  test("visible by default", () => {
    expect(isChromeHidden(BASE)).toBe(false);
  });

  test.each([
    ["keyboardOpen", { keyboardOpen: true }],
    ["editableFocusedInPage", { editableFocusedInPage: true }],
    ["immersive", { immersive: true }],
    ["overviewOpen", { overviewOpen: true }],
    ["searchOpen", { searchOpen: true }],
    ["foreign overlay over a dialog", { openDialogs: 1, foreignOverlayOpen: true }],
  ] as const)("hidden while %s", (_name, patch) => {
    expect(isChromeHidden({ ...BASE, ...patch })).toBe(true);
  });

  test("a foreign overlay without a dialog does not hide the chrome", () => {
    expect(isChromeHidden({ ...BASE, foreignOverlayOpen: true })).toBe(false);
  });

  test("auto-minimize only for overlay routes with no dialog", () => {
    expect(canAutoMinimize(BASE)).toBe(true);
    expect(canAutoMinimize({ ...BASE, docked: true })).toBe(false);
    expect(canAutoMinimize({ ...BASE, autoMinimize: false })).toBe(false);
    expect(canAutoMinimize({ ...BASE, openDialogs: 1 })).toBe(false);
  });
});
