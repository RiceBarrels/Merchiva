// Server-side Web Push fan-out.
//
// The client (who already has push_subscription rows in its SpacetimeDB cache)
// posts the target's subscriptions here along with the notification payload.
// We sign and dispatch via the shared sendWebPush helper using the project's
// VAPID keys.
//
// Expired endpoints (404/410) are returned so the caller can remove them from
// the push_subscription table.

import { NextRequest } from "next/server";
import { handleOptions, jsonWithCors } from "@/lib/api-cors";
import { sendWebPush, ensureVapid, type PushSubscriptionInput } from "@/lib/push/send";

export const OPTIONS = handleOptions;
export const runtime = "nodejs";

interface Payload {
  subscriptions: PushSubscriptionInput[];
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
      { status: 503 },
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

  const result = await sendWebPush(payload.subscriptions, {
    title: payload.title,
    body: payload.body,
    link: payload.link ?? null,
    type: payload.type,
    id: payload.id,
  });

  return jsonWithCors(req, result);
}
