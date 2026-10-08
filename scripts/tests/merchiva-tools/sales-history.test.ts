import { describe, expect, test } from "bun:test";
import {
  dailySalesCents,
  dailySalesRecords,
  forecastSalesHistory,
  posNetCentsByDay,
  toPaymentLite,
  toSalesRowLite,
  type PaymentLite,
  type SalesRowLite,
} from "@/lib/merchiva/tools/sales-history";
import { ts } from "./fixtures";

const LA = "America/Los_Angeles";
const at = (y: number, mo: number, d: number, h: number) => Date.UTC(y, mo - 1, d, h, 0);

function pay(status: string, ms: number, cents: number, refundCents = 0): PaymentLite {
  return { status, createdAtMs: ms, amountCents: cents, refundAmountCents: refundCents };
}

function day(date: string, cents: number, hour: number | null = null): SalesRowLite {
  return { date, hour, actualCents: cents, predicted: 0, weather: "", footTraffic: 0, isHoliday: false };
}

describe("row mappers", () => {
  test("payments read the exact *Cents columns and fall back to the float", () => {
    const exact = toPaymentLite({ status: "completed", createdAt: ts(1000), amount: 0.1, amountCents: 10n, refundAmountCents: 3n });
    expect(exact).toEqual({ status: "completed", createdAtMs: 1000, amountCents: 10, refundAmountCents: 3 });
    const legacy = toPaymentLite({ status: "completed", createdAt: ts(1000), amount: 12.34, refundAmount: undefined });
    expect(legacy.amountCents).toBe(1234);
    expect(legacy.refundAmountCents).toBe(0);
  });

  test("sales rows keep hour null for daily aggregates", () => {
    expect(toSalesRowLite({ date: "2026-09-20", hour: undefined, actual: 100.1 }).hour).toBeNull();
    expect(toSalesRowLite({ date: "2026-09-20", hour: 0, actual: 5 }).hour).toBe(0);
    expect(toSalesRowLite({ date: "2026-09-20", actual: 100.1 }).actualCents).toBe(10010);
  });
});

describe("POS takings by store day", () => {
  test("refunded payments are dropped and partial refunds subtracted", () => {
    const byDay = posNetCentsByDay(
      [
        pay("completed", at(2026, 9, 20, 18), 1000),
        pay("refunded", at(2026, 9, 20, 18), 5000),
        pay("completed", at(2026, 9, 20, 19), 2000, 500),
        pay("completed", at(2026, 9, 20, 19), 300, 300), // fully refunded but still "completed"
      ],
      LA,
    );
    expect([...byDay]).toEqual([["2026-09-20", 2500]]);
  });

  test("an evening sale in Los Angeles stays on its own day", () => {
    // 03:00 UTC on the 21st is 20:00 on the 20th in Los Angeles.
    const byDay = posNetCentsByDay([pay("completed", at(2026, 9, 21, 3), 700)], LA);
    expect(byDay.get("2026-09-20")).toBe(700);
  });
});

describe("daily sales", () => {
  test("adds daily rows and POS in cents, and ignores hourly rows", () => {
    const rows = [day("2026-09-20", 10), day("2026-09-20", 20, 13), day("2026-09-21", 1)];
    const daily = dailySalesCents(rows, [pay("completed", at(2026, 9, 20, 18), 20)], LA);
    expect(daily.get("2026-09-20")).toBe(30); // 0.10 + 0.20, exactly — not 0.30000000000000004
    expect(daily.get("2026-09-21")).toBe(1);
  });

  test("engine records start at `since`, oldest first, in major units", () => {
    const records = dailySalesRecords(new Map([["2026-09-21", 150], ["2026-09-19", 99], ["2026-09-20", 1]]), "2026-09-20");
    expect(records.map((r) => [r.date, r.actual, r.hour])).toEqual([
      ["2026-09-20", 0.01, undefined],
      ["2026-09-21", 1.5, undefined],
    ]);
  });

  test("forecast history keeps hourly rows and adds one POS row per day, like the Sales page", () => {
    const history = forecastSalesHistory(
      [day("2026-09-20", 1000), day("2026-09-20", 400, 12)],
      [pay("completed", at(2026, 9, 20, 18), 250), pay("completed", at(2026, 9, 20, 19), 250)],
      LA,
    );
    expect(history).toHaveLength(3);
    expect(history.filter((r) => r.hour === 12)).toHaveLength(1);
    expect(history.find((r) => r.hour === undefined && r.actual === 5)).toBeDefined();
  });
});
