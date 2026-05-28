// Server-side Web Push fan-out.
//
// The client (who already has push_subscription rows in its SpacetimeDB cache)
// posts the target's subscriptions here along with the notification payload.
// We sign and dispatch via web-push using the project's VAPID keys.
//
// Expired endpoints (404/410) are returned so the caller can remove them from
// the push_subscription table.

import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { handleOptions, jsonWithCors } from "@/lib/api-cors";

export const OPTIONS = handleOptions;
export const runtime = "nodejs";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:hello@merchiva.com";

let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidConfigured = true;
  return true;
}

interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface Payload {
  subscriptions: SubscriptionInput[];
  title: string;
  body: string;
  link?: string | null;
  type?: string;
  id?: string;
}

export async function POST(req: NextRequest) {
  if (!ensureVapid()) {
    return jsonWithCors(
      req,
      { error: "Push not configured: missing VAPID keys" },
      { status: 503 }
    );
  }

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return jsonWithCors(req, { error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload?.title || !payload?.body) {
    return jsonWithCors(req, { error: "Missing title/body" }, { status: 400 });
  }
  if (!Array.isArray(payload.subscriptions) || payload.subscriptions.length === 0) {
    return jsonWithCors(req, { sent: 0, failed: 0, expired: [] });
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
    payload.subscriptions.map(async (sub) => {
      if (!sub.endpoint || !sub.p256dh || !sub.auth) {
        failed++;
        return;
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          message,
          { TTL: 60 * 60 * 24 }
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
    })
  );

  return jsonWithCors(req, { sent, failed, expired });
}
