import { NextRequest, NextResponse } from "next/server";
import { verifiedUserId } from "@/lib/auth/verify-token";
import { stripe, fetchSubscriptionSnapshot } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Fetch the latest subscription state from Stripe for a given org. The client
 * (Settings → Billing) calls this on mount and after returning from checkout,
 * then applies the result to SpacetimeDB via the `updateOrgSubscription`
 * reducer.
 *
 * Inputs (query):
 *   - sessionId: optional, Stripe Checkout Session id. When present we resolve
 *     the customer from the session — used after a fresh checkout where we
 *     don't yet have a customerId on the org row.
 *   - stripeCustomerId: optional, when the org already has a customer.
 *
 * Returns: SubscriptionSnapshot, or 404 if no customer can be resolved.
 */
export async function GET(req: NextRequest) {
  try {
    // Returned a named customer's subscription state to anyone who asked.
    // Same caveat as /api/billing/portal: this proves the caller is signed in,
    // not that the customer is theirs.
    const userId = await verifiedUserId(req.headers.get("authorization"));
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sp = req.nextUrl.searchParams;
    const sessionId = sp.get("sessionId");
    let stripeCustomerId = sp.get("stripeCustomerId");

    if (!stripeCustomerId && sessionId) {
      const session = await stripe().checkout.sessions.retrieve(sessionId);
      const customer = session.customer;
      stripeCustomerId =
        typeof customer === "string" ? customer : customer?.id ?? null;
    }

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: "Provide sessionId or stripeCustomerId" },
        { status: 400 },
      );
    }

    const snapshot = await fetchSubscriptionSnapshot(stripeCustomerId);
    return NextResponse.json(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing/sync] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
