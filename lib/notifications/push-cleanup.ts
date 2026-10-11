// Push hygiene for browsers that change hands. A push_subscription row says "push
// this identity's notifications to this browser"; it must not outlive the person.
//
//   - Sign-out and account switch (lib/auth/context.tsx): forgetBrowserPushEndpoint
//     drops the signed-in identity's row for this browser's endpoint. The browser keeps
//     its subscription: the next account to enable push re-registers the same endpoint
//     for itself (savePushSubscription hands an endpoint to the last account).
//   - Entering store mode (a shared tablet): releaseBrowserPush also unsubscribes the
//     browser, so nobody's alerts reach the shop floor.
//
// Both are best-effort and never reject: they run on the way out of a session.

import { deletePushEndpoint } from "@/lib/spacetimedb/actions/notifications";

async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.pushManager) return null;
  return registration.pushManager.getSubscription();
}

function withTimeout(work: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    work
      .catch((err: unknown) => console.warn("[notify] push cleanup failed:", err))
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}

/**
 * Sign-out / account switch: deletes the current identity's push row for this browser.
 * Waits at most `timeoutMs` (the caller is leaving the page).
 */
export function forgetBrowserPushEndpoint(timeoutMs = 1500): Promise<void> {
  const work = (async () => {
    const subscription = await currentPushSubscription();
    if (subscription) await deletePushEndpoint(subscription.endpoint);
  })();
  return withTimeout(work, timeoutMs);
}

/**
 * Entering store mode (the device agent calls it when a device becomes a store tablet,
 * and on every /store mount, which is cheap when there is nothing to release):
 * unsubscribes this browser from push and deletes the signed-in identity's row for it.
 */
export function releaseBrowserPush(timeoutMs = 3000): Promise<void> {
  const work = (async () => {
    const subscription = await currentPushSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe().catch(() => false);
    await deletePushEndpoint(endpoint);
  })();
  return withTimeout(work, timeoutMs);
}
