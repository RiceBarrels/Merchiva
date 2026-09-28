// GET /api/drive/status — whether uploads can work right now, for a signed-in
// caller. The Upload button uses it to explain "storage unavailable" up front
// (the Blob SDK reports every refused token request as the same generic
// "Failed to retrieve the presigned URL").

import { DRIVE_MAX_FILE_BYTES, DRIVE_MULTIPART_THRESHOLD_BYTES, DRIVE_THUMB_MAX_BYTES } from "@/lib/drive/rules";
import { errorResponse, requireCaller } from "@/lib/drive/server/http";
import type { DriveRouteHandler, DriveServerDeps } from "./types";

export interface DriveStatusResponse {
  configured: boolean;
  paused: boolean;
  maxFileBytes: number;
  multipartThresholdBytes: number;
  thumbMaxBytes: number;
}

export function createStatusRouteHandler(deps: DriveServerDeps): DriveRouteHandler {
  return async (req) => {
    try {
      await requireCaller(deps, req);
      const config = deps.config();
      const status: DriveStatusResponse = {
        configured: config !== null,
        paused: config?.uploadsPaused ?? false,
        maxFileBytes: DRIVE_MAX_FILE_BYTES,
        multipartThresholdBytes: DRIVE_MULTIPART_THRESHOLD_BYTES,
        thumbMaxBytes: DRIVE_THUMB_MAX_BYTES,
      };
      return deps.json(req, status, { headers: { "Cache-Control": "private, no-store" } });
    } catch (err) {
      return errorResponse(deps, req, err);
    }
  };
}
