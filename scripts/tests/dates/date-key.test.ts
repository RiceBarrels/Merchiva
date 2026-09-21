import { describe, expect, test } from "bun:test";
import { dateFromKey, dateKey, dateKeyOffset, todayKey } from "@/lib/date-key";

/*
 * Every date column in the schema stores the STORE's calendar day. These tests
 * pin the property that `new Date().toISOString().slice(0, 10)` does not have:
 * the key follows local time, so it does not jump a day at 00:00 UTC.
 */
describe("dateKey", () => {
  test("reads the local calendar fields, not UTC", () => {
    // 00:30 local on the 21st. In any timezone east of UTC this instant is
    // still the 20th in UTC, which is exactly the bug: toISOString() would
    // return the previous day for the first hours of every trading day.
    const justAfterMidnight = new Date(2026, 8, 21, 0, 30, 0);
    expect(dateKey(justAfterMidnight)).toBe("2026-09-21");

    // 23:30 local on the 21st — west of UTC this is already the 22nd in UTC.
    const justBeforeMidnight = new Date(2026, 8, 21, 23, 30, 0);
    expect(dateKey(justBeforeMidnight)).toBe("2026-09-21");
  });

  test("zero-pads month and day", () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  test("agrees with the local date for today", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(todayKey()).toBe(expected);
  });
});

describe("dateKeyOffset", () => {
  test("moves whole calendar days and rolls over month ends", () => {
    const from = new Date(2026, 8, 30, 12, 0, 0);
    expect(dateKeyOffset(1, from)).toBe("2026-10-01");
    expect(dateKeyOffset(-30, from)).toBe("2026-08-31");
    expect(dateKeyOffset(0, from)).toBe("2026-09-30");
  });

  test("crosses a leap day", () => {
    expect(dateKeyOffset(1, new Date(2028, 1, 28, 12, 0, 0))).toBe("2028-02-29");
    expect(dateKeyOffset(1, new Date(2028, 1, 29, 12, 0, 0))).toBe("2028-03-01");
  });
});

describe("dateFromKey", () => {
  test("round-trips through local midnight", () => {
    const d = dateFromKey("2026-09-21");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(0);
    expect(dateKey(d)).toBe("2026-09-21");
  });

  test("an unparseable key gives an Invalid Date rather than a wrong one", () => {
    expect(Number.isNaN(dateFromKey("not-a-date").getTime())).toBe(true);
  });
});
