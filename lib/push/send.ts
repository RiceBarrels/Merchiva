// Server-side Web Push fan-out helper.
//
// Signs and dispatches push messages via the `web-push` library using the
// project's VAPID keys. Shared by the client-driven /api/push/send route and
// by server-side background jobs (e.g. the Mr. Merchiva enqueue worker, which
// must reach users who have already left the site).

import "server-only";

import webpush from "web-push";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:hello@merchiva.com";

let vapidConfigured = false;

/** True when VAPID keys are present and configured on the web-push client. */
export function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidConfigured = true;
  return true;
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  link?: string | null;
  type?: string;
  id?: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Endpoints the push service reported as gone (404/410) — caller should prune them. */
  expired: string[];
  /** True when VAPID keys are missing, so nothing was attempted. */
  unconfigured?: boolean;
}

/**
 * Sign and dispatch `payload` to every subscription. Never throws — returns a
 * tally so callers can treat push as best-effort.
 */
export async function sendWebPush(
  subscriptions: PushSubscriptionInput[],
  payload: PushPayload,
): Promise<PushResult> {
  if (!ensureVapid()) return { sent: 0, failed: 0, expired: [], unconfigured: true };
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return { sent: 0, failed: 0, expired: [] };
  }

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    link: payload.link ?? null,
    type: payload.type ?? "general",
    id: payload.id ?? undefined,
    tag: payload.id ?? payload.type ?? "merchiva",
  });

  const expired: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      if (!sub.endpoint || !sub.p256dh || !sub.auth) {
        failed++;
        return;
      }
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message,
          { TTL: 60 * 60 * 24 },
        );
        sent++;
      } catch (err) {
        const e = err as { statusCode?: number };
        if (e.statusCode === 404 || e.statusCode === 410) {
          expired.push(sub.endpoint);
        } else {
          failed++;
        }
      }
    }),
  );

  return { sent, failed, expired };
}
