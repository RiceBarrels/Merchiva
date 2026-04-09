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

    const square = new SquareClient({
      token,
      environment: SquareEnvironment.Production,
    });

    const items: unknown[] = [];
    const page = await square.catalog.list({ types: "ITEM,ITEM_VARIATION" });
    for await (const item of page) {
      items.push(item);
    }

    return NextResponse.json({ items });
  } catch (err) {
    console.error("[square/catalog]", err);
    return NextResponse.json({ error: "Failed to fetch catalog" }, { status: 500 });
  }
}
