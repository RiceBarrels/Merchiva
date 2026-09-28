// Fractional order keys: ordering, bounds, jitter, evenly spaced runs, deterministic duplicate repair, and the
// degenerate cases that must never throw.
import { describe, expect, test } from "bun:test";

import { SLIDES_ID_RE } from "@/lib/slides/constants";
import {
  compareKeyed, gapAround, isOrderKey, keyBetween, keysBetween, newSlidesId, repairDuplicateKeys, sequentialKeys,
} from "@/lib/slides/model/fractional-index";

const between = (k: string, a: string | null, b: string | null) => (a === null || k > a) && (b === null || k < b);

describe("keyBetween", () => {
  test("open ends, bounded gaps and the result is strictly between", () => {
    const mid = keyBetween(null, null);
    expect(isOrderKey(mid)).toBe(true);
    const after = keyBetween(mid, null);
    const before = keyBetween(null, mid);
    expect(before < mid && mid < after).toBe(true);
    for (const [a, b] of [["1", "2"], ["V", "V1"], ["0V", "1"], ["z", null], [null, "01"], ["1z", "2"], ["Az", "B"]] as const) {
      const k = keyBetween(a, b);
      expect(isOrderKey(k)).toBe(true);
      expect(between(k, a, b)).toBe(true);
    }
  });

  test("keys never end in 0 and repeated inserts at one spot stay ordered", () => {
    let lo: string | null = null;
    let hi = keyBetween(null, null);
    for (let i = 0; i < 300; i++) {
      const k = keyBetween(lo, hi);
      expect(k.endsWith("0")).toBe(false);
      expect(between(k, lo, hi)).toBe(true);
      if (i % 2 === 0) hi = k;
      else lo = k;
    }
  });

  test("jitter: always inside the gap, and concurrent inserts rarely collide", () => {
    const cases: Array<[string | null, string | null]> = [[null, null], ["V", "V1"], ["1", "2"], ["", "1V"], ["V", null], [null, "1"]];
    for (const [a, b] of cases) {
      const keys = Array.from({ length: 20 }, () => keyBetween(a, b, { jitter: true }));
      for (const k of keys) {
        expect(isOrderKey(k)).toBe(true);
        expect(between(k, a || null, b)).toBe(true);
      }
      expect(new Set(keys).size).toBeGreaterThanOrEqual(15);
    }
  });

  test("degenerate bounds never throw: a >= b gives the gap after a; malformed bounds are open", () => {
    expect(() => keyBetween("V", "V")).not.toThrow();
    expect(keyBetween("V", "V") > "V").toBe(true);
    expect(keyBetween("b", "a") > "b").toBe(true);
    expect(isOrderKey(keyBetween("not a key!", "10"))).toBe(true);
    expect(isOrderKey(keyBetween(null, "V0"))).toBe(true);
  });
});

describe("keysBetween / sequentialKeys", () => {
  test("monotonic, unique, inside the gap", () => {
    for (const [a, b, n] of [[null, null, 500], ["V", "V1", 50], ["1", "2", 3], ["z", null, 10], [null, "1", 7]] as const) {
      const keys = keysBetween(a, b, n);
      expect(keys).toHaveLength(n);
      expect([...keys].sort()).toEqual(keys);
      expect(new Set(keys).size).toBe(n);
      for (const k of keys) {
        expect(isOrderKey(k)).toBe(true);
        expect(between(k, a, b)).toBe(true);
      }
    }
    expect(keysBetween("V", "W", 0)).toEqual([]);
  });

  test("sequentialKeys is evenly spaced and short", () => {
    const keys = sequentialKeys(500);
    expect(keys).toHaveLength(500);
    expect([...keys].sort()).toEqual(keys);
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(4);
    expect(sequentialKeys(3)).toEqual(sequentialKeys(3)); // no jitter
  });
});

describe("compareKeyed / gapAround", () => {
  test("sorts by key, then id; malformed keys sort first", () => {
    const items = [
      { id: "b", key: "V" },
      { id: "a", key: "V" },
      { id: "c", key: "1" },
      { id: "d", key: "bad key" },
    ];
    expect([...items].sort(compareKeyed).map((i) => i.id)).toEqual(["d", "c", "a", "b"]);
  });

  test("gapAround skips ties so b is strictly greater than a", () => {
    const sorted = [
      { id: "a", key: "1" },
      { id: "b", key: "V" },
      { id: "c", key: "V" },
      { id: "d", key: "k" },
    ];
    expect(gapAround(sorted, -1)).toEqual({ a: null, b: "1" });
    expect(gapAround(sorted, 1)).toEqual({ a: "V", b: "k" });
    expect(gapAround(sorted, 3)).toEqual({ a: "k", b: null });
    expect(gapAround([], -1)).toEqual({ a: null, b: null });
    const { a, b } = gapAround(sorted, 1);
    expect(between(keyBetween(a, b), a, b)).toBe(true);
  });
});

describe("repairDuplicateKeys", () => {
  test("keeps the smallest id of each tie, re-keys the rest between the tie and the next key", () => {
    const entries = [
      { id: "x", key: "V" },
      { id: "a", key: "V" },
      { id: "m", key: "V" },
      { id: "n", key: "k" },
      { id: "q", key: "1" },
    ];
    const fixes = repairDuplicateKeys(entries);
    expect(fixes.map((f) => f.id)).toEqual(["m", "x"]);
    const applied = entries.map((e) => fixes.find((f) => f.id === e.id) ?? e);
    const keys = applied.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    const order = [...applied].sort(compareKeyed).map((e) => e.id);
    expect(order).toEqual(["q", "a", "m", "x", "n"]);
    expect(repairDuplicateKeys(applied)).toEqual([]);
  });

  test("deterministic regardless of input order, and malformed keys are re-keyed first", () => {
    const entries = [
      { id: "b", key: "" },
      { id: "a", key: "oops!" },
      { id: "c", key: "V" },
      { id: "d", key: "V" },
    ];
    const one = repairDuplicateKeys(entries);
    const two = repairDuplicateKeys([...entries].reverse());
    expect(one).toEqual(two);
    expect(one.map((f) => f.id)).toEqual(["a", "b", "d"]);
    const applied = entries.map((e) => one.find((f) => f.id === e.id) ?? e);
    expect(applied.every((e) => isOrderKey(e.key))).toBe(true);
    expect([...applied].sort(compareKeyed).map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("newSlidesId", () => {
  test("12 base-62 characters that pass SLIDES_ID_RE", () => {
    const ids = Array.from({ length: 200 }, newSlidesId);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9A-Za-z]{12}$/);
      expect(SLIDES_ID_RE.test(id)).toBe(true);
    }
    expect(new Set(ids).size).toBe(200);
  });
});
