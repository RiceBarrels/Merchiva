import { handleOptions } from "@/lib/api-cors";
import { driveServerDeps } from "@/lib/drive/server/deps";
import { createStatusRouteHandler } from "@/lib/drive/server/handlers/status";

// Whether Drive uploads are available. Logic: lib/drive/server/handlers/status.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = handleOptions;

export async function GET(req: Request): Promise<Response> {
  return createStatusRouteHandler(driveServerDeps())(req);
}
