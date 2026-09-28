import { handleOptions } from "@/lib/api-cors";
import { driveServerDeps } from "@/lib/drive/server/deps";
import { createCommitRouteHandler } from "@/lib/drive/server/handlers/commit";

// Marks a Drive upload ready once its bytes are in the store.
// Logic: lib/drive/server/handlers/commit.ts.

export const runtime = "nodejs";
export const maxDuration = 30;
export const OPTIONS = handleOptions;

export async function POST(req: Request): Promise<Response> {
  return createCommitRouteHandler(driveServerDeps())(req);
}
