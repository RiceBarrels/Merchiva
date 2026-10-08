import { handleOptions } from "@/lib/api-cors";
import { driveServerDeps } from "@/lib/drive/server/deps";
import { createUploadRouteHandler } from "@/lib/drive/server/handlers/upload";

// Presigned Drive uploads (token requests from the uploader, completion
// callbacks from Vercel Blob). Logic: lib/drive/server/handlers/upload.ts.

export const runtime = "nodejs";
export const maxDuration = 30;
export const OPTIONS = handleOptions;

export async function POST(req: Request): Promise<Response> {
  return createUploadRouteHandler(driveServerDeps())(req);
}
