import { handleOptions } from "@/lib/api-cors";
import { driveServerDeps } from "@/lib/drive/server/deps";
import { createUrlsRouteHandler } from "@/lib/drive/server/handlers/urls";

// Short-lived signed URLs for the Drive files the caller may read.
// Logic: lib/drive/server/handlers/urls.ts.

export const runtime = "nodejs";
export const maxDuration = 30;
export const OPTIONS = handleOptions;

export async function POST(req: Request): Promise<Response> {
  return createUrlsRouteHandler(driveServerDeps())(req);
}
