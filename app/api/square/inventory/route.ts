import { NextResponse } from "next/server";
import { SquareClient, SquareEnvironment } from "square";
import { getValidSquareToken } from "@/lib/square/token";

export async function GET() {
  try {

    const token = await getValidSquareToken("");
    if (!token) {
      return NextResponse.json(
        { error: "Square not connected. Connect in Settings." },
        { status: 400 }
      );
    }

    // Still need location_id for inventory queries
    

    const square = new SquareClient({
      token,
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
      locationIds: undefined,
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
