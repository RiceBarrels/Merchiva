import { NextRequest, NextResponse } from "next/server";

interface OutscraperPopularTime {
  name: string;
  data: number[];
}

interface OutscraperResult {
  popular_times?: OutscraperPopularTime[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get("placeId");

    if (!placeId) {
      return NextResponse.json(
        { error: "Missing required parameter: placeId" },
        { status: 400 },
      );
    }

    const apiKey = process.env.OUTSCRAPER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          popularTimes: [],
          message:
            "OUTSCRAPER_API_KEY not configured. Set this environment variable to enable popular times data.",
        },
        { status: 200 },
      );
    }

    const url = new URL("https://api.app.outscraper.com/maps/search-v3");
    url.searchParams.set("query", placeId);
    url.searchParams.set("async", "false");

    const res = await fetch(url.toString(), {
      headers: {
        "X-API-KEY": apiKey,
      },
      next: { revalidate: 86400 }, // cache for 24 hours — popular times rarely change
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[forecast/popular-times] Outscraper error:", res.status, body);
      return NextResponse.json(
        { error: "Failed to fetch popular times from Outscraper" },
        { status: 502 },
      );
    }

    const data = await res.json();

    // Outscraper returns nested arrays: data is [[result1, result2, ...]]
    const results: OutscraperResult[] = Array.isArray(data)
      ? Array.isArray(data[0])
        ? data[0]
        : data
      : [];

    const place = results[0];
    if (!place?.popular_times || !Array.isArray(place.popular_times)) {
      return NextResponse.json({
        popularTimes: [],
        message: "No popular times data available for this place.",
      });
    }

    // Map day names to day-of-week numbers (0 = Sunday, matching JS Date.getDay())
    const dayNameToIndex: Record<string, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };

    const popularTimes = place.popular_times
      .map((dayEntry: OutscraperPopularTime) => {
        const dayOfWeek = dayNameToIndex[dayEntry.name];
        if (dayOfWeek === undefined) return null;

        // data is an array of 24 popularity values (hour 0-23), values 0-100
        const hours = dayEntry.data.map((popularity: number, hour: number) => ({
          hour,
          popularity,
        }));

        return { dayOfWeek, hours };
      })
      .filter(Boolean);

    return NextResponse.json({ popularTimes });
  } catch (err) {
    console.error("[forecast/popular-times]", err);
    return NextResponse.json(
      { error: "Internal server error fetching popular times" },
      { status: 500 },
    );
  }
}
