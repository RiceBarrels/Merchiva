import { handleOptions } from "@/lib/api-cors";
import { driveServerDeps } from "@/lib/drive/server/deps";
import { createDriveReconcileHandler } from "@/lib/drive/server/handlers/reconcile";

// Vercel Cron, daily at 04:30 UTC (vercel.json): compares the Drive Blob store
// with the database, reports blobs no row owns, refreshes each org's usage.
// Logic: lib/drive/server/handlers/reconcile.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const OPTIONS = handleOptions;

export async function GET(req: Request): Promise<Response> {
  return createDriveReconcileHandler(driveServerDeps())(req);
}
