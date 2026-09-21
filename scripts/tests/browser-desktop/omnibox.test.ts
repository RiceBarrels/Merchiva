import { describe, expect, test } from "bun:test";
import { Plus } from "lucide-react";
import type { AppIcon } from "@/components/device/app-icons";
import {
  OMNIBOX_LIMITS,
  buildOmniboxGroups,
  looksLikeTypedPath,
  normalizeTypedPath,
  scoreMatch,
  type OmniboxPageSource,
  type OmniboxSources,
  type OmniboxText,
} from "@/components/browser-shell/desktop/omnibox-results";
import type { AccessContext } from "@/lib/browser-shell/types";
import type { RecentDocumentItem } from "@/lib/docs/types";
import type { Permissions } from "@/lib/types";

const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const Icon: AppIcon = () => null;

const TEXT: OmniboxText = {
  groups: { top: "Top", tabs: "Tabs", pages: "Pages", docs: "Docs", stores: "Stores", actions: "Actions", closed: "Closed" },
  untitled: "Untitled",
  goTo: (url) => `Go to ${url}`,
};

function ctx(view: readonly (keyof Permissions)[]): AccessContext {
  const allowed = new Set(view);
  return {
    isOwner: false,
    can: (section) => allowed.has(section),
    installedApps: new Set<string>(),
    appsReady: false,
    appMode: "admin",
    personalMode: false,
    isCapacitor: false,
  };
}

function page(href: string, title: string, keywords: readonly string[] = []): OmniboxPageSource {
  return { href, title, icon: Icon, keywords };
}

function doc(id: string, title: string, updatedAt: number): RecentDocumentItem {
  return { id, title, href: `/manager/docs/edit?id=${id}`, updatedAt: new Date(updatedAt), lastOpenedAt: null, ownerMemberId: "m1" };
}

function sources(overrides: Partial<OmniboxSources> = {}): OmniboxSources {
  return { tabs: [], sections: [], pages: [], docs: [], stores: [], actions: [], closed: [], typedPath: null, now: NOW, ...overrides };
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

describe("scoreMatch", () => {
  test("ranks prefix > word start > substring > secondary field", () => {
    expect(scoreMatch("inv", { primary: "Inventory" })).toBe(100);
    expect(scoreMatch("log", { primary: "Waste Log" })).toBe(70);
    expect(scoreMatch("ntor", { primary: "Inventory" })).toBe(40);
    expect(scoreMatch("waste", { primary: "废弃记录", secondary: ["inventory", "waste"] })).toBe(25);
  });

  test("every token must match; token scores add up", () => {
    expect(scoreMatch("waste log", { primary: "Waste Log" })).toBe(170);
    expect(scoreMatch("waste zzz", { primary: "Waste Log" })).toBe(0);
    expect(scoreMatch("   ", { primary: "Waste Log" })).toBe(0);
  });

  test("ignores case and diacritics", () => {
    expect(scoreMatch("CAFE", { primary: "Café menu" })).toBe(100);
  });
});

describe("typed paths", () => {
  const access = ctx(["inventory", "dashboard"]);

  test("only path-like input gets a Go to row", () => {
    expect(looksLikeTypedPath("inventory")).toBe(false);
    expect(looksLikeTypedPath("waste log")).toBe(false);
    expect(looksLikeTypedPath("inventory/waste")).toBe(true);
    expect(looksLikeTypedPath("Merchiva")).toBe(true);
  });

  test("resolves permitted registry routes to canonical /manager URLs", () => {
    expect(normalizeTypedPath("inventory/waste", access)).toBe("/manager/inventory/waste");
    expect(normalizeTypedPath("/inventory", access)).toBe("/manager/inventory");
    expect(normalizeTypedPath("merchiva/inventory", access)).toBe("/manager/inventory");
    expect(normalizeTypedPath("manager/suppliers", access)).toBe("/manager/suppliers");
    expect(normalizeTypedPath("inventory?view=low", access)).toBe("/manager/inventory?view=low");
  });

  test("never navigates to forbidden, unknown, foreign or scripted targets", () => {
    expect(normalizeTypedPath("/manager/sales", access)).toBeNull();
    expect(normalizeTypedPath("/manager/nope", access)).toBeNull();
    expect(normalizeTypedPath("setup", access)).toBeNull();
    expect(normalizeTypedPath("javascript:alert(1)", access)).toBeNull();
    expect(normalizeTypedPath("https://evil.example/manager/inventory", access)).toBeNull();
    expect(normalizeTypedPath("inventory waste", access)).toBeNull();
  });
});

describe("buildOmniboxGroups", () => {
  test("empty query: tabs, docs, sections, closed, actions with their caps", () => {
    const groups = buildOmniboxGroups(
      "",
      sources({
        tabs: range(7).map((i) => ({ tabId: `t${i}`, title: `Tab ${i}`, url: `/manager/inventory?t=${i}`, icon: Icon })),
        docs: range(7).map((i) => doc(`d${i}`, `Doc ${i}`, NOW - i * HOUR)),
        sections: [page("/manager/dashboard", "Home"), page("/manager/inventory", "Inventory"), page("/manager/docs", "Docs")],
        pages: [page("/manager/dashboard", "Home"), page("/manager/inventory/waste", "Waste Log")],
        closed: range(7).map((i) => ({ closedId: `c${i}`, title: `Closed ${i}`, url: "/manager/sales", icon: Icon })),
        actions: [
          { id: "new-tab", title: "New tab", icon: Plus, keywords: [] },
          { id: "settings", title: "Settings", icon: Plus, keywords: [] },
        ],
      }),
      TEXT,
    );
    expect(groups.map((g) => g.value)).toEqual(["tabs", "docs", "pages", "closed", "actions"]);
    expect(groups.map((g) => g.items.length)).toEqual([OMNIBOX_LIMITS.emptyTabs, OMNIBOX_LIMITS.emptyDocs, 3, OMNIBOX_LIMITS.emptyClosed, 2]);
  });

  test("empty groups are omitted and untitled docs get the fallback title", () => {
    const groups = buildOmniboxGroups("", sources({ docs: [doc("d1", "  ", NOW)] }), TEXT);
    expect(groups).toHaveLength(1);
    expect(groups[0].items[0]).toMatchObject({ kind: "doc", title: "Untitled" });
  });

  test("the best match moves to Top and leaves its home group; open tabs get a bonus", () => {
    const groups = buildOmniboxGroups(
      "inventory",
      sources({
        tabs: [{ tabId: "t1", title: "Inventory", url: "/manager/inventory?x=1", icon: Icon }],
        pages: [page("/manager/inventory", "Inventory"), page("/manager/suppliers", "Suppliers", ["vendors"])],
      }),
      TEXT,
    );
    expect(groups.map((g) => g.value)).toEqual(["top", "pages"]);
    expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0]).toMatchObject({ kind: "tab", tabId: "t1" });
    expect(groups[1].items.map((item) => item.id)).toEqual(["page:/manager/inventory"]);
  });

  test("a resolved typed path comes first and replaces the page with the same URL", () => {
    const groups = buildOmniboxGroups(
      "waste",
      sources({
        typedPath: "/manager/inventory/waste",
        pages: [page("/manager/inventory/waste", "Waste Log"), page("/manager/bins", "Waste bins")],
      }),
      TEXT,
    );
    expect(groups.map((g) => g.value)).toEqual(["top"]);
    expect(groups[0].items.map((item) => item.kind)).toEqual(["path", "page"]);
    expect(groups[0].items[0]).toMatchObject({ url: "/manager/inventory/waste", title: "Go to /manager/inventory/waste" });
    expect(groups[0].items[1]).toMatchObject({ url: "/manager/bins" });
  });

  test("per-group limits and the overall cap of 14 rows", () => {
    const old = NOW - 72 * HOUR;
    const groups = buildOmniboxGroups(
      "item",
      sources({
        tabs: range(10).map((i) => ({ tabId: `t${i}`, title: `Item ${i}`, url: `/manager/inventory?t=${i}`, icon: Icon })),
        pages: range(10).map((i) => page(`/manager/p${i}`, `Item page ${i}`)),
        docs: range(10).map((i) => doc(`d${i}`, `Item doc ${i}`, old)),
        stores: range(10).map((i) => ({ id: `o${i}`, name: `Item store ${i}`, logoUrl: null })),
        actions: [{ id: "settings", title: "Item settings", icon: Plus, keywords: [] }],
      }),
      TEXT,
    );
    const total = groups.reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBe(OMNIBOX_LIMITS.total);
    expect(groups.map((g) => [g.value, g.items.length])).toEqual([
      ["top", 1],
      ["tabs", OMNIBOX_LIMITS.tabs],
      ["pages", OMNIBOX_LIMITS.pages],
      ["docs", 2],
    ]);
  });

  test("documents edited in the last 24 hours rank above older ones", () => {
    const groups = buildOmniboxGroups(
      "report",
      sources({ docs: [doc("old", "Report B", NOW - 72 * HOUR), doc("new", "Report C", NOW - HOUR)] }),
      TEXT,
    );
    expect(groups[0].value).toBe("top");
    expect(groups[0].items[0]).toMatchObject({ kind: "doc", id: "doc:new" });
  });

  test("stores match by name", () => {
    const groups = buildOmniboxGroups(
      "north",
      sources({ stores: [{ id: "o1", name: "North Street", logoUrl: null }] }),
      TEXT,
    );
    expect(groups[0].items[0]).toMatchObject({ kind: "store", orgId: "o1", title: "North Street" });
  });
});
