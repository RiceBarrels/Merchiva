import { NextResponse } from "next/server";
import { SquareClient, SquareEnvironment } from "square";
import { getValidSquareToken } from "@/lib/square/token";

export async function GET() {
  const supabase = await createSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await getValidSquareToken(user.id);
  if (!token) {
    return NextResponse.json(
      { error: "Square not connected." },
      { status: 400 }
    );
  }

  const square = new SquareClient({
    token,
    environment: SquareEnvironment.Production,
  });

  const response = await square.locations.list();
  const locations = (response.locations ?? [])
    .filter((l) => l.status === "ACTIVE")
    .map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address
        ? [l.address.addressLine1, l.address.locality, l.address.administrativeDistrictLevel1]
            .filter(Boolean)
            .join(", ")
        : null,
    }));

  return NextResponse.json({ locations });
}
