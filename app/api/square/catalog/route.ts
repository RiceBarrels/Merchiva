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

    // Fetch the user's Square credentials
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
