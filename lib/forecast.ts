// ─── Multi-Factor Sales Prediction Engine ───────────────────────────────────
// Pure utility — no React, no API calls.

import type { SalesRecord, Shift } from "@/lib/types";

// ─── Output Types ───────────────────────────────────────────────────────────

export interface ForecastDay {
  date: string;
  dayOfWeek: string;
  predicted: number;
  confidence: number;
  factors: {
    baseLine: number;
    weatherMultiplier: number;
    weatherLabel: string;
    holidayMultiplier: number;
    holidayName: string | null;
    footTrafficMultiplier: number;
    footTrafficLevel: "low" | "medium" | "high" | "very_high";
    staffingMultiplier: number;
    staffCount: number;
    trendMultiplier: number;
  };
  hourlyBreakdown: { hour: number; predicted: number }[];
}

export interface ForecastResult {
  days: ForecastDay[];
  overallConfidence: number;
  dataQuality: "excellent" | "good" | "fair" | "poor";
  historicalAvgDaily: number;
}

export interface WeatherForecast {
  date: string;
  condition: string;
  tempHigh: number;
  tempLow: number;
  precipProbability: number;
}

export interface PopularTimesData {
  dayOfWeek: number;
  hours: { hour: number; popularity: number }[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Fallback multipliers only used when no historical data exists for a condition
const FALLBACK_WEATHER_MULTIPLIERS: Record<string, number> = {
  sunny: 1.1,
  cloudy: 1.0,
  rainy: 0.85,
  snowy: 0.75,
  stormy: 0.65,
};

// Default hourly distribution (bell curve peaking at 12pm)
const DEFAULT_HOURLY_WEIGHTS: number[] = Array.from({ length: 24 }, (_, h) => {
  // Gaussian-ish curve centered at 12, sigma ~3.5
  const dist = Math.exp(-0.5 * ((h - 12) / 3.5) ** 2);
  // Zero out very early / very late hours
  if (h < 6 || h > 22) return 0;
  return dist;
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Nth weekday of a month (1-indexed). Returns ISO string. */
function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  n: number,
): string {
  const first = new Date(year, month, 1);
  let dayOfMonth = 1 + ((weekday - first.getDay() + 7) % 7);
  dayOfMonth += (n - 1) * 7;
  return toISO(new Date(year, month, dayOfMonth));
}

/** Last weekday of a month. Returns ISO string. */
function lastWeekday(year: number, month: number, weekday: number): string {
  const lastDay = new Date(year, month + 1, 0);
  const diff = (lastDay.getDay() - weekday + 7) % 7;
  return toISO(new Date(year, month, lastDay.getDate() - diff));
}

// ─── US Holidays ────────────────────────────────────────────────────────────

export function getUSHolidays(
  year: number,
): { date: string; name: string }[] {
  return [
    { date: `${year}-01-01`, name: "New Year's Day" },
    {
      date: nthWeekday(year, 0, 1, 3), // 3rd Monday of January
      name: "Martin Luther King Jr. Day",
    },
    {
      date: nthWeekday(year, 1, 1, 3), // 3rd Monday of February
      name: "Presidents' Day",
    },
    {
      date: lastWeekday(year, 4, 1), // Last Monday of May
      name: "Memorial Day",
    },
    { date: `${year}-07-04`, name: "Independence Day" },
    {
      date: nthWeekday(year, 8, 1, 1), // 1st Monday of September
      name: "Labor Day",
    },
    {
      date: nthWeekday(year, 9, 1, 2), // 2nd Monday of October
      name: "Columbus Day",
    },
    { date: `${year}-11-11`, name: "Veterans Day" },
    {
      date: nthWeekday(year, 10, 4, 4), // 4th Thursday of November
      name: "Thanksgiving",
    },
    { date: `${year}-12-25`, name: "Christmas Day" },
  ];
}

// ─── Step 1: Baseline — Day-of-week average ────────────────────────────────

interface BaselineResult {
  dayOfWeekAverages: number[];
  overallAverage: number;
  daysOfHistory: number;
  dataQuality: "excellent" | "good" | "fair" | "poor";
}

function computeBaseline(
  salesHistory: SalesRecord[],
  referenceDate: string,
): BaselineResult {
  // Aggregate daily totals (sum hourly records into days)
  const dailyTotals = new Map<string, number>();
  for (const rec of salesHistory) {
    const prev = dailyTotals.get(rec.date) ?? 0;
    dailyTotals.set(rec.date, prev + rec.actual);
  }

  const refTime = parseDate(referenceDate).getTime();
  const ninetyDaysMs = 90 * 86_400_000;

  // Filter to last 90 days from reference date
  const relevantDays: { date: string; dow: number; revenue: number }[] = [];
  for (const [date, revenue] of dailyTotals) {
    const dateTime = parseDate(date).getTime();
    if (dateTime <= refTime && refTime - dateTime <= ninetyDaysMs) {
      relevantDays.push({
        date,
        dow: parseDate(date).getDay(),
        revenue,
      });
    }
  }

  const daysOfHistory = relevantDays.length;

  // Weighted averages: recent data (last 45 days) weighted 2x
  const fortyFiveDaysMs = 45 * 86_400_000;
  const dowSums = new Array<number>(7).fill(0);
  const dowWeights = new Array<number>(7).fill(0);

  let totalWeightedSum = 0;
  let totalWeight = 0;

  for (const day of relevantDays) {
    const age = refTime - parseDate(day.date).getTime();
    const weight = age <= fortyFiveDaysMs ? 2 : 1;

    dowSums[day.dow] += day.revenue * weight;
    dowWeights[day.dow] += weight;

    totalWeightedSum += day.revenue * weight;
    totalWeight += weight;
  }

  const overallAverage = totalWeight > 0 ? totalWeightedSum / totalWeight : 0;

  const dayOfWeekAverages = dowSums.map((sum, i) =>
    dowWeights[i] > 0 ? sum / dowWeights[i] : overallAverage,
  );

  let dataQuality: "excellent" | "good" | "fair" | "poor";
  if (daysOfHistory >= 60) dataQuality = "excellent";
  else if (daysOfHistory >= 30) dataQuality = "good";
  else if (daysOfHistory >= 14) dataQuality = "fair";
  else dataQuality = "poor";

  return { dayOfWeekAverages, overallAverage, daysOfHistory, dataQuality };
}

// ─── Step 2: Weather multiplier (DATA-DRIVEN) ──────────────────────────────
// Derives multiplier from what actually happened on past days with this weather condition.

function deriveWeatherMultipliers(salesHistory: SalesRecord[], overallAvg: number): Record<string, number> {
  const byCond: Record<string, { sum: number; count: number }> = {};
  for (const rec of salesHistory) {
    if (!rec.weather || rec.hour !== undefined) continue;
    const cond = rec.weather.toLowerCase();
    if (!byCond[cond]) byCond[cond] = { sum: 0, count: 0 };
    byCond[cond].sum += rec.actual;
    byCond[cond].count += 1;
  }
  const derived: Record<string, number> = {};
  for (const [cond, { sum, count }] of Object.entries(byCond)) {
    if (count >= 3 && overallAvg > 0) {
      derived[cond] = (sum / count) / overallAvg;
    }
  }
  return derived;
}

function getWeatherMultiplier(
  forecast: WeatherForecast | undefined,
  dataMultipliers: Record<string, number>,
): {
  multiplier: number;
  label: string;
} {
  if (!forecast) return { multiplier: 1.0, label: "unknown" };

  const conditionKey = forecast.condition.toLowerCase();
  // Use historically-derived multiplier if we have enough data, otherwise fallback
  const conditionMult = dataMultipliers[conditionKey]
    ?? FALLBACK_WEATHER_MULTIPLIERS[conditionKey]
    ?? 1.0;

  const multiplier = lerp(1.0, conditionMult, forecast.precipProbability);
  return { multiplier, label: forecast.condition };
}

// ─── Step 3: Holiday multiplier (DATA-DRIVEN) ──────────────────────────────
// Derives multiplier from what actually happened on past holidays.

const CLOSED_HOLIDAYS = new Set(["Christmas Day"]);
const MAJOR_HOLIDAYS = new Set([
  "Thanksgiving",
  "Christmas Day",
  "New Year's Day",
  "Independence Day",
]);

function deriveHolidayMultiplier(salesHistory: SalesRecord[], overallAvg: number): number {
  if (overallAvg <= 0) return 1.25;
  const holidayDays: number[] = [];
  const dailyTotals = new Map<string, number>();
  for (const rec of salesHistory) {
    if (rec.hour !== undefined) continue;
    dailyTotals.set(rec.date, (dailyTotals.get(rec.date) ?? 0) + rec.actual);
  }
  for (const rec of salesHistory) {
    if (rec.isHoliday && rec.hour === undefined) {
      const total = dailyTotals.get(rec.date);
      if (total !== undefined) holidayDays.push(total);
    }
  }
  if (holidayDays.length >= 2) {
    const avg = holidayDays.reduce((a, b) => a + b, 0) / holidayDays.length;
    return avg / overallAvg;
  }
  return 1.25; // fallback
}

function getHolidayMultiplier(
  date: string,
  holidays: { date: string; name: string }[],
  historicalHolidayMult: number,
): { multiplier: number; name: string | null } {
  // Check exact match
  const exact = holidays.find((h) => h.date === date);
  if (exact) {
    if (CLOSED_HOLIDAYS.has(exact.name)) {
      return { multiplier: 0.3, name: exact.name };
    }
    return { multiplier: historicalHolidayMult, name: exact.name };
  }

  // Check day before/after major holidays
  const dateMs = parseDate(date).getTime();
  for (const h of holidays) {
    if (!MAJOR_HOLIDAYS.has(h.name)) continue;
    const holidayMs = parseDate(h.date).getTime();
    const diff = Math.abs(dateMs - holidayMs);
    if (diff === 86_400_000) {
      const label =
        dateMs < holidayMs ? `Day before ${h.name}` : `Day after ${h.name}`;
      return { multiplier: 1.1, name: label };
    }
  }

  return { multiplier: 1.0, name: null };
}

// ─── Step 4: Foot traffic multiplier ────────────────────────────────────────

function getFootTrafficMultiplier(
  dayOfWeek: number,
  popularTimes: PopularTimesData[],
): { multiplier: number; level: "low" | "medium" | "high" | "very_high" } {
  const dayData = popularTimes.find((pt) => pt.dayOfWeek === dayOfWeek);
  if (!dayData || dayData.hours.length === 0) {
    return { multiplier: 1.0, level: "medium" };
  }

  // Average popularity during business hours (7am-10pm)
  const businessHours = dayData.hours.filter(
    (h) => h.hour >= 7 && h.hour <= 22,
  );
  if (businessHours.length === 0) {
    return { multiplier: 1.0, level: "medium" };
  }

  const dayAvg =
    businessHours.reduce((sum, h) => sum + h.popularity, 0) /
    businessHours.length;

  // Compute weekly average across all days in popularTimes
  let weeklyTotal = 0;
  let weeklyCount = 0;
  for (const pt of popularTimes) {
    const bh = pt.hours.filter((h) => h.hour >= 7 && h.hour <= 22);
    for (const h of bh) {
      weeklyTotal += h.popularity;
      weeklyCount++;
    }
  }

  const weeklyAvg = weeklyCount > 0 ? weeklyTotal / weeklyCount : dayAvg;

  // Normalize: ratio of this day's avg to the weekly avg
  const multiplier = weeklyAvg > 0 ? dayAvg / weeklyAvg : 1.0;

  // Classify level
  let level: "low" | "medium" | "high" | "very_high";
  if (dayAvg < 25) level = "low";
  else if (dayAvg < 50) level = "medium";
  else if (dayAvg < 75) level = "high";
  else level = "very_high";

  return { multiplier, level };
}

// ─── Step 5: Staffing multiplier (DATA-DRIVEN) ─────────────────────────────
// Derives the correlation between staff count and revenue from historical data.

function deriveStaffingCorrelation(
  salesHistory: SalesRecord[],
  shifts: Shift[],
): { slope: number; avgStaff: number } {
  const dailyTotals = new Map<string, number>();
  for (const rec of salesHistory) {
    if (rec.hour !== undefined) continue;
    dailyTotals.set(rec.date, (dailyTotals.get(rec.date) ?? 0) + rec.actual);
  }

  const points: { staff: number; revenue: number }[] = [];
  const shiftsByDate = new Map<string, number>();
  for (const s of shifts) {
    shiftsByDate.set(s.date, (shiftsByDate.get(s.date) ?? 0) + 1);
  }

  for (const [date, revenue] of dailyTotals) {
    const staffCount = shiftsByDate.get(date);
    if (staffCount !== undefined && staffCount > 0) {
      points.push({ staff: staffCount, revenue });
    }
  }

  if (points.length < 5) {
    const avgStaff = points.length > 0
      ? points.reduce((s, p) => s + p.staff, 0) / points.length
      : 3;
    return { slope: 0.15, avgStaff };
  }

  const avgStaff = points.reduce((s, p) => s + p.staff, 0) / points.length;
  const avgRev = points.reduce((s, p) => s + p.revenue, 0) / points.length;

  // Normalized slope: how much does 1 extra staff member change revenue (as %)
  let numSum = 0, denSum = 0;
  for (const p of points) {
    numSum += (p.staff - avgStaff) * (p.revenue - avgRev);
    denSum += (p.staff - avgStaff) ** 2;
  }
  const rawSlope = denSum > 0 ? numSum / denSum : 0;
  const normalizedSlope = avgRev > 0 ? clamp(rawSlope / avgRev, 0.02, 0.3) : 0.15;

  return { slope: normalizedSlope, avgStaff };
}

function getStaffingMultiplier(
  date: string,
  shifts: Shift[],
  staffCorrelation: { slope: number; avgStaff: number },
): { multiplier: number; staffCount: number } {
  const dateShifts = shifts.filter((s) => s.date === date);
  const staffCount = dateShifts.length;

  if (staffCount === 0) {
    return { multiplier: 0.9, staffCount: 0 };
  }

  if (staffCorrelation.avgStaff <= 0) {
    return { multiplier: 1.0, staffCount };
  }

  const diff = staffCount - staffCorrelation.avgStaff;
  const multiplier = clamp(1.0 + diff * staffCorrelation.slope, 0.7, 1.3);
  return { multiplier, staffCount };
}

// ─── Step 6: Trend multiplier ───────────────────────────────────────────────

function computeTrendMultiplier(
  salesHistory: SalesRecord[],
  referenceDate: string,
): number {
  // Aggregate daily totals
  const dailyTotals = new Map<string, number>();
  for (const rec of salesHistory) {
    const prev = dailyTotals.get(rec.date) ?? 0;
    dailyTotals.set(rec.date, prev + rec.actual);
  }

  const refTime = parseDate(referenceDate).getTime();
  const thirtyDaysMs = 30 * 86_400_000;

  // Collect last 30 days
  const recentDays: { dayIndex: number; revenue: number }[] = [];
  for (const [date, revenue] of dailyTotals) {
    const dateTime = parseDate(date).getTime();
    const age = refTime - dateTime;
    if (age >= 0 && age <= thirtyDaysMs) {
      // dayIndex: 0 = oldest, 30 = most recent
      const dayIndex = 30 - Math.round(age / 86_400_000);
      recentDays.push({ dayIndex, revenue });
    }
  }

  if (recentDays.length < 3) {
    return 1.0; // Not enough data for a trend
  }

  // Simple linear regression: y = mx + b
  const n = recentDays.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (const { dayIndex, revenue } of recentDays) {
    sumX += dayIndex;
    sumY += revenue;
    sumXY += dayIndex * revenue;
    sumX2 += dayIndex * dayIndex;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 1.0;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const meanY = sumY / n;

  // Normalize slope relative to mean revenue
  const normalizedSlope = meanY > 0 ? slope / meanY : 0;

  // Multiplier: 1.0 + normalized_slope * 0.1, clamped
  return clamp(1.0 + normalizedSlope * 0.1, 0.85, 1.15);
}

// ─── Step 8: Hourly breakdown ───────────────────────────────────────────────

function computeHourlyBreakdown(
  dailyPredicted: number,
  dayOfWeek: number,
  popularTimes: PopularTimesData[],
  salesHistory: SalesRecord[],
): { hour: number; predicted: number }[] {
  let weights: number[] | null = null;

  // Strategy 1: PopularTimes hourly pattern
  const ptDay = popularTimes.find((pt) => pt.dayOfWeek === dayOfWeek);
  if (ptDay && ptDay.hours.length > 0) {
    const hourMap = new Map(ptDay.hours.map((h) => [h.hour, h.popularity]));
    weights = Array.from({ length: 24 }, (_, h) => hourMap.get(h) ?? 0);
  }

  // Strategy 2: Historical hourly pattern
  if (!weights) {
    const hourlyTotals = new Array<number>(24).fill(0);
    const hourlyCounts = new Array<number>(24).fill(0);

    for (const rec of salesHistory) {
      if (rec.hour !== undefined && rec.hour !== null) {
        const dow = parseDate(rec.date).getDay();
        if (dow === dayOfWeek) {
          hourlyTotals[rec.hour] += rec.actual;
          hourlyCounts[rec.hour] += 1;
        }
      }
    }

    const hasHourlyData = hourlyCounts.some((c) => c > 0);
    if (hasHourlyData) {
      weights = hourlyTotals.map((total, i) =>
        hourlyCounts[i] > 0 ? total / hourlyCounts[i] : 0,
      );
    }
  }

  // Strategy 3: Default bell curve
  if (!weights) {
    weights = [...DEFAULT_HOURLY_WEIGHTS];
  }

  // Normalize and distribute
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) {
    // Uniform distribution across business hours
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      predicted: h >= 7 && h <= 22 ? dailyPredicted / 16 : 0,
    }));
  }

  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    predicted: Math.round(((weights![h] / totalWeight) * dailyPredicted) * 100) / 100,
  }));
}

// ─── Step 9: Confidence score ───────────────────────────────────────────────

function computeConfidence(
  daysOfHistory: number,
  weatherForecast: WeatherForecast | undefined,
  hasPopularTimes: boolean,
  holidayInfo: { multiplier: number; name: string | null },
  salesHistory: SalesRecord[],
): number {
  // Base: 50 + (daysOfHistory / 90) * 30
  let confidence = 50 + (Math.min(daysOfHistory, 90) / 90) * 30;

  // Uncertain weather: precipProbability between 0.3 and 0.7
  if (weatherForecast) {
    const p = weatherForecast.precipProbability;
    if (p >= 0.3 && p <= 0.7) {
      confidence -= 10;
    }
  }

  // No popular times data
  if (!hasPopularTimes) {
    confidence -= 5;
  }

  // Known holiday with historical holiday data
  if (holidayInfo.name) {
    const hasHistoricalHoliday = salesHistory.some((r) => r.isHoliday);
    if (hasHistoricalHoliday) {
      confidence += 10;
    }
  }

  return clamp(Math.round(confidence), 10, 95);
}

// ─── Main: generateForecast ─────────────────────────────────────────────────

export function generateForecast(
  salesHistory: SalesRecord[],
  shifts: Shift[],
  weatherForecast: WeatherForecast[],
  popularTimes: PopularTimesData[],
  holidays: { date: string; name: string }[],
  dateRange: { start: string; end: string },
): ForecastResult {
  // Generate date list
  const dates: string[] = [];
  const startDate = parseDate(dateRange.start);
  const endDate = parseDate(dateRange.end);
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(toISO(current));
    current.setDate(current.getDate() + 1);
  }

  if (dates.length === 0) {
    return {
      days: [],
      overallConfidence: 0,
      dataQuality: "poor",
      historicalAvgDaily: 0,
    };
  }

  // Add US holidays for all years in range
  const yearsInRange = new Set<number>();
  for (const d of dates) {
    yearsInRange.add(parseDate(d).getFullYear());
  }
  const allHolidays = [...holidays];
  for (const year of yearsInRange) {
    const usHolidays = getUSHolidays(year);
    for (const ush of usHolidays) {
      // Don't duplicate if already provided
      if (!allHolidays.some((h) => h.date === ush.date)) {
        allHolidays.push(ush);
      }
    }
  }

  // Step 1: Baseline
  const baseline = computeBaseline(salesHistory, dateRange.start);

  // Data-driven derivations: learn multipliers from historical patterns
  const weatherMultipliers = deriveWeatherMultipliers(salesHistory, baseline.overallAverage);
  const holidayMult = deriveHolidayMultiplier(salesHistory, baseline.overallAverage);
  const staffCorrelation = deriveStaffingCorrelation(salesHistory, shifts);

  // Weather forecast lookup
  const weatherByDate = new Map(weatherForecast.map((w) => [w.date, w]));

  const hasPopularTimes = popularTimes.length > 0;

  // Generate each day
  const forecastDays: ForecastDay[] = [];
  let confidenceSum = 0;

  for (const date of dates) {
    const d = parseDate(date);
    const dow = d.getDay();

    // Step 1
    const baseLine = baseline.dayOfWeekAverages[dow];

    // Step 2
    const weather = getWeatherMultiplier(weatherByDate.get(date), weatherMultipliers);

    // Step 3
    const holiday = getHolidayMultiplier(date, allHolidays, holidayMult);

    // Step 4
    const footTraffic = getFootTrafficMultiplier(dow, popularTimes);

    // Step 5
    const staffing = getStaffingMultiplier(date, shifts, staffCorrelation);

    // Step 6
    const trendMultiplier = computeTrendMultiplier(salesHistory, dateRange.start);

    // Step 7: Combine
    const predicted = Math.max(
      0,
      Math.round(
        baseLine *
          weather.multiplier *
          holiday.multiplier *
          footTraffic.multiplier *
          staffing.multiplier *
          trendMultiplier *
          100,
      ) / 100,
    );

    // Step 8: Hourly breakdown
    const hourlyBreakdown = computeHourlyBreakdown(
      predicted,
      dow,
      popularTimes,
      salesHistory,
    );

    // Step 9: Confidence
    const confidence = computeConfidence(
      baseline.daysOfHistory,
      weatherByDate.get(date),
      hasPopularTimes,
      holiday,
      salesHistory,
    );
    confidenceSum += confidence;

    forecastDays.push({
      date,
      dayOfWeek: DAY_NAMES[dow],
      predicted,
      confidence,
      factors: {
        baseLine,
        weatherMultiplier: Math.round(weather.multiplier * 1000) / 1000,
        weatherLabel: weather.label,
        holidayMultiplier: holiday.multiplier,
        holidayName: holiday.name,
        footTrafficMultiplier:
          Math.round(footTraffic.multiplier * 1000) / 1000,
        footTrafficLevel: footTraffic.level,
        staffingMultiplier: Math.round(staffing.multiplier * 1000) / 1000,
        staffCount: staffing.staffCount,
        trendMultiplier: Math.round(trendMultiplier * 1000) / 1000,
      },
      hourlyBreakdown,
    });
  }

  const overallConfidence =
    forecastDays.length > 0
      ? Math.round(confidenceSum / forecastDays.length)
      : 0;

  return {
    days: forecastDays,
    overallConfidence,
    dataQuality: baseline.dataQuality,
    historicalAvgDaily: Math.round(baseline.overallAverage * 100) / 100,
  };
}
