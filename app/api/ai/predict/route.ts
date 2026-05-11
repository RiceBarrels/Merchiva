import { NextRequest, NextResponse } from "next/server";

const AI_SERVICE_URL = process.env.MERCHIVA_AI_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { org_id, dates, top_n } = body;

    if (!org_id || !dates?.length) {
      return NextResponse.json(
        { error: "Missing required fields: org_id, dates" },
        { status: 400 },
      );
    }

    const resp = await fetch(`${AI_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id, dates, top_n }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: "AI service error" }));
      return NextResponse.json(
        { error: err.detail ?? "Prediction failed" },
        { status: resp.status },
      );
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[ai/predict]", err);
    return NextResponse.json(
      { error: "Failed to connect to AI service" },
      { status: 503 },
    );
  }
}
