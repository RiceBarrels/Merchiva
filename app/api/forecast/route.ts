import { NextRequest, NextResponse } from "next/server";
import { getUSHolidays } from "@/lib/forecast";

interface WeatherForecastItem {
  date: string;
  condition: string;
  tempHigh: number;
  tempLow: number;
  precipProbability: number;
}

interface PopularTimesItem {
  dayOfWeek: number;
  hours: { hour: number; popularity: number }[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const placeId = searchParams.get("placeId");
    const days = searchParams.get("days") ?? "7";

    if (!lat || !lng) {
      return NextResponse.json(
        { error: "Missing required parameters: lat, lng" },
        { status: 400 },
      );
    }

    // Build the base URL for internal API calls
    const origin = request.nextUrl.origin;

    // Fetch weather and popular times in parallel
    const weatherPromise = fetch(
      `${origin}/api/forecast/weather?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&days=${encodeURIComponent(days)}`,
    )
      .then(async (res) => {
        if (!res.ok) return { forecasts: [] as WeatherForecastItem[] };
        return res.json() as Promise<{ forecasts: WeatherForecastItem[] }>;
      })
      .catch((err) => {
        console.error("[forecast] Weather fetch failed:", err);
        return { forecasts: [] as WeatherForecastItem[] };
      });

    const popularTimesPromise = placeId
      ? fetch(
          `${origin}/api/forecast/popular-times?placeId=${encodeURIComponent(placeId)}`,
        )
          .then(async (res) => {
            if (!res.ok)
              return { popularTimes: [] as PopularTimesItem[], message: undefined };
            return res.json() as Promise<{
              popularTimes: PopularTimesItem[];
              message?: string;
            }>;
          })
          .catch((err) => {
            console.error("[forecast] Popular times fetch failed:", err);
            return { popularTimes: [] as PopularTimesItem[], message: undefined };
          })
      : Promise.resolve({
          popularTimes: [] as PopularTimesItem[],
          message: "No placeId provided — skipping popular times.",
        });

    const [weatherResult, popularTimesResult] = await Promise.all([
      weatherPromise,
      popularTimesPromise,
    ]);

    // Compute holidays for the forecast date range
    const forecastDays = parseInt(days, 10) || 7;
    const now = new Date();
    const yearsInRange = new Set<number>();
    for (let i = 0; i < forecastDays; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      yearsInRange.add(d.getFullYear());
    }

    const holidays: { date: string; name: string }[] = [];
    for (const year of yearsInRange) {
      holidays.push(...getUSHolidays(year));
    }

    // Filter holidays to only those within the forecast window
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + forecastDays);

    const relevantHolidays = holidays.filter((h) => {
      const [y, m, d] = h.date.split("-").map(Number);
      const hDate = new Date(y, m - 1, d);
      return hDate >= startDate && hDate <= endDate;
    });

    return NextResponse.json({
      weather: weatherResult.forecasts,
      popularTimes: popularTimesResult.popularTimes,
      holidays: relevantHolidays,
      ...(popularTimesResult.message
        ? { popularTimesMessage: popularTimesResult.message }
        : {}),
    });
  } catch (err) {
    console.error("[forecast]", err);
    return NextResponse.json(
      { error: "Internal server error generating forecast data" },
      { status: 500 },
    );
  }
}
