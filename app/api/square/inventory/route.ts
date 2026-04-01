import { NextResponse } from "next/server";
import { SquareClient, SquareEnvironment } from "square";
import { createClient as createSupabase } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: settings } = await supabase
      .from("settings")
      .select("square_access_token, square_location_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!settings?.square_access_token) {
      return NextResponse.json(
        { error: "Square not connected. Add credentials in Settings." },
        { status: 400 }
      );
    }

    const square = new SquareClient({
      token: settings.square_access_token,
      environment: SquareEnvironment.Production,
    });

    // First get catalog variation IDs
    const variationIds: string[] = [];
    const catalogPage = await square.catalog.list({ types: "ITEM_VARIATION" });
    for await (const obj of catalogPage) {
      if (obj.type !== "ITEM_VARIATION") continue;
      if (obj.id) variationIds.push(obj.id);
    }

    if (variationIds.length === 0) {
      return NextResponse.json({ counts: [] });
    }

    // Batch fetch inventory counts
    const counts: unknown[] = [];
    const countsPage = await square.inventory.batchGetCounts({
      catalogObjectIds: variationIds.slice(0, 100),
      locationIds: settings.square_location_id
        ? [settings.square_location_id]
        : undefined,
    });
    for await (const count of countsPage) {
      counts.push(count);
    }

    return NextResponse.json({ counts });
  } catch (err) {
    console.error("[square/inventory]", err);
    return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 });
  }
}
