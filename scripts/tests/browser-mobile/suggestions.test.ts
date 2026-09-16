import { describe, expect, test } from "bun:test";
import type { AppIcon } from "../../../components/device/app-icons";
import { dayKey, matchStrength, pathOfUrl } from "../../../lib/browser-shell/mobile/labels";
import { MAX_SUGGESTIONS, rankSuggestions, suggestionScore, type Suggestion } from "../../../lib/browser-shell/mobile/suggestions";

const Icon: AppIcon = () => null;

function suggestion(patch: Partial<Suggestion> & Pick<Suggestion, "key" | "href" | "title" | "score">): Suggestion {
  return { kind: "page", subtitle: patch.href, icon: Icon, tabId: null, ...patch };
}

describe("matchStrength", () => {
  test("prefix > word start > substring > none", () => {
    expect(matchStrength("inv", "Inventory")).toBe(3);
    expect(matchStrength("log", "Waste Log")).toBe(2);
    expect(matchStrength("ento", "Inventory")).toBe(1);
    expect(matchStrength("xyz", "Inventory")).toBe(0);
    expect(matchStrength("inv", null)).toBe(0);
  });
});

describe("suggestionScore", () => {
  test("title matches beat keyword / path matches of the same strength", () => {
    const title = suggestionScore("inv", "Inventory");
    const path = suggestionScore("inv", "Stock", ["/manager/inventory"]);
    expect(title).toBe(32);
    expect(path).toBe(21);
    expect(title).toBeGreaterThan(path);
  });

  test("empty query scores 0", () => {
    expect(suggestionScore("   ", "Inventory")).toBe(0);
  });
});

describe("rankSuggestions", () => {
  test("drops non-matches and sorts best first", () => {
    const ranked = rankSuggestions([
      suggestion({ key: "a", href: "/manager/reports", title: "Reports", score: 12 }),
      suggestion({ key: "b", href: "/manager/inventory", title: "Inventory", score: 32 }),
      suggestion({ key: "c", href: "/manager/sales", title: "Sales", score: 0 }),
    ]);
    expect(ranked.map((s) => s.key)).toEqual(["b", "a"]);
  });

  test("an open tab wins the collapse for its URL and keeps the best score", () => {
    const ranked = rankSuggestions([
      suggestion({ key: "page", href: "/manager/inventory", title: "Inventory", score: 32 }),
      suggestion({ key: "tab", kind: "tab", tabId: "t_1", href: "/manager/inventory/", title: "Inventory", score: 22 }),
      suggestion({ key: "hist", kind: "history", href: "/manager/inventory?dialogs=Edit", title: "Inventory", score: 32 }),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].key).toBe("tab");
    expect(ranked[0].score).toBe(32);
  });

  test("ties break by kind (tab, page, document, bookmark, history)", () => {
    const ranked = rankSuggestions([
      suggestion({ key: "h", kind: "history", href: "/manager/a", title: "A", score: 30 }),
      suggestion({ key: "d", kind: "document", href: "/manager/docs/edit?id=1", title: "A", score: 30 }),
      suggestion({ key: "p", kind: "page", href: "/manager/b", title: "A", score: 30 }),
    ]);
    expect(ranked.map((s) => s.key)).toEqual(["p", "d", "h"]);
  });

  test("caps the list", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      suggestion({ key: `k${i}`, href: `/manager/p${i}`, title: `Page ${i}`, score: 10 + (i % 3) }),
    );
    expect(rankSuggestions(many)).toHaveLength(MAX_SUGGESTIONS);
    expect(rankSuggestions(many, 3)).toHaveLength(3);
  });
});

describe("labels helpers", () => {
  test("pathOfUrl strips query, hash and trailing slashes", () => {
    expect(pathOfUrl("/manager/docs/edit/?id=1#x")).toBe("/manager/docs/edit");
    expect(pathOfUrl("/")).toBe("/");
  });

  test("dayKey groups by local calendar day", () => {
    const morning = new Date(2026, 8, 15, 8, 0).getTime();
    const night = new Date(2026, 8, 15, 23, 30).getTime();
    const next = new Date(2026, 8, 16, 0, 5).getTime();
    expect(dayKey(morning)).toBe(dayKey(night));
    expect(dayKey(morning)).not.toBe(dayKey(next));
  });
});
