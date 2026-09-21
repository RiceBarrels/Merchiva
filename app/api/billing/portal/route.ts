import { NextRequest, NextResponse } from "next/server";
import { verifiedUserId } from "@/lib/auth/verify-token";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

interface PortalBody {
  stripeCustomerId?: string;
}

export async function POST(req: NextRequest) {
  try {
    // This endpoint mints a Stripe billing-portal session, from which the
    // holder can cancel the subscription, change the payment method and read
    // every past invoice with its billing address. It used to require no
    // authentication at all: any `cus_…` in the body was enough.
    //
    // NOTE: this proves the caller is a signed-in Merchiva user, not that the
    // customer id is theirs. Tying it to the org needs a server-side read of
    // organization.stripeCustomerId, and the service identity currently sees
    // no rows (see the "WHY THERE IS NO SERVICE IDENTITY RULE" note in
    // spacetimedb/src/index.ts). The id itself only reaches a member through
    // the org row, which IS RLS-scoped.
    const userId = await verifiedUserId(req.headers.get("authorization"));
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      return_url: `${origin}/manager/settings/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing/portal] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
