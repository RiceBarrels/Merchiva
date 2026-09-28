import { describe, expect, test } from "bun:test";
import { resolveSalesRange, salesView, viewSalesInput } from "@/lib/merchiva/tools/view-sales";

// Sunday. This week is Mon 09-21 – Sun 09-27; last week Mon 09-14 – Sun 09-20.
const TODAY = "2026-09-27";

describe("resolveSalesRange", () => {
  test("last_week is the Monday–Sunday week before this one — the reported '上周' was read as Wed–Tue", () => {
    expect(resolveSalesRange(TODAY, { period: "last_week" })).toEqual({ period: "last_week", start: "2026-09-14", end: "2026-09-20" });
    // On a Monday, last week is the one that just ended.
    expect(resolveSalesRange("2026-09-28", { period: "last_week" })).toEqual({ period: "last_week", start: "2026-09-21", end: "2026-09-27" });
  });

  test("a period never runs past today", () => {
    expect(resolveSalesRange("2026-09-23", { period: "this_week" })).toEqual({ period: "this_week", start: "2026-09-21", end: "2026-09-23" });
    expect(resolveSalesRange(TODAY, { period: "this_month" })).toEqual({ period: "this_month", start: "2026-09-01", end: TODAY });
    expect(resolveSalesRange(TODAY, { period: "last_month" })).toEqual({ period: "last_month", start: "2026-08-01", end: "2026-08-31" });
  });

  test("from/to win over period and days; either end alone, or reversed, still gives a range", () => {
    expect(resolveSalesRange(TODAY, { from: "2026-09-01", to: "2026-09-07", period: "last_week", days: 3 })).toEqual({
      period: "from_to", start: "2026-09-01", end: "2026-09-07",
    });
    expect(resolveSalesRange(TODAY, { from: "2026-09-20" })).toEqual({ period: "from_to", start: "2026-09-20", end: TODAY });
    expect(resolveSalesRange(TODAY, { to: "2026-09-14" })).toEqual({ period: "from_to", start: "2026-09-01", end: "2026-09-14" });
    expect(resolveSalesRange(TODAY, { from: "2026-09-10", to: "2026-09-03" })).toEqual({ period: "from_to", start: "2026-09-03", end: "2026-09-10" });
  });

  test("days keeps its meaning: from N days ago up to today; 14 by default", () => {
    expect(resolveSalesRange(TODAY, { days: 7 })).toEqual({ period: "last_7_days", start: "2026-09-20", end: TODAY });
    expect(resolveSalesRange(TODAY, {})).toEqual({ period: "last_14_days", start: "2026-09-13", end: TODAY });
  });
});

describe("salesView", () => {
  const daily = new Map<string, number>([
    ["2026-09-13", 50_00],
    ["2026-09-14", 540_15],
    ["2026-09-19", 1142_30],
    ["2026-09-20", 845_40],
    ["2026-09-21", 552_65],
  ]);

  test("sums the range exactly in cents, oldest day first, each day with its weekday", () => {
    const out = salesView(daily, resolveSalesRange(TODAY, { period: "last_week" }), TODAY, "USD");
    expect(out.total).toBe(2527.85);
    expect(out.daily).toEqual([
      { date: "2026-09-14", weekday: "Mon", revenue: 540.15 },
      { date: "2026-09-19", weekday: "Sat", revenue: 1142.3 },
      { date: "2026-09-20", weekday: "Sun", revenue: 845.4 },
    ]);
    expect(out).toMatchObject({ currency: "USD", today: TODAY, daysWithSales: 3, range: { period: "last_week" } });
    expect(out.note).toContain("quote it");
  });

  test("a range reaching past the loaded history says so", () => {
    const out = salesView(daily, { period: "from_to", start: "2025-01-01", end: TODAY }, TODAY, "EUR");
    expect(out.note).toContain("Sales before 2025-08-23 are not loaded");
    expect(out.currency).toBe("EUR");
  });

  test("the note is a string, so the chat's step counts the days, not the notes", () => {
    const out = salesView(new Map(), resolveSalesRange(TODAY, { period: "last_week" }), TODAY, "USD");
    expect(out.daily).toEqual([]);
    expect(typeof out.note).toBe("string");
  });

  test("the input schema takes period, from, to and days", () => {
    expect(viewSalesInput.parse({ period: "last_week" })).toEqual({ period: "last_week" });
    expect(viewSalesInput.safeParse({ period: "yesterday" }).success).toBe(false);
    expect(viewSalesInput.safeParse({ from: "09/20" }).success).toBe(false);
  });
});
