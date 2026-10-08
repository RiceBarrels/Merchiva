// The visible Back of a DynamicUIElement phone page (components/ui/dynamic-ui-element-back.tsx):
// shown only on the /manager phone layout, in the top-left corner below the page's safe top, and
// wired to the same handler as the hidden [data-dialog-back] button the shell, popstate and
// Android back click (lib/browser-shell/shell-dom.ts closeTopDialog).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CORNER_BUTTON_CLASS, CORNER_OFFSET_PX } from "@/components/ui/corner-button";
import {
  DynamicUIElementBack,
  DynamicUIElementBackBar,
  dialogBackTop,
  dialogBackVisible,
  dialogSafeTop,
} from "@/components/ui/dynamic-ui-element-back";

const ROOT = join(import.meta.dir, "..", "..", "..");
const PAGE_SRC = readFileSync(join(ROOT, "components/ui/dynamic-ui-element.tsx"), "utf8");

function bar(title: string, exiting = false): string {
  return renderToStaticMarkup(h(DynamicUIElementBackBar, { title, onBack: () => {}, exiting }));
}

describe("dialogBackVisible", () => {
  test("only the browser shell's phone layout shows the visible Back", () => {
    expect(dialogBackVisible("mobile")).toBe(true);
  });

  test("the desktop shell, the legacy MobileShell and the device surfaces do not", () => {
    // Desktop never renders the phone page; no shell is marked under MobileShell, /store or /personal.
    expect(dialogBackVisible("desktop")).toBe(false);
    expect(dialogBackVisible(null)).toBe(false);
  });
});

describe("safe top", () => {
  test("takes the larger of the CSS inset and the plugin's inset", () => {
    expect(dialogSafeTop(0)).toBe("max(env(safe-area-inset-top, 0px), 0px)");
    expect(dialogSafeTop(47)).toBe("max(env(safe-area-inset-top, 0px), 47px)");
  });

  test("a missing or bogus plugin value falls back to the CSS inset alone", () => {
    expect(dialogSafeTop(Number.NaN)).toBe("max(env(safe-area-inset-top, 0px), 0px)");
    expect(dialogSafeTop(-5)).toBe("max(env(safe-area-inset-top, 0px), 0px)");
  });

  test("the Back sits the corner offset below the same safe top", () => {
    expect(dialogBackTop(47)).toBe(`calc(max(env(safe-area-inset-top, 0px), 47px) + ${CORNER_OFFSET_PX}px)`);
  });
});

describe("DynamicUIElementBackBar", () => {
  test("a corner button labelled Go back, then the page title in a pill", () => {
    const html = bar("Edit product");
    expect(html).toContain('aria-label="Go back"');
    expect(html).toContain('type="button"');
    expect(html).toContain(CORNER_BUTTON_CLASS);
    expect(html).toContain("Edit product");
    expect(html.indexOf("Go back")).toBeLessThan(html.indexOf("Edit product"));
  });

  test("no title, no pill", () => {
    const html = bar("");
    expect(html).toContain('aria-label="Go back"');
    expect(html).not.toContain("truncate");
  });

  test("pinned to the physical top-left below the safe top, LTR in every locale", () => {
    const html = bar("Edit product");
    expect(html).toContain(`top:${dialogBackTop(0)}`);
    expect(html).toContain(`left:${CORNER_OFFSET_PX}px`);
    expect(html).toContain("direction:ltr");
    expect(html).toContain('dir="auto"');
  });

  test("disabled while the page slides out, so it cannot close twice", () => {
    expect(bar("Edit product", true)).toMatch(/<button[^>]*disabled=""/);
    expect(bar("Edit product", false)).not.toMatch(/<button[^>]*disabled=""/);
  });

  test("is not a [data-dialog-back] button (closeTopDialog clicks the page's first one)", () => {
    expect(bar("Edit product")).not.toContain("data-dialog-back");
  });
});

describe("DynamicUIElementBack", () => {
  test("renders nothing without a mounted browser shell", () => {
    // The server snapshot of useMountedBrowserShell is null, as it is under MobileShell and on device surfaces.
    expect(renderToStaticMarkup(h(DynamicUIElementBack, { title: "Edit product", onBack: () => {}, exiting: false }))).toBe("");
  });
});

describe("the phone page keeps the [data-dialog-back] contract", () => {
  test("the hidden [data-dialog-back] button and the visible Back run the same handler", () => {
    expect(PAGE_SRC).toContain('<button data-dialog-back onClick={goBack} className="hidden" />');
    expect(PAGE_SRC).toContain("<DynamicUIElementBack title={mobileTitle} onBack={goBack} exiting={exiting} />");
  });

  test("Back slides the page out, then clicks its hidden Close", () => {
    const handler = /const goBack = React\.useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\);/.exec(PAGE_SRC)?.[1] ?? "";
    expect(handler).toContain("setExiting(true);");
    expect(handler).toContain("closeRef.current?.click()");
    expect(PAGE_SRC).toContain('<DialogPrimitive.Close ref={closeRef} className="hidden" />');
  });

  test("the visible Back sits outside the page's scroller, so it never scrolls away", () => {
    const back = PAGE_SRC.indexOf("<DynamicUIElementBack ");
    const scroller = PAGE_SRC.indexOf('<div className="flex-1 overflow-y-auto');
    expect(back).toBeGreaterThan(-1);
    expect(scroller).toBeGreaterThan(back);
  });

  test("the content reserve clears the same safe top as the Back", () => {
    expect(PAGE_SRC).toContain("paddingTop: `calc(64px + ${dialogSafeTop(getSafeAreaInsets().top)})`");
  });

  test("the safe top is the scroller's padding, not a spacer above an h-full child", () => {
    // A spacer child pushed a full-height page (the channel chat's composer) below the screen.
    expect(PAGE_SRC).not.toContain("style={{ height: dialogSafeTop(");
  });
});
