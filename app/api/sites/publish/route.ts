import { NextRequest, NextResponse } from "next/server";
import { updateSite } from "@/lib/db/sites";

export async function POST(req: NextRequest) {
  try {
    const { siteId, published } = (await req.json()) as {
      siteId: string;
      published: boolean;
    };

    if (!siteId || typeof published !== "boolean") {
      return NextResponse.json({ error: "siteId and published are required" }, { status: 400 });
    }

    await updateSite(siteId, { published });
    return NextResponse.json({ success: true, published });
  } catch (err) {
    console.error("Publish route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
