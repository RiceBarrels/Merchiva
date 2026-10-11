import { describe, expect, test } from "bun:test";
import {
  NATIVE_BACK_INTERACTIVE_SELECTOR,
  nativeBackGuarded,
  nativeBackGuardedPath,
  shouldBlockNativeBack,
} from "@/lib/gestures/native-back";
import { SAFARI_EDGE_PX } from "@/lib/browser-shell/mobile-app/drawer";

const plain = { closest: () => null };
const button = { closest: (selector: string) => (selector === NATIVE_BACK_INTERACTIVE_SELECTOR ? {} : null) };

describe("nativeBackGuardedPath", () => {
  test("guards the app surfaces and their sub-routes", () => {
    for (const path of ["/manager", "/manager/inventory", "/store", "/store/x", "/personal", "/choose"]) {
      expect(nativeBackGuardedPath(path)).toBe(true);
    }
  });

  test("leaves marketing pages and look-alike prefixes alone", () => {
    for (const path of ["/", "/en", "/zh-cn/pricing", "/storefront", "/managers", "/licenses"]) {
      expect(nativeBackGuardedPath(path)).toBe(false);
    }
  });
});

describe("nativeBackGuarded", () => {
  test("a personal-mode device is guarded on every route", () => {
    expect(nativeBackGuarded("/", "personal")).toBe(true);
    expect(nativeBackGuarded("/licenses", "personal")).toBe(true);
  });

  test("other modes fall back to the path rule", () => {
    expect(nativeBackGuarded("/licenses", "admin")).toBe(false);
    expect(nativeBackGuarded("/licenses", null)).toBe(false);
    expect(nativeBackGuarded("/manager/channel", "admin")).toBe(true);
  });
});

describe("shouldBlockNativeBack", () => {
  test("blocks a single-finger edge touch on plain content", () => {
    expect(shouldBlockNativeBack(1, 5, 390, plain)).toBe(true);
    expect(shouldBlockNativeBack(1, 385, 390, null)).toBe(true);
  });

  test("uses the shell's Safari edge band", () => {
    expect(shouldBlockNativeBack(1, SAFARI_EDGE_PX - 1, 390, plain)).toBe(true);
    expect(shouldBlockNativeBack(1, SAFARI_EDGE_PX, 390, plain)).toBe(false);
    expect(shouldBlockNativeBack(1, 390 - SAFARI_EDGE_PX + 1, 390, plain)).toBe(true);
  });

  test("lets the middle of the screen, multi-touch and interactive elements through", () => {
    expect(shouldBlockNativeBack(1, 195, 390, plain)).toBe(false);
    expect(shouldBlockNativeBack(2, 5, 390, plain)).toBe(false);
    expect(shouldBlockNativeBack(1, 5, 390, button)).toBe(false);
  });
});
