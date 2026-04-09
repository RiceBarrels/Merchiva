import { NextRequest, NextResponse } from "next/server";
import { SquareClient, SquareEnvironment } from "square";
import { getValidSquareToken } from "@/lib/square/token";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = await getValidSquareToken(user.id);
    const { data: settings } = await supabase
      .from("settings")
      .select("square_location_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!token || !settings?.square_location_id) {
      return NextResponse.json(
        { error: "Square not connected or location ID missing." },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get("days") ?? "30", 10);

    const startAt = new Date();
    startAt.setDate(startAt.getDate() - days);

    const square = new SquareClient({
      token,
      environment: SquareEnvironment.Production,
    });

    const response = await square.orders.search({
      locationIds: [settings.square_location_id],
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
