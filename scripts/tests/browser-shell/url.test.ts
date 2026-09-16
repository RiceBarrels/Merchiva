import { describe, expect, test } from "bun:test";
import {
  MAX_URL_LEN,
  TRANSIENT_PARAMS,
  canonicalizeUrl,
  isTabbablePathname,
  parseOmniboxInput,
  stripVolatileParams,
} from "@/lib/browser-shell/url";

const BASE = "http://local/manager/inventory";

describe("canonicalizeUrl", () => {
  test("strips trailing slashes, the hash and `dialogs`; keeps param order; key sorts", () => {
    const c = canonicalizeUrl("/manager/inventory/?b=2&dialogs=Edit%20item&a=1#top", BASE);
    expect(c).not.toBeNull();
    expect(c?.url).toBe("/manager/inventory?b=2&a=1");
    expect(c?.key).toBe("/manager/inventory?a=1&b=2");
    expect(c?.pathname).toBe("/manager/inventory");
    expect(c?.search).toBe("?b=2&a=1");
    expect(c?.tabbable).toBe(true);
  });

  test("a URL with only `dialogs` has no search at all", () => {
    const c = canonicalizeUrl("/manager/settings?dialogs=Profile,Store", BASE);
    expect(c?.url).toBe("/manager/settings");
    expect(c?.key).toBe("/manager/settings");
  });

  test("static-build trailing slashes canonicalize (/manager/ → /manager)", () => {
    expect(canonicalizeUrl("/manager/", BASE)?.url).toBe("/manager");
    expect(canonicalizeUrl("/manager/new-tab/", BASE)?.url).toBe("/manager/new-tab");
    expect(canonicalizeUrl("/manager/docs/edit/?id=abc", BASE)?.url).toBe("/manager/docs/edit?id=abc");
  });

  test("relative and same-origin absolute inputs resolve against the base", () => {
    expect(canonicalizeUrl("?tab=2", BASE)?.url).toBe("/manager/inventory?tab=2");
    expect(canonicalizeUrl("http://local/manager/sales", BASE)?.url).toBe("/manager/sales");
  });

  test("equal keys for reordered params, different keys for different values", () => {
    expect(canonicalizeUrl("/manager/x?a=1&b=2", BASE)?.key).toBe(canonicalizeUrl("/manager/x?b=2&a=1", BASE)?.key ?? "");
    expect(canonicalizeUrl("/manager/x?a=1", BASE)?.key).not.toBe(canonicalizeUrl("/manager/x?a=2", BASE)?.key ?? "");
  });

  test("rejects other origins, other schemes, empty and over-long input", () => {
    expect(canonicalizeUrl("https://evil.example/manager", BASE)).toBeNull();
    expect(canonicalizeUrl("//evil.example/manager", BASE)).toBeNull();
    expect(canonicalizeUrl("javascript:alert(1)", BASE)).toBeNull();
    expect(canonicalizeUrl("", BASE)).toBeNull();
    expect(canonicalizeUrl("   ", BASE)).toBeNull();
    expect(canonicalizeUrl(`/manager?q=${"a".repeat(MAX_URL_LEN)}`, BASE)).toBeNull();
  });

  test("non-manager paths are canonical but not tabbable", () => {
    expect(canonicalizeUrl("/choose?switch=1", BASE)?.tabbable).toBe(false);
    expect(canonicalizeUrl("/store", BASE)?.tabbable).toBe(false);
    expect(canonicalizeUrl("/manager/setup/", BASE)?.tabbable).toBe(false);
  });

  test("TRANSIENT_PARAMS is exactly dialogs", () => {
    expect([...TRANSIENT_PARAMS]).toEqual(["dialogs"]);
  });
});

describe("isTabbablePathname", () => {
  test("manager routes are tabbable except setup", () => {
    expect(isTabbablePathname("/manager")).toBe(true);
    expect(isTabbablePathname("/manager/")).toBe(true);
    expect(isTabbablePathname("/manager/inventory")).toBe(true);
    expect(isTabbablePathname("/manager/setup")).toBe(false);
    expect(isTabbablePathname("/manager/setup/step-2")).toBe(false);
    expect(isTabbablePathname("/manager/setupx")).toBe(true);
    expect(isTabbablePathname("/managerx")).toBe(false);
    expect(isTabbablePathname("/personal")).toBe(false);
    expect(isTabbablePathname("/")).toBe(false);
  });
});

describe("stripVolatileParams", () => {
  test("drops the route's one-shot params and keeps the rest in order", () => {
    expect(stripVolatileParams("/manager/settings?tab=pos&connected=square&error=x")).toBe("/manager/settings?tab=pos");
    expect(stripVolatileParams("/manager/docs/edit?id=abc&new=1&comment=t1")).toBe("/manager/docs/edit?id=abc");
    expect(stripVolatileParams("/manager/settings/billing?session_id=cs_1&status=ok")).toBe("/manager/settings/billing");
  });

  test("routes without volatile params are untouched", () => {
    expect(stripVolatileParams("/manager/inventory?connected=1")).toBe("/manager/inventory?connected=1");
    expect(stripVolatileParams("/manager/inventory")).toBe("/manager/inventory");
  });
});

describe("parseOmniboxInput", () => {
  test("manager paths become URLs (legacy redirects applied)", () => {
    expect(parseOmniboxInput("/manager/inventory", BASE)).toEqual({ kind: "url", url: "/manager/inventory" });
    expect(parseOmniboxInput("manager/sales", BASE)).toEqual({ kind: "url", url: "/manager/sales" });
    expect(parseOmniboxInput("/manager/chat", BASE)).toEqual({ kind: "url", url: "/manager/channel" });
    expect(parseOmniboxInput("/manager/personnel", BASE)).toEqual({ kind: "url", url: "/manager/personnel/schedule" });
    expect(parseOmniboxInput("http://local/manager/reports/", BASE)).toEqual({ kind: "url", url: "/manager/reports" });
  });

  test("everything else stays a query and is never navigated", () => {
    expect(parseOmniboxInput("inventory", BASE)).toEqual({ kind: "query", q: "inventory" });
    expect(parseOmniboxInput("waste log", BASE)).toEqual({ kind: "query", q: "waste log" });
    expect(parseOmniboxInput("/choose", BASE)).toEqual({ kind: "query", q: "/choose" });
    expect(parseOmniboxInput("https://example.com/manager", BASE)).toEqual({ kind: "query", q: "https://example.com/manager" });
    expect(parseOmniboxInput("javascript:alert(1)", BASE)).toEqual({ kind: "query", q: "javascript:alert(1)" });
    expect(parseOmniboxInput("  ", BASE)).toEqual({ kind: "query", q: "" });
  });
});
