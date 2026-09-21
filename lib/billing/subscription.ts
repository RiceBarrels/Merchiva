import { timestampToMsOrNull } from "@/lib/spacetimedb/timestamp";

// Subscription access logic — single source of truth for "can this org use
// Merchiva right now?". Used by the auth gate in `app/manager/layout.tsx` and the
// `/manager/subscribe` paywall page.
//
// An org gets access when EITHER:
//   1. It has an active Stripe subscription (status in ACTIVE_STATUSES), OR
//   2. It is still inside its free-trial window (TRIAL_DAYS from `createdAt`).
//
// Stripe is canonical; the `organization` row fields are a cache refreshed by
// `/api/billing/sync`. `trialing` is intentionally an active status so Stripe
// trials and the local grace-trial both unlock the app.

export const TRIAL_DAYS = 30;

// Statuses that count as "paying / active" — these unlock the app on their own,
// independent of the trial window. Mirrors the set used in the billing page.
export const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

const DAY_MS = 24 * 60 * 60 * 1000;

// A SpacetimeDB Timestamp can surface as `{ microsSinceUnixEpoch: bigint }`
// (raw row) or as a wrapper exposing `.toDate()`. Accept both, plus a Date.
type TimestampLike =
  | { microsSinceUnixEpoch?: bigint }
  | { toDate?: () => Date }
  | Date
  | null
  | undefined;

export interface SubscriptionRow {
  subscriptionStatus?: string | null;
  createdAt?: TimestampLike;
}

export interface SubscriptionAccess {
  /** True when the org may use the app (subscribed OR in trial). */
  allowed: boolean;
  /** True when the org has an active/trialing/past_due Stripe subscription. */
  isSubscribed: boolean;
  /** True when access is granted by the trial window (and not by Stripe). */
  inTrial: boolean;
  /** Whole days left in the trial (0 once expired or when not in trial). */
  trialDaysLeft: number;
  /** When the trial ends, or null if creation time is unknown. */
  trialEndsAt: Date | null;
}

/**
 * Evaluate whether an org currently has access. `nowMs` is injected so callers
 * control the clock (e.g. `Date.now()`).
 */
export function evaluateSubscription(
  org: SubscriptionRow | null | undefined,
  nowMs: number,
): SubscriptionAccess {
  const status = org?.subscriptionStatus ?? null;
  const isSubscribed = !!(status && ACTIVE_STATUSES.has(status));

  const createdMs = timestampToMsOrNull(org?.createdAt);
  const trialEndMs = createdMs != null ? createdMs + TRIAL_DAYS * DAY_MS : null;
  const trialEndsAt = trialEndMs != null ? new Date(trialEndMs) : null;
  const inTrialWindow = trialEndMs != null && nowMs < trialEndMs;
  const trialDaysLeft =
    inTrialWindow && trialEndMs != null
      ? Math.max(0, Math.ceil((trialEndMs - nowMs) / DAY_MS))
      : 0;

  // Trial only matters as an access reason when not already subscribed.
  const inTrial = !isSubscribed && inTrialWindow;

  return {
    allowed: isSubscribed || inTrialWindow,
    isSubscribed,
    inTrial,
    trialDaysLeft,
    trialEndsAt,
  };
}
