import "server-only";

// The real DriveServerDeps behind the /api/drive/* routes: env config, the
// WorkOS JWT check, SpacetimeDB over HTTP, the Blob store and the Blob SDK's
// upload handler. Built once per process.
//
// Without Drive storage env (handlers/config.ts) the Blob and SpacetimeDB parts
// refuse with 503 `not_configured`; the handlers check config() first anyway.

import { handleUploadPresigned } from "@vercel/blob/client";
import { jsonWithCors } from "@/lib/api-cors";
import { verifiedUserId } from "@/lib/auth/verify-token";
import { createDriveBlobOps } from "./blob";
import { readDriveStorageConfig } from "./config";
import { driveHttpError } from "./http";
import { createDriveStdb } from "./stdb";
import type { DriveBlobOps, DriveServerDeps } from "./handlers/types";

function notConfigured(): never {
  throw driveHttpError("not_configured", "File storage is not configured");
}

const UNCONFIGURED_BLOB: DriveBlobOps = {
  issuePutToken: async () => notConfigured(),
  presignGet: async () => notConfigured(),
  head: async () => notConfigured(),
  del: async () => notConfigured(),
  list: async () => notConfigured(),
};

let memo: DriveServerDeps | null = null;

export function driveServerDeps(): DriveServerDeps {
  if (memo) return memo;
  const config = readDriveStorageConfig();
  const stdb: Pick<DriveServerDeps, "call" | "sql"> = config
    ? createDriveStdb(config)
    : { call: async () => notConfigured(), sql: async () => notConfigured() };
  memo = {
    now: () => Date.now(),
    config: () => config,
    verifyUser: verifiedUserId,
    call: stdb.call,
    sql: stdb.sql,
    blob: config ? createDriveBlobOps(config) : UNCONFIGURED_BLOB,
    handleUploadPresigned,
    json(req, body, init) {
      const res = jsonWithCors(req, body, { status: init?.status });
      // lib/api-cors.ts takes no headers; the returned NextResponse's are mutable.
      for (const [name, value] of Object.entries(init?.headers ?? {})) res.headers.set(name, value);
      return res;
    },
    log(level, event, fields) {
      console[level](`[drive] ${event}`, fields);
    },
  };
  return memo;
}
