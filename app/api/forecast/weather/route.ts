import { NextRequest, NextResponse } from "next/server";

// WMO weather code → human-readable condition
function mapWeatherCode(code: number): string {
  if (code <= 1) return "sunny";
  if (code <= 3) return "cloudy";
  if (code >= 45 && code <= 48) return "cloudy";
  if (code >= 51 && code <= 67) return "rainy";
  if (code >= 71 && code <= 77) return "snowy";
  if (code >= 80 && code <= 82) return "rainy";
  if (code >= 85 && code <= 86) return "snowy";
  if (code >= 95 && code <= 99) return "stormy";
  return "cloudy";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const days = searchParams.get("days") ?? "7";

    if (!lat || !lng) {
      return NextResponse.json(
        { error: "Missing required parameters: lat, lng" },
        { status: 400 },
      );
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const forecastDays = Math.min(Math.max(parseInt(days, 10) || 7, 1), 16);

    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json(
        { error: "Invalid lat/lng values" },
        { status: 400 },
      );
    }

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set(
      "daily",
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    );
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", String(forecastDays));

    const res = await fetch(url.toString(), {
      next: { revalidate: 1800 }, // cache for 30 minutes
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[forecast/weather] Open-Meteo error:", res.status, body);
      return NextResponse.json(
        { error: "Failed to fetch weather data from Open-Meteo" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const daily = data.daily;

    if (!daily || !daily.time) {
      return NextResponse.json(
        { error: "Unexpected response format from Open-Meteo" },
        { status: 502 },
      );
    }

    const forecasts = daily.time.map((date: string, i: number) => ({
      date,
      condition: mapWeatherCode(daily.weather_code[i]),
      tempHigh: daily.temperature_2m_max[i],
      tempLow: daily.temperature_2m_min[i],
      precipProbability: (daily.precipitation_probability_max[i] ?? 0) / 100,
    }));

    return NextResponse.json({ forecasts });
  } catch (err) {
    console.error("[forecast/weather]", err);
    return NextResponse.json(
      { error: "Internal server error fetching weather forecast" },
      { status: 500 },
    );
  }
}
