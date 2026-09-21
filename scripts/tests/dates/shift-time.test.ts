import { describe, expect, test } from "bun:test";
import { isOnShiftAt, minutesOfDay, shiftDurationHours, shiftDurationMinutes } from "@/lib/shift-time";

describe("shiftDuration", () => {
  test("a same-day shift is end minus start", () => {
    expect(shiftDurationHours("09:00", "17:00")).toBe(8);
    expect(shiftDurationMinutes("07:30", "14:00")).toBe(390);
  });

  test("an overnight shift wraps past midnight instead of clamping to zero", () => {
    // The old `Math.max(0, end - start)` returned 0 for every closing shift.
    expect(shiftDurationHours("22:00", "06:00")).toBe(8);
    expect(shiftDurationHours("23:30", "00:30")).toBe(1);
  });

  test("equal times are a zero-length shift, not 24 hours", () => {
    expect(shiftDurationHours("09:00", "09:00")).toBe(0);
  });

  test("unparseable times are zero rather than NaN", () => {
    expect(shiftDurationHours("", "17:00")).toBe(0);
    expect(shiftDurationHours("09:00", "nonsense")).toBe(0);
  });
});

describe("isOnShiftAt", () => {
  test("covers a same-day shift, end-exclusive", () => {
    expect(isOnShiftAt("09:00", "17:00", minutesOfDay("09:00"))).toBe(true);
    expect(isOnShiftAt("09:00", "17:00", minutesOfDay("12:00"))).toBe(true);
    expect(isOnShiftAt("09:00", "17:00", minutesOfDay("17:00"))).toBe(false);
    expect(isOnShiftAt("09:00", "17:00", minutesOfDay("08:59"))).toBe(false);
  });

  test("covers both sides of midnight for an overnight shift", () => {
    // 22:00–06:00 — the case that could never be true before.
    expect(isOnShiftAt("22:00", "06:00", minutesOfDay("23:00"))).toBe(true);
    expect(isOnShiftAt("22:00", "06:00", minutesOfDay("01:00"))).toBe(true);
    expect(isOnShiftAt("22:00", "06:00", minutesOfDay("06:00"))).toBe(false);
    expect(isOnShiftAt("22:00", "06:00", minutesOfDay("21:59"))).toBe(false);
  });

  test("a zero-length shift covers nothing", () => {
    expect(isOnShiftAt("09:00", "09:00", minutesOfDay("09:00"))).toBe(false);
  });
});
