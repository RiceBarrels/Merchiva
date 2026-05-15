import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Stripe webhook receiver.
 *
 * MVP: we VERIFY the signature (so the endpoint is safe to expose) but DO NOT
 * write back to SpacetimeDB from here. SpacetimeDB v2 reducers in this repo
 * gate by `findActiveMember` which requires a user identity; the webhook has
 * no such identity. The client (Settings → Billing) instead refreshes state
 * via /api/billing/sync and applies it through the `updateOrgSubscription`
 * reducer with the owner's identity.
 *
 * Once a server-side service identity is set up, this handler can be expanded
 * to perform DB writes directly so the owner doesn't have to revisit the
 * billing page for the state to refresh.
 */
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const raw = await req.text();

  if (!sig || !secret) {
    return NextResponse.json(
      { error: "Missing signature or STRIPE_WEBHOOK_SECRET" },
      { status: 400 },
    );
  }

  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[billing/webhook] signature verification failed:", msg);
    return NextResponse.json({ error: `Bad signature: ${msg}` }, { status: 400 });
  }

  // Log to terminal for now. Extend per event type when a service identity
  // is wired up.
  console.log(`[billing/webhook] ${event.type} id=${event.id}`);

  return NextResponse.json({ received: true });
}
