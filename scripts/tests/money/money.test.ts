import { describe, expect, test } from "bun:test";
import {
  applyRateCents,
  centsOf,
  centsOrNull,
  formatCents,
  multiplyCents,
  sumCents,
  toCents,
  toMajor,
} from "@/lib/money";
import { grossPay, grossPayCents } from "@/lib/payroll";

/*
 * Money used to be stored as f64 throughout the SpacetimeDB module. These tests pin the two
 * properties that made that unsafe, and that the `*Cents` columns exist to restore:
 *
 *   1. reading prefers the exact integer column but still works on un-migrated rows, so a
 *      surface can be switched over before `migrateMoneyV1` has run;
 *   2. summing stays in integers, so a long list does not drift.
 */

describe("centsOf", () => {
  test("prefers the exact i64 column, which arrives as a bigint", () => {
    expect(centsOf({ amount: 19.989999999999998, amountCents: 1999n }, "amount")).toBe(1999);
  });

  test("falls back to the legacy float for rows written before the backfill", () => {
    expect(centsOf({ amount: 19.99 }, "amount")).toBe(1999);
  });

  test("recovers the intended value from a float that already drifted", () => {
    // 0.1 + 0.2 === 0.30000000000000004
    expect(centsOf({ amount: 0.1 + 0.2 }, "amount")).toBe(30);
  });

  test("treats a missing row, missing field or non-finite value as zero so callers can sum blindly", () => {
    expect(centsOf(null, "amount")).toBe(0);
    expect(centsOf({}, "amount")).toBe(0);
    expect(centsOf({ amount: Number.NaN }, "amount")).toBe(0);
    expect(centsOf({ amount: Number.POSITIVE_INFINITY }, "amount")).toBe(0);
  });

  test("a zero cents column wins over a non-zero legacy float", () => {
    // 0n is falsy — the lookup must test the type, not truthiness, or a fully
    // refunded row would silently report its pre-refund amount.
    expect(centsOf({ amount: 12.5, amountCents: 0n }, "amount")).toBe(0);
  });
});

describe("centsOrNull", () => {
  test("distinguishes 'not set' from zero, which centsOf deliberately cannot", () => {
    expect(centsOrNull({}, "hourlyRate")).toBeNull();
    expect(centsOrNull(null, "hourlyRate")).toBeNull();
    expect(centsOrNull({ hourlyRateCents: 0n }, "hourlyRate")).toBe(0);
    expect(centsOrNull({ hourlyRate: 18 }, "hourlyRate")).toBe(1800);
  });
});

describe("sumCents", () => {
  test("is exact where the float sum is not", () => {
    const rows = Array.from({ length: 10 }, () => ({ amount: 0.1 }));

    const floatTotal = rows.reduce((acc, r) => acc + r.amount, 0);
    expect(floatTotal).not.toBe(1); // 0.9999999999999999

    expect(sumCents(rows, "amount")).toBe(100);
    expect(toMajor(sumCents(rows, "amount"))).toBe(1);
  });

  test("stays exact over a long ledger of awkward amounts", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ amountCents: BigInt(i % 7 === 0 ? 1 : 333) }));
    const expected = rows.reduce((acc, r) => acc + Number(r.amountCents), 0);
    expect(sumCents(rows, "amount")).toBe(expected);
  });

  test("mixes migrated and un-migrated rows without double counting", () => {
    expect(sumCents([{ amountCents: 1000n }, { amount: 5.25 }], "amount")).toBe(1525);
  });

  test("handles an empty or absent list", () => {
    expect(sumCents([], "amount")).toBe(0);
    expect(sumCents(null, "amount")).toBe(0);
  });
});

describe("toCents / toMajor round trip", () => {
  test("survives the classic float offenders", () => {
    // 1.005 is deliberately absent: it is exactly half a cent and cannot
    // round-trip. Its rounding direction is pinned by the next test instead.
    for (const value of [0.1, 0.2, 0.29, 19.99, 1234.56, 0.07, 0.1 + 0.2]) {
      expect(toMajor(toCents(value))).toBeCloseTo(value, 10);
    }
  });

  test("rounds to the nearest cent rather than truncating", () => {
    expect(toCents(1.004)).toBe(100);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(-1.005)).toBe(-100); // Math.round rounds half up, toward +Infinity
  });

  test("is zero for non-finite input", () => {
    expect(toCents(Number.NaN)).toBe(0);
    expect(toCents(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("multiplyCents / applyRateCents", () => {
  test("rounds once, at the end", () => {
    expect(multiplyCents(1999, 3)).toBe(5997);
    expect(multiplyCents(333, 1 / 3)).toBe(111);
  });

  test("applies a tax rate without introducing a sub-cent remainder", () => {
    expect(applyRateCents(10_000, 0.0875)).toBe(875);
    expect(Number.isInteger(applyRateCents(1999, 0.0875))).toBe(true);
  });

  test("a non-finite factor yields zero instead of NaN poisoning a total", () => {
    expect(multiplyCents(1999, Number.NaN)).toBe(0);
    expect(applyRateCents(1999, Number.NaN)).toBe(0);
  });
});

describe("grossPayCents", () => {
  const HOUR = 3_600_000;

  test("matches the obvious answer for whole hours", () => {
    expect(grossPayCents(8 * HOUR, 1800)).toBe(14_400); // 8h @ $18.00 = $144.00
  });

  test("a payroll run sums exactly, where rounding each person first does not", () => {
    // 7h20m at $15.55/h is $114.03666… — it does not land on a cent.
    const ms = 7 * HOUR + 20 * 60_000;
    const rateCents = 1555;
    const staff = 9;

    const exactTotal = Array.from({ length: staff })
      .reduce<number>((acc) => acc + grossPayCents(ms, rateCents), 0);

    // The old path rounded to cents per person, then summed the floats.
    const legacyTotal = Array.from({ length: staff })
      .reduce<number>((acc) => acc + grossPay(ms, rateCents / 100), 0);

    expect(Number.isInteger(exactTotal)).toBe(true);
    expect(exactTotal).toBe(staff * Math.round((ms / HOUR) * rateCents));
    // Same money to within rounding, but only one of them is an exact integer
    // of cents that a ledger can reconcile against.
    expect(Math.abs(toMajor(exactTotal) - legacyTotal)).toBeLessThan(0.05);
  });

  test("guards non-finite input so one bad punch cannot NaN the whole run", () => {
    expect(grossPayCents(Number.NaN, 1800)).toBe(0);
    expect(grossPayCents(8 * HOUR, Number.NaN)).toBe(0);
  });

  test("grossPay still returns major units, delegating to the exact path", () => {
    expect(grossPay(8 * HOUR, 18)).toBe(144);
  });
});

describe("formatCents", () => {
  test("renders minor units as currency", () => {
    expect(formatCents(1999, "USD", "en-US")).toBe("$19.99");
    expect(formatCents(0, "USD", "en-US")).toBe("$0.00");
    expect(formatCents(-500, "USD", "en-US")).toBe("-$5.00");
  });

  test("falls back to a plain number rather than throwing on a bad currency code", () => {
    expect(formatCents(1999, "not-a-currency", "en-US")).toBe("19.99");
  });
});

/*
 * MoneyRow used to be `Record<string, unknown>`, which no declared interface
 * satisfies — so the helpers could not be called with any of the app's mapped
 * row types and went almost unused. These rows are typed interfaces on purpose.
 */
describe("typed rows", () => {
  interface WasteRow {
    id: string;
    totalCost: number;
    totalCostCents: number;
  }

  const rows: WasteRow[] = [
    { id: "a", totalCost: 0.1, totalCostCents: 10 },
    { id: "b", totalCost: 0.2, totalCostCents: 20 },
    { id: "c", totalCost: 0.3, totalCostCents: 30 },
  ];

  test("centsOf and sumCents accept an interface, not just an index-signature type", () => {
    expect(centsOf(rows[0], "totalCost")).toBe(10);
    expect(sumCents(rows, "totalCost")).toBe(60);
  });

  test("summing in cents avoids the float drift the same sum has", () => {
    const asFloat = rows.reduce((s, r) => s + r.totalCost, 0);
    expect(asFloat).not.toBe(0.6);           // 0.1 + 0.2 + 0.3 === 0.6000000000000001
    expect(toMajor(sumCents(rows, "totalCost"))).toBe(0.6);
  });
});
