import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    message: "Scan triggered. Insights are generated client-side from live SpacetimeDB data.",
    scannedAt: new Date().toISOString(),
  });
}

export async function GET() {
  return NextResponse.json({
    name: "Mr. Merchiva Daily Scan",
    description: "Triggers a data scan. Dashboard insights are computed from live SpacetimeDB data.",
    schedule: "Daily at 3:00 AM",
    endpoint: "POST /api/merchiva/scan",
  });
}
