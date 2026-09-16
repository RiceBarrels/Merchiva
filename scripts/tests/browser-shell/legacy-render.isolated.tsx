// Isolated fixture for scripts/tests/browser-shell/legacy-render.test.ts — NOT auto-discovered
// by `bun test`. Server-renders the shared components WP-1 touched, with and without a browser
// shell, plus the New Tab page with no shell provider (the §B1.5 fallbacks). Module mocks stand in
// for Next's router, SpacetimeDB-backed hooks and the nav-mode preference, so it runs in its own
// process.

import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

let navMode: "sidebar" | "bottombar" = "sidebar";
let search = "";

const ROUTER = { push: () => {}, replace: () => {}, back: () => {}, forward: () => {}, refresh: () => {}, prefetch: () => {} };
const APPS = ["sales", "products", "tasks", "training", "pay", "bookings"];
const DOCS = [
  {
    id: "1f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11",
    title: "Opening checklist",
    href: "/manager/docs/edit?id=1f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11",
    updatedAt: new Date(0),
    lastOpenedAt: null,
    ownerMemberId: "member-1",
  },
];

mock.module("@/lib/nav-mode", () => ({
  useNavMode: () => [navMode, () => {}],
  getNavMode: () => navMode,
  setNavMode: () => {},
}));
mock.module("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/manager/inventory",
  useSearchParams: () => new URLSearchParams(search),
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
    return createElement("a", { href, ...rest }, children);
  },
}));
mock.module("@/lib/spacetimedb/hooks/useDeviceApps", () => ({
  useDeviceApps: () => ({ installed: new Set(APPS), isReady: true }),
}));
mock.module("@/lib/spacetimedb/hooks/useDocs", () => ({
  useRecentDocuments: () => ({ items: DOCS, ready: true }),
  useDocsBackendStatus: () => "ready",
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { PageHeader } = await import("@/components/page-header");
const { PersonnelHeader } = await import("@/components/personnel/hub-nav");
const { ShellInfoProvider } = await import("@/lib/browser-shell/shell-context");
const { NewTabPage } = await import("@/components/browser-shell/core/new-tab-page");

function withShell(layout: "desktop" | "mobile", node: ReactNode): ReactNode {
  return createElement(ShellInfoProvider, { value: { layout, coarse: false } }, node);
}

const BREADCRUMBS = "hidden xl:flex";

test("PageHeader outside the browser shell keeps the legacy inset and breadcrumbs", () => {
  navMode = "sidebar";
  const sidebar = renderToStaticMarkup(createElement(PageHeader, { title: "Inventory" }));
  expect(sidebar).toContain("pl-14");
  expect(sidebar).toContain(BREADCRUMBS);
  navMode = "bottombar";
  const bottombar = renderToStaticMarkup(createElement(PageHeader, { title: "Inventory" }));
  expect(bottombar).not.toContain("pl-14");
  expect(bottombar).toContain(BREADCRUMBS);
});

test("PageHeader inside the browser shell: no hamburger inset; desktop hides breadcrumbs", () => {
  navMode = "sidebar";
  const desktop = renderToStaticMarkup(withShell("desktop", createElement(PageHeader, { title: "Inventory" })));
  expect(desktop).not.toContain("pl-14");
  expect(desktop).not.toContain(BREADCRUMBS);
  const mobile = renderToStaticMarkup(withShell("mobile", createElement(PageHeader, { title: "Inventory" })));
  expect(mobile).not.toContain("pl-14");
  expect(mobile).toContain(BREADCRUMBS);
});

test("PersonnelHeader keeps the sidebar inset only outside the browser shell", () => {
  navMode = "sidebar";
  expect(renderToStaticMarkup(createElement(PersonnelHeader))).toContain("pl-14 lg:pl-0");
  navMode = "bottombar";
  expect(renderToStaticMarkup(createElement(PersonnelHeader))).not.toContain("pl-14");
  navMode = "sidebar";
  expect(renderToStaticMarkup(withShell("mobile", createElement(PersonnelHeader)))).not.toContain("pl-14");
});

test("the New Tab page renders under the legacy shell with the fallbacks", () => {
  search = "";
  const html = renderToStaticMarkup(createElement(NewTabPage));
  // The New Tab page is the home page, so its heading reads "Home" — and the launcher drops the
  // Home tile, which would point at the page being displayed.
  expect(html).toContain('<h1 class="sr-only">Home</h1>');
  expect(html).toContain("Search pages, documents and tabs");
  for (const href of ["/manager/docs", "/manager/inventory", "/manager/sales", "/manager/personnel/schedule", "/manager/settings"]) {
    expect(html).toContain(`href="${href}"`);
  }
  expect(html).not.toContain('href="/manager/new-tab"');
  expect(html).toContain("Recent documents");
  expect(html).toContain("Opening checklist");
  expect(html).toContain(`href="${DOCS[0].href}"`);
  expect(html).toContain("New document");
  expect(html).not.toContain("Recently closed");
  expect(html).not.toContain('role="listbox"');
});

test("the New Tab page prefills ?q= and lists grouped suggestions", () => {
  search = "q=inv";
  const pages = renderToStaticMarkup(createElement(NewTabPage));
  expect(pages).toContain('value="inv"');
  expect(pages).toContain('role="listbox"');
  expect(pages).toContain('aria-expanded="true"');
  expect(pages).toContain(">Pages<");
  expect(pages).toContain('href="/manager/inventory"');

  search = "q=/manager/sales";
  expect(renderToStaticMarkup(createElement(NewTabPage))).toContain("Go to /manager/sales");

  search = "q=zzzz-nothing";
  expect(renderToStaticMarkup(createElement(NewTabPage))).toContain("No matches");
  search = "";
});
