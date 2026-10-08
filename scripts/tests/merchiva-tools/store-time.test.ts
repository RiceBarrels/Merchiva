import { describe, expect, test } from "bun:test";
import {
  addDaysToKey,
  daysBetweenKeys,
  isDateKey,
  keysInRange,
  mondayKeyOf,
  resolveStoreToday,
  validTimeZone,
  weekdayOfKey,
  zonedDateKey,
  zonedMidnightMs,
} from "@/lib/merchiva/tools/store-time";
import { dateKey } from "@/lib/date-key";

describe("calendar keys", () => {
  test("isDateKey accepts real days only", () => {
    expect(isDateKey("2026-09-26")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-9-26")).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });

  test("key arithmetic crosses months, years and DST without drifting", () => {
    expect(addDaysToKey("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysToKey("2026-01-01", -1)).toBe("2025-12-31");
    // US DST ends 2026-11-01: a local-time Date would land on 23:00 of the previous day.
    expect(addDaysToKey("2026-10-31", 2)).toBe("2026-11-02");
    expect(daysBetweenKeys("2026-09-01", "2026-09-26")).toBe(25);
    expect(keysInRange("2026-09-28", "2026-10-01")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"]);
  });

  test("weekday and Monday of a key", () => {
    expect(weekdayOfKey("2026-09-26")).toBe(6); // Saturday
    expect(mondayKeyOf("2026-09-26")).toBe("2026-09-21");
    expect(mondayKeyOf("2026-09-27")).toBe("2026-09-21"); // Sunday belongs to the week before
    expect(mondayKeyOf("2026-09-28")).toBe("2026-09-28");
  });
});

describe("store zone", () => {
  test("validTimeZone rejects junk", () => {
    expect(validTimeZone("Asia/Shanghai")).toBe("Asia/Shanghai");
    expect(validTimeZone("Mars/Olympus")).toBeNull();
    expect(validTimeZone("")).toBeNull();
    expect(validTimeZone(42)).toBeNull();
  });

  test("an instant falls on the store's day, not the UTC day", () => {
    const utc = Date.UTC(2026, 8, 26, 2, 0); // 02:00 UTC on the 26th
    expect(zonedDateKey(utc, "America/Los_Angeles")).toBe("2026-09-25"); // 19:00 the day before
    expect(zonedDateKey(utc, "Asia/Shanghai")).toBe("2026-09-26");
    // No zone → the server's local day, via lib/date-key.
    expect(zonedDateKey(utc, null)).toBe(dateKey(new Date(utc)));
  });

  test("midnight of a store day, across a DST change", () => {
    expect(zonedMidnightMs("2026-09-26", "Asia/Shanghai")).toBe(Date.UTC(2026, 8, 25, 16, 0));
    expect(zonedMidnightMs("2026-09-26", "America/Los_Angeles")).toBe(Date.UTC(2026, 8, 26, 7, 0));
    // 2026-11-01 is the fall-back day in the US: that midnight is still EDT (UTC-4), the next one EST (UTC-5).
    expect(zonedMidnightMs("2026-11-01", "America/New_York")).toBe(Date.UTC(2026, 10, 1, 4, 0));
    expect(zonedMidnightMs("2026-11-02", "America/New_York")).toBe(Date.UTC(2026, 10, 2, 5, 0));
  });

  test("today: the client's key wins, then the zone, then the server day", () => {
    const now = Date.UTC(2026, 8, 26, 2, 0);
    expect(resolveStoreToday("2026-09-24", "Asia/Shanghai", now)).toBe("2026-09-24");
    expect(resolveStoreToday("garbage", "America/Los_Angeles", now)).toBe("2026-09-25");
    expect(resolveStoreToday(undefined, null, now)).toBe(dateKey(new Date(now)));
  });
});
