import { handleOptions } from "@/lib/api-cors";
import { driveServerDeps } from "@/lib/drive/server/deps";
import { createDriveGcHandler } from "@/lib/drive/server/handlers/gc";

// Vercel Cron, every 15 minutes (vercel.json): deletes the Drive blobs the
// database queued and settles uploads whose commit never arrived.
// Logic: lib/drive/server/handlers/gc.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const OPTIONS = handleOptions;

export async function GET(req: Request): Promise<Response> {
  return createDriveGcHandler(driveServerDeps())(req);
}
