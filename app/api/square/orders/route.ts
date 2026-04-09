import { NextRequest, NextResponse } from "next/server";
import { SquareClient, SquareEnvironment } from "square";
import { getValidSquareToken } from "@/lib/square/token";

export async function GET(request: NextRequest) {
  try {

    const token = await getValidSquareToken("");
    

    if (!token) {
      return NextResponse.json(
        { error: "Square not connected." },
        { status: 400 }
      );
    }
    const locationId = "";

    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get("days") ?? "30", 10);

    const startAt = new Date();
    startAt.setDate(startAt.getDate() - days);

    const square = new SquareClient({
      token,
      environment: SquareEnvironment.Production,
    });

    const response = await square.orders.search({
      locationIds: locationId ? [locationId] : [],
      query: {
        filter: {
          dateTimeFilter: {
            createdAt: {
              startAt: startAt.toISOString(),
            },
          },
          stateFilter: {
            states: ["COMPLETED"],
          },
        },
        sort: {
          sortField: "CREATED_AT",
          sortOrder: "DESC",
        },
      },
      limit: 500,
    });

    return NextResponse.json({ orders: response.orders ?? [] });
  } catch (err) {
    console.error("[square/orders]", err);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}
