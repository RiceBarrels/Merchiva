/**
 * viewForecast — lib/forecast.ts `generateForecast`, run on the server.
 *
 * Inputs are built the way components/sales-forecast.tsx builds them for the
 * Sales page: every sales_record row plus POS takings per day, the org's
 * shifts (staffing), US holidays for the current year, over `today` … +N-1.
 * Two inputs the page fetches in the browser are left out, and the result
 * says so in `assumptions`:
 *   - weather: the page asks the browser for its location and calls
 *     /api/forecast/weather; there is no server-side weather function to reuse;
 *   - foot traffic: /api/forecast/popular-times needs OUTSCRAPER_API_KEY and a
 *     place id the page does not have either (it passes "default").
 * Both factors then stay neutral (×1.0), exactly as they do on the page when
 * those requests fail.
 */

import { tool } from "ai";
import { z } from "zod";
import { generateForecast, getUSHolidays, type ForecastResult } from "@/lib/forecast";
import { toCents, toMajor } from "@/lib/money";
import type { SalesRecord, Shift } from "@/lib/types";
import { orgRows, toShift, type ToolContext } from "@/lib/merchiva/tools/rows";
import { forecastSalesHistory, toPaymentLite, toSalesRowLite } from "@/lib/merchiva/tools/sales-history";
import { addDaysToKey } from "@/lib/merchiva/tools/store-time";

export const viewForecastInput = z.object({
  days: z
    .number()
    .int()
    .min(1)
    .max(14)
    .optional()
    .describe("How many days to forecast, starting today. Default 7."),
});
export type ViewForecastArgs = z.infer<typeof viewForecastInput>;

/** Same threshold as the Sales page: fewer rows than this and it shows "not enough data". */
export const MIN_FORECAST_ROWS = 7;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The three busiest hours of a predicted day, in clock order. */
function peakHours(hourly: { hour: number; predicted: number }[]): number[] {
  return hourly
    .filter((h) => h.predicted > 0)
    .sort((a, b) => b.predicted - a.predicted)
    .slice(0, 3)
    .map((h) => h.hour)
    .sort((a, b) => a - b);
}

/** Compact, model-facing view of an engine result. Money totals are summed in cents. */
export function summarizeForecast(result: ForecastResult, start: string, end: string) {
  const totalCents = result.days.reduce((s, d) => s + toCents(d.predicted), 0);
  const typicalCents = toCents(result.historicalAvgDaily) * result.days.length;
  return {
    range: { start, end },
    totalPredicted: toMajor(totalCents),
    historicalAvgDaily: result.historicalAvgDaily,
    vsTypicalPct: typicalCents > 0 ? Math.round((totalCents / typicalCents - 1) * 1000) / 10 : null,
    overallConfidence: result.overallConfidence,
    dataQuality: result.dataQuality,
    trendMultiplier: result.days[0]?.factors.trendMultiplier ?? 1,
    days: result.days.map((d) => ({
      date: d.date,
      weekday: d.dayOfWeek,
      predicted: d.predicted,
      confidence: d.confidence,
      baseline: r2(d.factors.baseLine),
      holiday: d.factors.holidayName ? { name: d.factors.holidayName, multiplier: r2(d.factors.holidayMultiplier) } : null,
      staffScheduled: d.factors.staffCount,
      staffingMultiplier: r2(d.factors.staffingMultiplier),
      peakHours: peakHours(d.hourlyBreakdown),
    })),
  };
}

export const FORECAST_ASSUMPTIONS = [
  "No weather forecast (the Sales page gets it from the browser's location); weather is neutral x1.0.",
  "No foot-traffic data; foot traffic is neutral x1.0.",
  "Holidays are US public holidays — the forecast engine always applies them.",
  "staffScheduled counts shifts already on the schedule; an unstaffed day is predicted 10% lower.",
];

/** Run the engine exactly as the Sales page does. `null` when there is too little history. */
export function runForecast(history: SalesRecord[], shifts: Shift[], today: string, days: number) {
  if (history.length < MIN_FORECAST_ROWS) return null;
  const start = today;
  const end = addDaysToKey(today, days - 1);
  const result = generateForecast(history, shifts, [], [], getUSHolidays(Number(today.slice(0, 4))), { start, end });
  return summarizeForecast(result, start, end);
}

export function viewForecastTool(ctx: ToolContext) {
  return tool({
    description:
      "Sales forecast for the next N days (default 7) from the forecasting engine the Sales page uses: predicted revenue per day with confidence, the day's baseline, holiday and staffing effects, peak hours, and the total. Quote and explain these numbers — never make up or recompute a forecast. Use for 'how busy will we be', 'expected sales', what-if staffing questions.",
    inputSchema: viewForecastInput,
    execute: ctx.exec("viewForecast", ["salesRecord", "payment", "shift"], async (data, { days }: ViewForecastArgs) => {
      const org = ctx.organizationId;
      const history = forecastSalesHistory(
        orgRows(data, "salesRecord", org).map(toSalesRowLite),
        orgRows(data, "payment", org).map(toPaymentLite),
        ctx.timeZone,
      );
      const forecast = runForecast(history, orgRows(data, "shift", org).map(toShift), ctx.today, days ?? 7);
      if (!forecast) {
        const daysOnFile = new Set(history.filter((r) => r.hour === undefined).map((r) => r.date)).size;
        return {
          today: ctx.today,
          notEnoughData: true,
          daysOfSalesOnFile: daysOnFile,
          message: `The forecast needs at least ${MIN_FORECAST_ROWS} sales records; this store has ${history.length}.`,
        };
      }
      return { today: ctx.today, ...forecast, assumptions: FORECAST_ASSUMPTIONS };
    }),
  });
}
