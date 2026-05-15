import { NextRequest, NextResponse } from "next/server";
import { stripe, resolveProPriceId } from "@/lib/stripe";

export const runtime = "nodejs";

interface CheckoutBody {
  orgId?: string;
  interval?: "month" | "year";
  // Optional existing customer id (when org already has one). When omitted,
  // Stripe creates a new customer for this session and we attach the orgId
  // via metadata so the webhook + sync can map back to the org.
  stripeCustomerId?: string | null;
  customerEmail?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CheckoutBody;
    const orgId = body.orgId?.trim();
    const interval = body.interval === "year" ? "year" : "month";

    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    const priceId = resolveProPriceId(interval);
    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price for ${interval} not configured (STRIPE_PRO_${interval.toUpperCase()}_PRICE_ID)` },
        { status: 500 },
      );
    }

    const origin =
      req.headers.get("origin") ||
      req.nextUrl.origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "";

    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Existing customer wins; otherwise create one and tag it with our orgId
      // via metadata so the webhook can map back.
      ...(body.stripeCustomerId
        ? { customer: body.stripeCustomerId }
        : {
            customer_creation: "always",
            customer_email: body.customerEmail || undefined,
          }),
      // Always attach orgId twice: once on the session (for cleanup after
      // success_url) and once on the subscription (so webhook events can
      // resolve the org without needing to fetch the session).
      metadata: { orgId },
      subscription_data: { metadata: { orgId } },
      success_url: `${origin}/~/settings/billing?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${origin}/~/settings/billing?status=canceled`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing/checkout] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
