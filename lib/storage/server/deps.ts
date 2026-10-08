import "server-only";

// The real AppUploadServerDeps behind app/api/uploadthing: the WorkOS JWT check
// and SpacetimeDB reducers over HTTP (lib/drive/server/stdb-calls.ts names them).
// Unlike the Drive routes it needs no Blob store, only the service token that
// records each upload: without it the middleware refuses every upload
// (`[drive.not_configured]`) rather than store bytes the quota never counts.

import { verifiedUserId } from "@/lib/auth/verify-token";
import { driveHttpError } from "@/lib/drive/server/http";
import { DRIVE_STDB_CALLS, driveCallArgs, type DriveStdbArgs, type DriveStdbCallKey } from "@/lib/drive/server/stdb-calls";
import { callReducer } from "@/lib/spacetimedb/server-rpc";
import type { AppUploadServerDeps } from "./app-upload-auth";

let memo: AppUploadServerDeps | null = null;

export function appUploadServerDeps(): AppUploadServerDeps {
  if (memo) return memo;
  memo = {
    verifyUser: verifiedUserId,
    async call<K extends DriveStdbCallKey>(key: K, args: DriveStdbArgs[K], userToken?: string): Promise<void> {
      const spec = DRIVE_STDB_CALLS[key];
      const token = spec.as === "user" ? userToken : process.env.SPACETIMEDB_SERVICE_TOKEN?.trim();
      if (!token) {
        throw spec.as === "user"
          ? driveHttpError("unauthenticated", "Sign in again")
          : driveHttpError("not_configured", "SPACETIMEDB_SERVICE_TOKEN is not set");
      }
      await callReducer({ token, name: spec.name, args: driveCallArgs(key, args) });
    },
    recordingConfigured: () => Boolean(process.env.SPACETIMEDB_SERVICE_TOKEN?.trim()),
    log(level, event, fields) {
      console[level](`[uploadthing] ${event}`, fields);
    },
  };
  return memo;
}
