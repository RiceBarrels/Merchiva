import { NextResponse } from "next/server";
import { SquareClient, SquareEnvironment } from "square";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { getValidSquareToken } from "@/lib/square/token";

export async function GET() {
  try {
    const supabase = await createSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = await getValidSquareToken(user.id);
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
