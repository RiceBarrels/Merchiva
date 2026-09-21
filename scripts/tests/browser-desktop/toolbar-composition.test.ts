import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Structural guards for the desktop chrome after the account menu moved into the sidebar and the
 * section chips left the bookmarks bar. They read the sources because the pieces they protect are
 * layout contracts (plan §B2.2) that a rendering test could not state any more directly:
 *   - exactly one #desktop-content, containing TabPageOutlet once, with useTabContentHost on it
 *     and no inline transform / borderRadius / overflow (DynamicUIElement owns those);
 *   - the content panel is never conditional, so toggling the sidebar cannot remount the page;
 *   - the toolbar's composition and order, with no profile button left behind;
 *   - the bookmarks bar holds user bookmarks only.
 */

const DESKTOP = join(import.meta.dir, "..", "..", "..", "components", "browser-shell", "desktop");

function source(...parts: string[]): string {
  return readFileSync(join(DESKTOP, ...parts), "utf8");
}

function countOf(text: string, needle: string | RegExp): number {
  if (typeof needle === "string") return text.split(needle).length - 1;
  return text.match(new RegExp(needle, needle.flags.includes("g") ? needle.flags : `${needle.flags}g`))?.length ?? 0;
}

/** Comments describe these contracts, so the "never writes …" checks look at code only. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("toolbar composition", () => {
  const toolbar = source("toolbar.tsx");

  test("the sidebar toggle is the first control, then the Chrome-style row", () => {
    const order = ["<SidebarToggle />", "<NavButtons />", "<Omnibox />", "<MerchivaButton />", "<NotificationsButton />", "<AppMenu />"];
    const positions = order.map((tag) => {
      const index = toolbar.indexOf(tag);
      expect(index, `${tag} is missing from the toolbar`).toBeGreaterThan(-1);
      return index;
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test("the profile button is gone and its file with it", () => {
    expect(toolbar).not.toContain("ProfileMenu");
    expect(existsSync(join(DESKTOP, "profile-menu.tsx"))).toBe(false);
  });

  test("nothing the profile menu offered became unreachable", () => {
    // Every row of the old menu now lives in the sidebar's workspace switcher.
    const switcher = source("sidebar", "workspace-switcher.tsx");
    for (const needle of [
      "StoreSwitchList", // store list
      "CreateStoreForm", // create store
      "AccountList", // accounts
      "workspace.addAccount", // add account
      "nav.settings", // settings
      "BackToDeviceLink", // back to the store / personal device
      "SwitchModeLink", // switch mode
      "workspace.signOut", // sign out
      "components.sidebar.version", // version line
    ]) {
      expect(switcher, `${needle} is missing from the sidebar workspace switcher`).toContain(needle);
    }
    // Language and appearance were never in the profile menu; they stay in the app menu.
    const appMenu = source("app-menu.tsx");
    expect(appMenu).toContain("common.language");
    expect(appMenu).toContain("browserDesktop.menu.appearance");
  });

  test("the toolbar toggle collapses the rail, the same state the in-sidebar control writes", () => {
    const toggle = source("sidebar", "sidebar-toggle.tsx");
    // Both controls read `collapsed` from useSidebarState and write it through
    // toggleSidebarCollapsed, so clicking either keeps the other in step.
    expect(toggle).toContain("const { hidden, collapsed } = useSidebarState();");
    expect(toggle).toContain("toggleSidebarCollapsed()");
    // Same icon pair as the control at the foot of the sidebar.
    expect(toggle).toContain("PanelLeftClose");
    expect(toggle).toContain("PanelLeftOpen");
    // Hiding stays on the shortcut — but while the sidebar IS hidden this button
    // is the only pointer way back, so it shows it again.
    expect(toggle).toContain("hidden ? setSidebarHidden(false) : toggleSidebarCollapsed()");
    expect(toggle).toContain('useShortcutLabel(TOGGLE_SIDEBAR_COMMAND)');
    expect(toggle).toContain("aria-controls={hidden ? undefined : SIDEBAR_ELEMENT_ID}");
    expect(toggle).toContain("aria-expanded={!railed}");
  });

  test("the in-sidebar control writes the same collapsed state", () => {
    const sidebar = source("sidebar", "sidebar.tsx");
    expect(sidebar).toContain("<CollapseControl collapsed={collapsed} onToggle={onToggleCollapse} />");
    expect(source("desktop-browser-chrome.tsx")).toContain(
      "onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}",
    );
  });
});

describe("desktop frame layout", () => {
  // Comments quote the contract (`<TabPageOutlet>`, borderRadius …), so these read the code alone.
  const chrome = code(source("desktop-browser-chrome.tsx"));

  test("one content element, one TabPageOutlet, tracked by useTabContentHost", () => {
    expect(countOf(chrome, "id={DESKTOP_CONTENT_ID}")).toBe(1);
    expect(countOf(chrome, "<TabPageOutlet>")).toBe(1);
    expect(countOf(chrome, "useTabContentHost(contentRef)")).toBe(1);
    expect(chrome).toContain('ref={contentRef}');
  });

  test("the content element leaves transform, border radius and overflow to DynamicUIElement", () => {
    expect(chrome).not.toContain("style={{");
    expect(chrome).not.toContain("borderRadius");
    expect(chrome).not.toContain("transform:");
  });

  test("the sidebar panel is conditional but the content panel keeps its slot", () => {
    expect(chrome).toContain("const sidebarSlot = sidebarHidden ? null : (");
    expect(chrome).toContain("const handleSlot = sidebarHidden ? null : (");
    // One <ResizablePanel for the sidebar, one for the content (the Group tag doesn't count),
    // and the content one is not guarded.
    expect(countOf(chrome, /<ResizablePanel[\s>]/)).toBe(2);
    const contentSlot = chrome.indexOf("const contentSlot = (");
    expect(contentSlot).toBeGreaterThan(-1);
    expect(chrome.slice(contentSlot, contentSlot + 80)).not.toContain("sidebarHidden");
    // Stable keys, so reordering the slots moves the panels instead of remounting the page.
    expect(chrome).toContain("key={SIDEBAR_PANEL_ID}");
    expect(chrome).toContain("key={SIDEBAR_CONTENT_PANEL_ID}");
  });

  test("RTL renders the panels in visual order with the group pinned to LTR", () => {
    // react-resizable-panels 4.11.1 resizes by DOM order and a raw clientX delta, so visual order
    // and DOM order have to agree for the drag (and the keyboard) to track the pointer.
    expect(chrome).toContain('dir={rtl ? "ltr" : undefined}');
    expect(chrome).toContain("{rtl ? [contentSlot, handleSlot, sidebarSlot] : [sidebarSlot, handleSlot, contentSlot]}");
    // Both regions re-declare the real direction, so only the group is LTR.
    expect(chrome).toContain("dir={dir}");
    expect(source("sidebar", "sidebar.tsx")).toContain("dir={dir}");
    // The saved layout is keyed by the rendered order, so RTL keeps its own entry.
    expect(chrome).toContain("rtl ? [SIDEBAR_CONTENT_PANEL_ID, SIDEBAR_PANEL_ID] : [SIDEBAR_PANEL_ID, SIDEBAR_CONTENT_PANEL_ID]");
  });

  test("the chrome writes no history, document title or global key listener", () => {
    const body = code(chrome);
    for (const forbidden of ["document.title", "window.addEventListener", "history.pushState", "history.replaceState"]) {
      expect(body, `${forbidden} belongs to core, not the chrome`).not.toContain(forbidden);
    }
  });

  test("the sidebar is desktop-only: the mobile chrome never mounts it", () => {
    const mobile = join(import.meta.dir, "..", "..", "..", "components", "browser-shell", "mobile", "mobile-browser-chrome.tsx");
    expect(readFileSync(mobile, "utf8")).not.toContain("BrowserSidebar");
  });
});

describe("bookmarks bar", () => {
  const bar = source("bookmarks-bar.tsx");

  test("section chips and their folder menus are gone", () => {
    for (const needle of ["useNavSections", "NavSection", "SectionChip", "SectionMenuItems", "DropdownMenuSub", "data-section-href"]) {
      expect(bar, `${needle} should have moved to the sidebar`).not.toContain(needle);
    }
  });

  test("user bookmarks, their overflow menu and the context menu stay", () => {
    for (const needle of ["useBookmarks", "data-bookmark-id", "OverflowMenu", "browserDesktop.bookmarks.rename", "BookmarkEditForm"]) {
      expect(bar).toContain(needle);
    }
  });

  test("an empty bar renders nothing, and the visibility setting still gates it", () => {
    expect(bar).toContain("if (visibleBookmarks.length === 0) return null;");
    const chrome = source("desktop-browser-chrome.tsx");
    expect(chrome).toContain("{barVisible ? <BookmarksBar /> : null}");
    expect(chrome).toContain('useShellCommand("toggleBookmarksBar"');
  });
});

describe("sidebar sources", () => {
  const sidebar = source("sidebar", "sidebar.tsx");

  test("rows come from the core registry, not the legacy hardcoded nav", () => {
    expect(sidebar).toContain("useNavSections()");
    expect(sidebar).not.toContain("navItems");
    expect(sidebar).not.toContain("usePermissions");
    expect(sidebar).not.toContain("useDeviceApps");
  });

  test("rows are next/link anchors, so core turns Mod-click and middle-click into tabs", () => {
    expect(sidebar).toContain('import Link from "next/link"');
    expect(sidebar).not.toContain("router.push");
    expect(sidebar).toContain('aria-current={active ? "page" : undefined}');
  });

  test("the sub-page disclosure honours prefers-reduced-motion, like its chevron", () => {
    // motion ignores the OS setting unless asked, and this app installs no MotionConfig.
    expect(sidebar).toContain("useReducedMotion()");
    expect(sidebar).toContain("transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: [0.4, 0, 0.2, 1] }}");
    expect(sidebar).toContain("motion-reduce:transition-none");
  });

  test("the nav landmark, the rail tooltips and the sub-page disclosure are labelled", () => {
    expect(sidebar).toContain('aria-label={t("browserDesktop.sidebar.nav")}');
    expect(sidebar).toContain('aria-label={t("browserDesktop.sidebar.label")}');
    expect(sidebar).toContain("aria-expanded={expanded}");
    expect(sidebar).toContain('<TooltipContent side="inline-end">');
  });
});
