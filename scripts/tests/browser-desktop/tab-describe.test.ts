import { describe, expect, test } from "bun:test";
import { describeUrl } from "@/components/browser-shell/desktop/tab-describe";
import { labelForUrl } from "@/lib/browser-shell/mobile/labels";
import { titleForUrl } from "@/lib/browser-shell/routes";

/*
 * The New Tab page is the home page, so every surface that names it says "Home": the tab strip
 * (core `titleForUrl`), the mobile lists (`labelForUrl`) and the desktop lists that go through
 * `describeUrl` — the omnibox "Open tabs" group, tab search and the Back/Forward history menu.
 * Only the "+" affordances say "New Tab", from the separate `browser.actions.newTab` key.
 */

const t = (key: string) => key;

describe("desktop list titles", () => {
  test("the home page reads as Home, exactly like the tab strip and the mobile chrome", () => {
    const desktop = describeUrl("/manager/new-tab", undefined, t);
    expect(desktop.title).toBe("nav.home");
    expect(desktop.title).toBe(titleForUrl("/manager/new-tab", undefined, t));
    expect(desktop.title).toBe(labelForUrl("/manager/new-tab", undefined, t).title);
    expect(describeUrl("/manager/new-tab?q=1", undefined, t).title).toBe("nav.home");
  });

  test("the isNewTab flag stays, so bookmarking and the blank address still key off it", () => {
    expect(describeUrl("/manager/new-tab", undefined, t).isNewTab).toBe(true);
    // A page title does not make it a normal page, and does not make a normal page the New Tab.
    expect(describeUrl("/manager/new-tab", "Pinned", t).isNewTab).toBe(true);
    expect(describeUrl("/manager/inventory", undefined, t).isNewTab).toBe(false);
  });

  test("the rest of the precedence is unchanged: page title, registry, segment, Untitled", () => {
    expect(describeUrl("/manager/new-tab", "  Pinned  ", t).title).toBe("Pinned");
    expect(describeUrl("/manager/inventory", undefined, t).title).toBe("nav.inventory");
    // The dashboard left the nav but keeps its own title, never nav.home.
    expect(describeUrl("/manager/dashboard", undefined, t).title).toBe("browser.routes.dashboard");
    expect(describeUrl("/manager/nowhere-here", undefined, t).title).toBe("Nowhere here");
    expect(describeUrl("/", undefined, t).title).toBe("browser.untitled");
  });
});
