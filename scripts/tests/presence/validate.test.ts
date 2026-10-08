import { describe, expect, test } from "bun:test";
import {
  PAGE_PRESENCE_ANCHOR_MAX,
  PAGE_PRESENCE_TTL_MICROS,
  checkPagePresence,
  clampUnit,
  isPagePresenceStale,
  isPresenceActivity,
  isPresenceAnchor,
  isPresenceKind,
  isPresencePath,
  isPresenceSlot,
  isU32,
  pagePresenceAvatar,
  pagePresenceId,
  pagePresenceName,
  type PagePresenceInput,
} from "@/spacetimedb/src/presence/validate";

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

function input(overrides: Partial<PagePresenceInput> = {}): PagePresenceInput {
  return {
    kind: "user",
    slot: "",
    pagePath: "/manager/inventory",
    anchor: "nav:/manager/inventory",
    anchorX: 0.5,
    anchorY: 0.25,
    pointX: 0.1,
    pointY: 0.9,
    clickSeq: 3,
    activity: "",
    ...overrides,
  };
}

describe("page presence kind and slot", () => {
  test("only user and agent are kinds", () => {
    expect(isPresenceKind("user")).toBe(true);
    expect(isPresenceKind("agent")).toBe(true);
    for (const bad of ["", "User", "service", "agent ", "bot"]) expect(isPresenceKind(bad)).toBe(false);
  });

  test("a user row has no slot", () => {
    expect(isPresenceSlot("user", "")).toBe(true);
    expect(isPresenceSlot("user", "t_abc")).toBe(false);
  });

  test("an agent slot is 1-80 chars of [A-Za-z0-9_:-]", () => {
    for (const ok of ["__window__", "t_0123456789", "a:b-c_d", "x".repeat(80)]) {
      expect(isPresenceSlot("agent", ok)).toBe(true);
    }
    for (const bad of ["", "x".repeat(81), "tab 1", "t/1", "t.1", "标签", "a\nb"]) {
      expect(isPresenceSlot("agent", bad)).toBe(false);
    }
  });
});

describe("page presence path", () => {
  test("accepts normalized /manager paths", () => {
    for (const ok of ["/manager", "/manager/dashboard", "/manager/inventory/waste", "/manager/docs/a1b2-c3.d~e_f"]) {
      expect(isPresencePath(ok)).toBe(true);
    }
  });

  test("rejects other surfaces, queries, hashes, trailing slashes and dot segments", () => {
    for (const bad of [
      "",
      "/",
      "/store",
      "/personal/pay",
      "/managers",
      "/manager/",
      "manager/dashboard",
      "/manager/inventory?tab=1",
      "/manager/inventory#top",
      "/manager//inventory",
      "/manager/a b",
      "/manager/%2e%2e",
      "/manager/.",
      "/manager/..",
      "/manager/../admin",
      "/manager/./x",
      "/manager/库存",
      "https://example.com/manager",
    ]) {
      expect(isPresencePath(bad)).toBe(false);
    }
  });

  test("allows dots inside a segment", () => {
    expect(isPresencePath("/manager/files/report.v2")).toBe(true);
    expect(isPresencePath("/manager/...")).toBe(true);
  });

  test("is capped at 200 chars", () => {
    const base = "/manager/";
    expect(isPresencePath(base + "a".repeat(200 - base.length))).toBe(true);
    expect(isPresencePath(base + "a".repeat(201 - base.length))).toBe(false);
  });
});

describe("page presence anchor and activity", () => {
  test("anchor: empty or up to 512 printable UTF-16 units", () => {
    expect(isPresenceAnchor("")).toBe(true);
    expect(isPresenceAnchor("nav:/manager/inventory")).toBe(true);
    expect(isPresenceAnchor("row:库存·苹果 😀")).toBe(true);
    expect(isPresenceAnchor("a".repeat(PAGE_PRESENCE_ANCHOR_MAX))).toBe(true);
    expect(isPresenceAnchor("a".repeat(PAGE_PRESENCE_ANCHOR_MAX + 1))).toBe(false);
  });

  test("anchor: no control characters, line separators or lone surrogates", () => {
    for (const bad of [
      "a\u0000b",
      "a\nb",
      "a\tb",
      "a\u007fb",
      "a\u0085b",
      `a${LINE_SEPARATOR}b`,
      `a${PARAGRAPH_SEPARATOR}b`,
      "a\ud83d",
      "\ude00a",
    ]) {
      expect(isPresenceAnchor(bad)).toBe(false);
    }
  });

  test("activity: '' or up to 80 chars of [A-Za-z0-9_:-]", () => {
    for (const ok of ["", "viewInventory", "mcp_notion_search_pages", "action:addShift", "x".repeat(80)]) {
      expect(isPresenceActivity(ok)).toBe(true);
    }
    for (const bad of ["x".repeat(81), "view inventory", "a.b", "<script>", "工具"]) {
      expect(isPresenceActivity(bad)).toBe(false);
    }
  });
});

describe("page presence numbers", () => {
  test("clampUnit clamps finite numbers into [0, 1] and rejects the rest", () => {
    expect(clampUnit(0)).toBe(0);
    expect(clampUnit(1)).toBe(1);
    expect(clampUnit(0.42)).toBe(0.42);
    expect(clampUnit(-0.5)).toBe(0);
    expect(clampUnit(7)).toBe(1);
    expect(clampUnit(Number.NaN)).toBeNull();
    expect(clampUnit(Number.POSITIVE_INFINITY)).toBeNull();
    expect(clampUnit(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  test("isU32 accepts integers 0..2^32-1 only", () => {
    expect(isU32(0)).toBe(true);
    expect(isU32(0xffffffff)).toBe(true);
    expect(isU32(0x100000000)).toBe(false);
    expect(isU32(-1)).toBe(false);
    expect(isU32(1.5)).toBe(false);
    expect(isU32(Number.NaN)).toBe(false);
  });
});

describe("checkPagePresence", () => {
  test("passes a valid user row through, coordinates clamped", () => {
    const res = checkPagePresence(input({ anchorX: 1.2, pointY: -3 }));
    expect(res).toEqual({ ok: true, value: { ...input(), anchorX: 1, pointY: 0 } });
  });

  test("passes a valid agent row through", () => {
    const res = checkPagePresence(input({ kind: "agent", slot: "t_abc", activity: "viewForecast" }));
    expect(res.ok).toBe(true);
  });

  test("rejects each invalid field", () => {
    const cases: Array<Partial<PagePresenceInput>> = [
      { kind: "admin" },
      { slot: "t_abc" },
      { kind: "agent", slot: "" },
      { pagePath: "/store" },
      { anchor: "a\nb" },
      { activity: "not valid" },
      { clickSeq: -1 },
      { clickSeq: 2.5 },
      { anchorX: Number.NaN },
      { anchorY: Number.POSITIVE_INFINITY },
      { pointX: Number.NEGATIVE_INFINITY },
      { pointY: Number.NaN },
    ];
    for (const c of cases) {
      const res = checkPagePresence(input(c));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.length).toBeGreaterThan(0);
    }
  });
});

describe("server-derived fields", () => {
  test("row id is connection:kind:slot", () => {
    expect(pagePresenceId("c0ffee", "user", "")).toBe("c0ffee:user:");
    expect(pagePresenceId("c0ffee", "agent", "t_abc")).toBe("c0ffee:agent:t_abc");
    expect(pagePresenceId("c0ffee", "agent", "__window__")).not.toBe(pagePresenceId("c0ffee", "user", ""));
  });

  test("name falls back displayName → email → Anonymous, cleaned and capped", () => {
    expect(pagePresenceName("  Ana   Lee ", "ana@example.com")).toBe("Ana Lee");
    expect(pagePresenceName("", "ana@example.com")).toBe("ana@example.com");
    expect(pagePresenceName("   ", "  ")).toBe("Anonymous");
    expect(pagePresenceName(undefined, null)).toBe("Anonymous");
    expect(pagePresenceName("Ana\u0000\u001bLee", "")).toBe("Ana Lee");
    expect(pagePresenceName("x".repeat(100), "")).toHaveLength(80);
  });

  test("avatar is kept only as a plain https URL", () => {
    const url = "https://abc.ufs.sh/f/avatar-123.png";
    expect(pagePresenceAvatar(url)).toBe(url);
    expect(pagePresenceAvatar(` ${url} `)).toBe(url);
    for (const bad of [
      undefined,
      null,
      "",
      "http://example.com/a.png",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "https://example.com/a b.png",
      'https://example.com/a".png',
      `https://example.com/${"a".repeat(2048)}`,
    ]) {
      expect(pagePresenceAvatar(bad)).toBe("");
    }
  });

  test("rows older than the 90 s TTL are stale", () => {
    const now = 1_000_000_000_000n;
    expect(PAGE_PRESENCE_TTL_MICROS).toBe(90_000_000n);
    expect(isPagePresenceStale(now, now)).toBe(false);
    expect(isPagePresenceStale(now, now - PAGE_PRESENCE_TTL_MICROS)).toBe(false);
    expect(isPagePresenceStale(now, now - PAGE_PRESENCE_TTL_MICROS - 1n)).toBe(true);
  });
});
