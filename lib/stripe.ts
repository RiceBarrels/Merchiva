// Server-only Stripe helpers. Never import from a client component.

import Stripe from "stripe";

let _client: Stripe | null = null;

export function stripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }
  _client = new Stripe(key, {
    typescript: true,
  });
  return _client;
}

export interface ProPriceIds {
  monthly: string;
  yearly: string;
}

export function getProPriceIds(): ProPriceIds {
  const monthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "";
  const yearly = process.env.STRIPE_PRO_YEARLY_PRICE_ID ?? "";
  return { monthly, yearly };
}

export function resolveProPriceId(interval: "month" | "year"): string {
  const ids = getProPriceIds();
  return interval === "year" ? ids.yearly : ids.monthly;
}

/**
 * Look up org -> stripeCustomerId mapping. We CAN store this on the org row in
 * SpacetimeDB, but the webhook (no user context) needs it too. To bridge,
 * we record the orgId in Stripe customer metadata when we create the customer
 * (in /api/billing/checkout). The webhook reads stripeEvent.data.object.customer
 * → stripe.customers.retrieve → metadata.orgId.
 */

export interface SubscriptionSnapshot {
  stripeCustomerId: string;
  subscriptionStatus: Stripe.Subscription.Status | null;
  subscriptionPriceId: string | null;
  subscriptionInterval: "month" | "year" | null;
  currentPeriodEnd: number | null; // unix seconds
}

export async function fetchSubscriptionSnapshot(
  stripeCustomerId: string,
): Promise<SubscriptionSnapshot> {
  const subs = await stripe().subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 1,
    expand: ["data.items.data.price"],
  });
  const sub = subs.data[0];
  if (!sub) {
    return {
      stripeCustomerId,
      subscriptionStatus: null,
      subscriptionPriceId: null,
      subscriptionInterval: null,
      currentPeriodEnd: null,
    };
  }
  const item = sub.items.data[0];
  const price = item?.price;
  const interval = price?.recurring?.interval;
  const periodEndUnix =
    // Stripe v22 surfaces current_period_end on the subscription item, not the
    // top-level subscription. Fall back to either for robustness.
    (item as unknown as { current_period_end?: number })?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    null;
  return {
    stripeCustomerId,
    subscriptionStatus: sub.status,
    subscriptionPriceId: typeof price === "string" ? price : (price?.id ?? null),
    subscriptionInterval: interval === "month" || interval === "year" ? interval : null,
    currentPeriodEnd: periodEndUnix,
  };
}
