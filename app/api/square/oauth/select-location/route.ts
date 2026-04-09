import { NextRequest, NextResponse } from "next/server";
import { SquareClient, SquareEnvironment } from "square";
import { getValidSquareToken } from "@/lib/square/token";

export async function POST(request: NextRequest) {
  const supabase = await createSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { locationId } = (await request.json()) as { locationId?: string };
  if (!locationId) {
    return NextResponse.json(
      { error: "locationId is required." },
      { status: 400 }
    );
  }

  const token = await getValidSquareToken(user.id);
  if (!token) {
    return NextResponse.json(
      { error: "Square not connected." },
      { status: 400 }
    );
  }

  // Validate the location exists in the merchant's account
  const square = new SquareClient({
    token,
    environment: SquareEnvironment.Production,
  });

  const locationsResponse = await square.locations.list();
  const found = (locationsResponse.locations ?? []).some(
    (l) => l.id === locationId
  );

  if (!found) {
    return NextResponse.json(
      { error: "Location not found in your Square account." },
      { status: 400 }
    );
  }

  await supabase
    .from("settings")
    .update({ square_location_id: locationId })
    .eq("user_id", user.id);

  return NextResponse.json({ success: true });
}
