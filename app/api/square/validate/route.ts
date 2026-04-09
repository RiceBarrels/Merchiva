import { NextRequest, NextResponse } from "next/server";
import { SquareClient, SquareEnvironment } from "square";

/**
 * POST /api/square/validate
 * Validates a Square access token + location ID before saving credentials.
 * Accepts { accessToken, locationId } in the request body.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { accessToken, locationId } = body as {
      accessToken?: string;
      locationId?: string;
    };

    if (!accessToken || !locationId) {
      return NextResponse.json(
        { error: "accessToken and locationId are required." },
        { status: 400 }
      );
    }

    const square = new SquareClient({
      token: accessToken,
      environment: SquareEnvironment.Production,
    });

    // Lightweight ping — list locations and verify the provided locationId exists
    const locationsResponse = await square.locations.list();
    const locations = locationsResponse.locations ?? [];
    const found = locations.some((l) => l.id === locationId);

    if (!found) {
      return NextResponse.json(
        { error: "Location ID not found in your Square account." },
        { status: 400 }
      );
    }

    return NextResponse.json({ valid: true });
  } catch (err) {
    console.error("[square/validate]", err);
    return NextResponse.json(
      { error: "Invalid credentials. Check your access token." },
      { status: 400 }
    );
  }
}
