import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Structural guards for the /manager phone chrome (components/browser-shell/mobile-app). Like the
 * desktop frame guards (browser-desktop/toolbar-composition.test.ts) they read the sources, because
 * what they protect are layout contracts with other code:
 *   - exactly one #mobile-content holding TabPageOutlet once, tracked by useTabContentHost, and
 *     never given a transform or radius by the chrome (DynamicUIElement writes those inline);
 *   - the menu button lives inside #mobile-content, after the outlet, so dialog pages cover it;
 *   - no browser UI and no global key, history or title writes;
 *   - the swipe listeners claim nothing until they know (passive start, non-passive move).
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const APP = join(ROOT, "components", "browser-shell", "mobile-app");

function read(...parts: string[]): string {
  return readFileSync(join(...parts), "utf8");
}

/** Comments describe these contracts, so the checks look at code only. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

/** The JSX opening tag that contains `marker`. */
function openingTag(text: string, marker: string): string {
  const at = text.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const start = text.lastIndexOf("<", at);
  const end = text.indexOf(">\n", at);
  return text.slice(start, end);
}

describe("phone chrome frame", () => {
  const chrome = code(read(APP, "mobile-app-chrome.tsx"));

  test("one #mobile-content, one TabPageOutlet, tracked by useTabContentHost", () => {
    expect(countOf(chrome, 'id="mobile-content"')).toBe(1);
    expect(countOf(chrome, "<TabPageOutlet>")).toBe(1);
    expect(countOf(chrome, "useTabContentHost(contentRef)")).toBe(1);
    expect(chrome).toContain('data-shell-frame="mobile"');
  });

  test("the chrome moves the push layer around #mobile-content, never #mobile-content itself", () => {
    const tag = openingTag(chrome, 'id="mobile-content"');
    expect(tag).not.toContain("motion");
    expect(tag).not.toContain("transform");
    expect(tag).not.toContain("borderRadius");
    expect(tag).toContain('style={{ "--shell-scroll-pad": "0px" } as CSSProperties}');
    // The push layer is the element that carries the motion values.
    expect(chrome).toContain("style={{ bottom, x: contentX, borderRadius: contentCorners, boxShadow: contentLift }}");
  });

  test("the menu button sits inside #mobile-content, after the outlet", () => {
    const content = chrome.indexOf('id="mobile-content"');
    const outlet = chrome.indexOf("<TabPageOutlet>");
    const button = chrome.indexOf("<MenuButton ");
    const contentEnd = chrome.indexOf("</div>", outlet);
    expect(content).toBeGreaterThan(-1);
    expect(outlet).toBeGreaterThan(content);
    expect(button).toBeGreaterThan(outlet);
    expect(button).toBeLessThan(contentEnd);
  });

  test("no browser UI: no bottom chrome, tabs, omnibox, search, edge-back or page menu", () => {
    for (const piece of ["BottomChrome", "TabOverview", "SearchSheet", "EdgeBackGesture", "PageMenuSheet", "BookmarksSheet", "usePillSwipe"]) {
      expect(chrome, `${piece} belongs to the old Safari-style chrome`).not.toContain(piece);
    }
  });

  test("the chrome writes no history, document title or global listener", () => {
    for (const forbidden of ["document.title", "window.addEventListener", "history.pushState", "history.replaceState"]) {
      expect(chrome, `${forbidden} belongs to core, not the chrome`).not.toContain(forbidden);
    }
  });

  test("Android back closes the drawer and the Mr. Merchiva overlay", () => {
    expect(chrome).toContain("useShellBackHandler(() => {\n    close();\n    return true;\n  }, open);");
    // The overlay is mounted beside the shell provider, so its handler registers from here.
    expect(countOf(chrome, "useMerchivaBackHandler();")).toBe(1);
  });

  test("the manager shell mounts it below the breakpoint", () => {
    const shell = code(read(ROOT, "components", "browser-shell", "manager-shell.tsx"));
    expect(shell).toContain("<MobileAppChrome>{children}</MobileAppChrome>");
    expect(shell).not.toContain("MobileBrowserChrome");
  });
});

describe("page swipe listeners", () => {
  const hook = code(read(APP, "use-page-swipe.ts"));

  test("touchstart and the touch's end are passive; only touchmove may prevent, and only once decided", () => {
    expect(hook).toContain('frame.addEventListener("touchstart", onTouchStart, { passive: true });');
    expect(hook).toContain('frame.addEventListener("touchmove", onTouchMove, { passive: false });');
    // The end is heard on the touch's own target, which still receives it after leaving the document.
    expect(hook).toContain('target.addEventListener("touchend", onTargetEnd, { passive: true });');
    expect(hook).toContain('target.addEventListener("touchcancel", cancel, { passive: true });');
    // The decided-but-unclaimed touchmove, the claimed touchmove, the swallowed click.
    expect(countOf(hook, "preventDefault()")).toBe(3);
    expect(hook).toContain("if (!claimReached(dx)) return;");
  });

  test("the page-swipe rules come from lib/gestures/page-swipe.ts", () => {
    for (const rule of ["swipeStartAllowed(", "hasHorizontalScroller(", "lockAxis(", "swipeDirection(", "releaseVelocity("]) {
      expect(hook).toContain(rule);
    }
  });
});
