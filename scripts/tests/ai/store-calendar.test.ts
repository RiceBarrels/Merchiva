import { describe, expect, test } from "bun:test";
import { storeCalendarBlock } from "@/lib/ai/store-calendar";

// 2026-09-28 04:05 UTC: still Sunday 09-27, 21:05, in Los Angeles.
const NOW = Date.parse("2026-09-28T04:05:00Z");

describe("storeCalendarBlock", () => {
  test("the store's day and weeks, Monday to Sunday — '上周' on Sunday 09-27 is 09-14 – 09-20", () => {
    const block = storeCalendarBlock({ today: "2026-09-27", timeZone: "America/Los_Angeles" }, NOW);
    expect(block).toContain("- Today: 2026-09-27 (Sunday). Local time 21:05 (America/Los_Angeles).");
    expect(block).toContain("- Yesterday: 2026-09-26 (Saturday). Tomorrow: 2026-09-28 (Monday).");
    expect(block).toContain("- This week (本周 / 这周): 2026-09-21 (Monday) – 2026-09-27 (Sunday).");
    expect(block).toContain("- Last week (上周): 2026-09-14 – 2026-09-20. Next week (下周): 2026-09-28 – 2026-10-04.");
    expect(block).toContain("- This month (本月): 2026-09-01 – 2026-09-30. Last month (上个月): 2026-08-01 – 2026-08-31.");
    expect(block).toContain("never ask the user to confirm a range listed here");
  });

  test("the client's day wins over the server clock, which is already Monday in UTC", () => {
    const block = storeCalendarBlock({ today: "2026-09-27" }, NOW);
    expect(block).toContain("- Today: 2026-09-27 (Sunday). Server time 04:05 UTC; the store's time zone is unknown.");
  });

  test("without a day from the client, the store's zone decides it", () => {
    expect(storeCalendarBlock({ timeZone: "America/Los_Angeles" }, NOW)).toContain("- Today: 2026-09-27 (Sunday).");
    expect(storeCalendarBlock({ today: "not a day", timeZone: "Asia/Shanghai" }, NOW)).toContain("- Today: 2026-09-28 (Monday). Local time 12:05 (Asia/Shanghai).");
  });

  test("an unknown zone is ignored rather than trusted", () => {
    expect(storeCalendarBlock({ today: "2026-09-27", timeZone: "Mars/Olympus" }, NOW)).toContain("Server time 04:05 UTC");
  });
});
