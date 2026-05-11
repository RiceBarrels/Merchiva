import { NextRequest, NextResponse } from "next/server";

const AI_SERVICE_URL = process.env.MERCHIVA_AI_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { org_id, records, location, min_days } = body;

    if (!org_id || !records?.length) {
      return NextResponse.json(
        { error: "Missing required fields: org_id, records" },
        { status: 400 },
      );
    }

    if (records.length < 100) {
      return NextResponse.json(
        { error: `Need at least 100 item-day records for training, got ${records.length}` },
        { status: 400 },
      );
    }

    const resp = await fetch(`${AI_SERVICE_URL}/train`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id,
        records,
        location: location ?? undefined,
        min_days: min_days ?? 20,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: "AI service error" }));
      return NextResponse.json(
        { error: err.detail ?? "Training failed" },
        { status: resp.status },
      );
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[ai/train]", err);
    return NextResponse.json(
      { error: "Failed to connect to AI service" },
      { status: 503 },
    );
  }
}
