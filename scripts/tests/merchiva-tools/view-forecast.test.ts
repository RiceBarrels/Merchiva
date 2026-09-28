import { describe, expect, test } from "bun:test";
import { runForecast, summarizeForecast, viewForecastTool, MIN_FORECAST_ROWS } from "@/lib/merchiva/tools/view-forecast";
import { generateForecast } from "@/lib/forecast";
import type { SalesRecord } from "@/lib/types";
import { addDaysToKey } from "@/lib/merchiva/tools/store-time";
import { CALL, fakeConn, fakeCtx, uuid } from "./fixtures";

const TODAY = "2026-09-26";

/** `n` days of daily sales ending yesterday, Saturdays twice as busy. */
function history(n: number): SalesRecord[] {
  return Array.from({ length: n }, (_, i) => {
    const date = addDaysToKey(TODAY, -(i + 1));
    const sat = new Date(`${date}T00:00:00Z`).getUTCDay() === 6;
    return { date, actual: sat ? 200.1 : 100.1, predicted: 0, weather: "", footTraffic: 0, isHoliday: false };
  });
}

describe("runForecast", () => {
  test("below the Sales page's threshold there is no forecast", () => {
    expect(runForecast(history(MIN_FORECAST_ROWS - 1), [], TODAY, 7)).toBeNull();
  });

  test("forecasts today … today+N-1 with the engine's own numbers", () => {
    const out = runForecast(history(56), [], TODAY, 7)!;
    expect(out.range).toEqual({ start: TODAY, end: "2026-10-02" });
    expect(out.days.map((d) => d.date)[0]).toBe(TODAY);
    expect(out.days).toHaveLength(7);
    // Same engine, same inputs: the per-day numbers are the engine's, untouched.
    const engine = generateForecast(history(56), [], [], [], [], { start: TODAY, end: "2026-10-02" });
    expect(out.days.map((d) => d.predicted)).toEqual(engine.days.map((d) => d.predicted));
    expect(out.dataQuality).toBe("good");
    // Saturday (today) is the busy day.
    const sat = out.days.find((d) => d.weekday === "Saturday")!;
    expect(sat.predicted).toBeGreaterThan(out.days.find((d) => d.weekday === "Tuesday")!.predicted);
  });

  test("the total is summed in cents", () => {
    const summary = summarizeForecast(
      {
        overallConfidence: 60,
        dataQuality: "fair",
        historicalAvgDaily: 0.1,
        days: [0.1, 0.2].map((predicted, i) => ({
          date: `2026-09-2${i}`,
          dayOfWeek: "Monday",
          predicted,
          confidence: 60,
          factors: {
            baseLine: 0.1, weatherMultiplier: 1, weatherLabel: "unknown", holidayMultiplier: 1, holidayName: null,
            footTrafficMultiplier: 1, footTrafficLevel: "medium", staffingMultiplier: 0.9, staffCount: 0, trendMultiplier: 1,
          },
          hourlyBreakdown: [{ hour: 12, predicted }, { hour: 13, predicted: 0 }],
        })),
      },
      "2026-09-20",
      "2026-09-21",
    );
    expect(summary.totalPredicted).toBe(0.3);
    expect(summary.vsTypicalPct).toBe(50);
    expect(summary.days[0].peakHours).toEqual([12]);
  });
});

describe("viewForecast tool", () => {
  test("says when there is not enough data", async () => {
    const conn = fakeConn({ salesRecord: [{ organizationId: "org-1", date: "2026-09-20", actual: 10 }], payment: [], shift: [] });
    const out = (await viewForecastTool(fakeCtx(conn, TODAY)).execute!({}, CALL)) as Record<string, unknown>;
    expect(out.notEnoughData).toBe(true);
    expect(out.daysOfSalesOnFile).toBe(1);
  });

  test("builds inputs from the org's rows and states its assumptions", async () => {
    const conn = fakeConn({
      salesRecord: history(30).map((r) => ({ ...r, organizationId: "org-1", hour: undefined })),
      payment: [],
      shift: [{ organizationId: "org-1", id: uuid(), date: TODAY, staffName: "Ann", staffRoles: "[\"Cashier\"]", startTime: "09:00", endTime: "17:00" }],
    });
    const out = (await viewForecastTool(fakeCtx(conn, TODAY)).execute!({ days: 3 }, CALL)) as {
      days: { staffScheduled: number }[];
      assumptions: string[];
    };
    expect(out.days).toHaveLength(3);
    expect(out.days[0].staffScheduled).toBe(1);
    expect(out.assumptions.some((a) => a.includes("weather"))).toBe(true);
  });
});
