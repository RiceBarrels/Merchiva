import { notifyCronDeps } from "@/lib/notifications/server/deps";
import { createNotifyCronHandler } from "@/lib/notifications/server/handler";

// Vercel Cron, every minute (vercel.json): sends the Web Push and the email
// digests the module leased to this run. Logic: lib/notifications/server/handler.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return createNotifyCronHandler(notifyCronDeps())(req);
}
