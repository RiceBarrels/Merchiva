import { NextRequest, NextResponse } from "next/server";
import { matchAllowedOrigin } from "@/lib/allowed-origins";
import { API_CORS_ORIGINS } from "@/lib/api-cors";
import { stripe, proPriceEnvNames, resolveProPriceId } from "@/lib/stripe";

export const runtime = "nodejs";

interface CheckoutBody {
  orgId?: string;
  interval?: "month" | "year";
  // Optional existing customer id when org already has one. In subscription
  // mode, Stripe creates a customer automatically when this is omitted.
  stripeCustomerId?: string | null;
  customerEmail?: string;
  // Where Stripe sends the user back after checkout. Defaults to the billing
  // settings page; the /manager/subscribe paywall passes "/manager/subscribe" so a blocked
  // org returns to the gate page (which forwards to the dashboard once active).
  returnPath?: string;
}

// Only allow internal app paths as the post-checkout return target.
function safeReturnPath(p?: string): string {
  // /choose embeds the paywall (SubscribePanel) so it is a valid return too.
  if (p && (p.startsWith("/manager/") || p === "/choose") && !p.startsWith("//")) return p;
  return "/manager/settings/billing";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CheckoutBody;
    const orgId = body.orgId?.trim();
    const interval = body.interval === "year" ? "year" : "month";
    const returnPath = safeReturnPath(body.returnPath);

    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    const priceId = resolveProPriceId(interval);
    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price for ${interval} not configured (${proPriceEnvNames(interval)})` },
        { status: 500 },
      );
    }

    // The Origin header is fully controlled by a non-browser caller, and the
    // path allowlist above buys nothing if the HOST is attacker-chosen: they
    // could obtain a genuine checkout.stripe.com link that redirects the payer
    // to their own site afterwards, carrying the session id. Trust the header
    // only when it is one of ours; otherwise use the deployment's own origin.
    const claimedOrigin = req.headers.get("origin");
    const origin =
      matchAllowedOrigin(claimedOrigin, API_CORS_ORIGINS) ||
      process.env.NEXT_PUBLIC_APP_URL ||
      req.nextUrl.origin ||
      "";

    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Existing customer wins; otherwise subscription mode creates one.
      ...(body.stripeCustomerId
        ? { customer: body.stripeCustomerId }
        : body.customerEmail
          ? { customer_email: body.customerEmail }
          : {}),
      // Always attach orgId twice: once on the session (for cleanup after
      // success_url) and once on the subscription (so webhook events can
      // resolve the org without needing to fetch the session).
      metadata: { orgId },
      subscription_data: { metadata: { orgId } },
      success_url: `${origin}${returnPath}?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${origin}${returnPath}?status=canceled`,
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
