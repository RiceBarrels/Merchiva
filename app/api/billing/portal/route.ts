import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

interface PortalBody {
  stripeCustomerId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PortalBody;
    const customerId = body.stripeCustomerId?.trim();
    if (!customerId) {
      return NextResponse.json(
        { error: "stripeCustomerId required" },
        { status: 400 },
      );
    }

    const origin =
      req.headers.get("origin") ||
      req.nextUrl.origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "";

    const session = await stripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/~/settings/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing/portal] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
