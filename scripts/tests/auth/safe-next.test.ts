// lib/auth/safe-next.ts: the post-sign-in destination (`next`, `redirect_to`)
// must stay on this origin. Every form below was an open redirect or a
// `javascript:` run on the app's origin before it.

import { describe, expect, test } from "bun:test";
import { DEFAULT_NEXT, safeNextPath } from "@/lib/auth/safe-next";

describe("safeNextPath", () => {
  test("keeps same-origin paths, with their query and hash", () => {
    expect(safeNextPath("/invite/abc?org=BJ%20Cafe")).toBe("/invite/abc?org=BJ%20Cafe");
    expect(safeNextPath("/manager/channel?c=1#m")).toBe("/manager/channel?c=1#m");
    expect(safeNextPath("/choose")).toBe("/choose");
  });

  test.each([
    "javascript:alert(document.domain)",
    "JaVaScRiPt:fetch('//evil')",
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "data:text/html,<script>alert(1)</script>",
    "evil.example",
    "",
    "   ",
    // Dot segments collapse into a protocol-relative "//evil.example" after parsing.
    "/.//evil.example",
    "/..//evil.example",
    "/a/..//evil.example/x?y=1",
    "/%2e//evil.example",
    "/%2e%2e//evil.example",
    "/./..//evil.example",
  ])("refuses %p", (raw) => {
    expect(safeNextPath(raw)).toBe(DEFAULT_NEXT);
  });

  test("non-strings fall back, including a click event handed over by onClick", () => {
    expect(safeNextPath(null)).toBe(DEFAULT_NEXT);
    expect(safeNextPath(undefined)).toBe(DEFAULT_NEXT);
    expect(safeNextPath({ type: "click" })).toBe(DEFAULT_NEXT);
    expect(safeNextPath(42, "/manager")).toBe("/manager");
  });

  test("dot segments resolve but never leave the origin", () => {
    expect(safeNextPath("/a/../../b")).toBe("/b");
  });
});
