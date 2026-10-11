// Isolated fixture for scripts/tests/notify/manager-dots.test.ts — NOT auto-discovered by
// `bun test`. Server-renders the /manager shell's notification-dot placements (desktop sidebar
// rows and icon rail, the phone menu button, the store lists, the New Tab launcher) with the dot
// selectors mocked, so it checks where each dot lands and which question each entry point asks.
// Mr. Merchiva's dock clearing runs through Ink's reconciler (this suite has no DOM), so its
// effect runs. Module mocks stand in for Next's router and the dot provider, so it runs in its
// own process.

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { render } from "ink-testing-library";
import { DOT_FILTERS, type DotEntry, type DotFilter, type DotQuery } from "@/lib/notifications/dots";

let pathname = "/manager/sales";
let dotFor: (query: DotQuery) => boolean = () => false;
let anyDot = false;
let otherOrgs = new Set<string>();
let entries: DotEntry[] = [];
let attended = true;
const queries: DotQuery[] = [];
const filters: (DotFilter | undefined)[] = [];
const marked: DotQuery[] = [];

/** Stable, like the provider's: useMarkDotRead returns the same function every render. */
const MARK = (query: DotQuery) => {
  marked.push(query);
};

const ROUTER = { push: () => {}, replace: () => {}, back: () => {}, forward: () => {}, refresh: () => {}, prefetch: () => {} };

mock.module("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({}),
  useSelectedLayoutSegment: () => null,
  useSelectedLayoutSegments: () => [],
  redirect: () => {},
  permanentRedirect: () => {},
  notFound: () => {},
}));
mock.module("next/link", () => ({
  default: function Link(props: { href: string; children?: ReactNode } & Record<string, unknown>) {
    const { href, children, ...rest } = props;
    delete rest.prefetch; // a Next-only prop, not an anchor attribute
    return createElement("a", { href, ...rest }, children);
  },
}));
mock.module("@/lib/nav-mode", () => ({
  useNavMode: () => ["sidebar", () => {}],
  getNavMode: () => "sidebar",
  setNavMode: () => {},
}));
mock.module("@/lib/spacetimedb/hooks/useDeviceApps", () => ({
  useDeviceApps: () => ({ installed: new Set(["sales", "forms"]), isReady: true }),
}));
mock.module("@/lib/spacetimedb/hooks/useDocs", () => ({
  useRecentDocuments: () => ({ items: [], ready: true }),
  useDocsBackendStatus: () => "ready",
}));
mock.module("@/lib/notifications/dots-context", () => ({
  useDot: (query: DotQuery) => {
    queries.push(query);
    return dotFor(query);
  },
  useAnyDot: (filter?: DotFilter) => {
    filters.push(filter);
    return anyDot;
  },
  useOtherOrgDot: (id: string | null | undefined) => !!id && otherOrgs.has(id),
  useNotificationDots: () => ({
    state: { entries, alertOnlyIds: [], otherOrgIds: otherOrgs },
    sections: [],
    viewer: { surface: "manager", shared: false, dotsVisible: true, alerts: true, personalDevice: true, accountHex: "ab" },
    markRead: () => {},
  }),
  useMarkDotRead: () => MARK,
  useDocumentAttended: () => attended,
  useConversationDot: () => false,
  NotificationDotsProvider: ({ children }: { children: ReactNode }) => children,
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { BrowserSidebar } = await import("@/components/browser-shell/desktop/sidebar/sidebar");
const { MenuButton } = await import("@/components/browser-shell/mobile-app/menu-button");
const { StoreSwitchList } = await import("@/components/browser-shell/shared/workspace-menu");
const { NewTabPage } = await import("@/components/browser-shell/core/new-tab-page");
const { useMerchivaDotClearing } = await import("@/components/merchiva-dock/dock-dots");

const DOT = "data-notification-dot";

/** The whole <a …>…</a> whose href is `href` (the mocked next/link renders a plain anchor). */
function anchor(html: string, href: string): string {
  const start = html.indexOf(`<a href="${href}"`);
  expect(start, `no link to ${href}`).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</a>", start) + 4);
}

function sameQuery(a: DotQuery, b: DotQuery): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

beforeEach(() => {
  pathname = "/manager/sales";
  dotFor = () => false;
  anyDot = false;
  otherOrgs = new Set();
  entries = [];
  attended = true;
  queries.length = 0;
  filters.length = 0;
  marked.length = 0;
});

describe("desktop sidebar", () => {
  test("a section row's dot sits on its icon, not the row corner, and names the state", () => {
    dotFor = (q) => "href" in q && q.href === "/manager/inventory" && q.level !== "child";
    const html = renderToStaticMarkup(createElement(BrowserSidebar, { collapsed: false }));
    const row = anchor(html, "/manager/inventory");
    expect(row).toContain(DOT);
    // The dot is inside the icon's own relative box (NavPresence keeps the row's corner).
    expect(row).toMatch(/<span class="relative flex shrink-0"><svg[^]*?data-notification-dot/);
    expect(row).toContain("aria-label=");
    expect(row).toContain("dark:ring-card");
    // No other row lights up.
    expect(html.split(DOT).length - 1).toBe(1);
    expect(anchor(html, "/manager/sales")).not.toContain("aria-label=");
  });

  test("the active (inverted) row swaps the ring for the foreground", () => {
    pathname = "/manager/sales";
    dotFor = (q) => "href" in q && q.href === "/manager/sales" && q.level !== "child";
    const html = renderToStaticMarkup(createElement(BrowserSidebar, { collapsed: false }));
    const row = anchor(html, "/manager/sales");
    expect(row).toContain('aria-current="page"');
    expect(row).toContain("ring-foreground");
  });

  test("an open section's sub-pages carry their own dots, after the label", () => {
    pathname = "/manager/inventory";
    dotFor = (q) => "href" in q && q.href === "/manager/suppliers" && q.level === "child";
    const html = renderToStaticMarkup(createElement(BrowserSidebar, { collapsed: false }));
    const sub = anchor(html, "/manager/suppliers");
    expect(sub).toMatch(/>[^<]+<span aria-hidden="true" data-notification-dot=""[^>]*inline-block/);
    // The open section leaves its visible sub-pages' rows to them.
    expect(queries.some((q) => sameQuery(q, { href: "/manager/inventory", childrenVisible: true }))).toBe(true);
  });

  test("the icon rail rolls the sub-pages up to the section icon", () => {
    pathname = "/manager/inventory";
    dotFor = (q) => "href" in q && q.href === "/manager/inventory" && q.level !== "child" && !("childrenVisible" in q && q.childrenVisible);
    const html = renderToStaticMarkup(createElement(BrowserSidebar, { collapsed: true }));
    expect(queries.some((q) => sameQuery(q, { href: "/manager/inventory", childrenVisible: false }))).toBe(true);
    expect(queries.some((q) => "level" in q && q.level === "child")).toBe(false);
    expect(anchor(html, "/manager/inventory")).toContain(DOT);
  });
});

describe("phone menu button", () => {
  test("one dot for every drawer row, asked through DOT_FILTERS.navRows, no count", () => {
    anyDot = true;
    const html = renderToStaticMarkup(createElement(MenuButton, { expanded: false, onOpen: () => {} }));
    expect(filters).toEqual([DOT_FILTERS.navRows]);
    expect(html).toContain(DOT);
    expect(html).not.toMatch(/>\d+\+?</);
    anyDot = false;
    expect(renderToStaticMarkup(createElement(MenuButton, { expanded: false, onOpen: () => {} }))).not.toContain(DOT);
  });
});

describe("store lists", () => {
  const stores = [
    { id: "org-a", name: "Alpha", logoUrl: null },
    { id: "org-b", name: "Bravo", logoUrl: null },
    { id: "org-c", name: "Charlie", logoUrl: null },
  ];

  test("another store with something unread gets a dot on its row; the current store never does", () => {
    otherOrgs = new Set(["org-a", "org-b"]);
    const html = renderToStaticMarkup(
      createElement(StoreSwitchList, { stores: stores as never, currentOrgId: "org-a", onSelect: () => {} }),
    );
    const rows = html.split("<button").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).not.toContain(DOT);
    expect(rows[1]).toContain(DOT);
    expect(rows[1]).toContain("aria-label=");
    expect(rows[2]).not.toContain(DOT);
  });
});

describe("New Tab launcher", () => {
  test("a tile's dot stands for its section and sub-pages", () => {
    dotFor = (q) => "href" in q && q.href === "/manager/inventory" && q.level === undefined;
    const html = renderToStaticMarkup(createElement(NewTabPage));
    expect(queries.some((q) => sameQuery(q, { href: "/manager/inventory" }))).toBe(true);
    expect(anchor(html, "/manager/inventory")).toContain(DOT);
    expect(anchor(html, "/manager/sales")).not.toContain(DOT);
  });
});

describe("Mr. Merchiva's dock", () => {
  /** An unread row as the provider lists it; only `id` and `app` matter here. */
  function entry(id: string, app: string): DotEntry {
    return { id, app } as DotEntry;
  }

  function Probe({ open }: { open: boolean; tick?: number }) {
    useMerchivaDotClearing(open);
    return null;
  }

  test("a closed dock reads nothing; opening it reads his rows", () => {
    entries = [entry("n1", "merchiva"), entry("n2", "channel")];
    const view = render(createElement(Probe, { open: false }));
    expect(marked).toEqual([]);
    view.rerender(createElement(Probe, { open: true }));
    expect(marked).toEqual([{ app: "merchiva" }]);
    view.unmount();
  });

  test("a reply that arrives while it is open is read too; other features' rows never are", () => {
    entries = [entry("n2", "channel")];
    const view = render(createElement(Probe, { open: true }));
    expect(marked).toEqual([]);
    entries = [entry("n2", "channel"), entry("n3", "merchiva")];
    view.rerender(createElement(Probe, { open: true, tick: 1 }));
    expect(marked).toEqual([{ app: "merchiva" }]);
    // Nothing new: no second call on an unrelated render.
    view.rerender(createElement(Probe, { open: true, tick: 2 }));
    expect(marked).toHaveLength(1);
    view.unmount();
  });

  test("a page nobody is at waits until someone is", () => {
    entries = [entry("n1", "merchiva")];
    attended = false;
    const view = render(createElement(Probe, { open: true }));
    expect(marked).toEqual([]);
    attended = true;
    view.rerender(createElement(Probe, { open: true, tick: 1 }));
    expect(marked).toEqual([{ app: "merchiva" }]);
    view.unmount();
  });
});
