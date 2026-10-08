// Drive storage configuration from the environment, and the signed-URL
// lifetimes. Pure (the env is a parameter); lib/drive/server/config.ts reads
// process.env and lib/drive/server/blob.ts re-exports the lifetimes.
//
// Drive storage is "configured" only when every piece is present AND the Blob
// store is paired with this SpacetimeDB database: DRIVE_BLOB_DATABASE must equal
// NEXT_PUBLIC_SPACETIMEDB_MODULE. Keys are meaningful only against the database
// whose rows reference them, so a laptop pointed at a local database never
// uploads to, lists or deletes from the production store. Unconfigured, every
// route answers 503 `not_configured` and the rest of Drive keeps working.

import { DRIVE_UPLOAD_TTL_MS } from "@/lib/drive/rules";
import type { DriveStorageConfig } from "./types";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** A single-request PUT must start within this. */
export const DRIVE_PUT_TTL_SINGLE_MS = 30 * MINUTE_MS;
/** A multipart PUT may run this long: the pending row's window that authorize_drive_upload just extended. */
export const DRIVE_PUT_TTL_MULTIPART_MS = DRIVE_UPLOAD_TTL_MS;
/** Signed GET lifetimes. `stream` covers a long video; `thumb` is cached by the grid. */
export const DRIVE_GET_TTL_MS: Readonly<Record<"view" | "stream" | "download" | "thumb", number>> = {
  view: 15 * MINUTE_MS,
  stream: 2 * HOUR_MS,
  download: 10 * MINUTE_MS,
  thumb: HOUR_MS,
};
/** The cached store-wide get/head delegation every GET URL is signed from. */
export const DRIVE_READ_DELEGATION_TTL_MS = 12 * HOUR_MS;
/** Re-issue the read delegation once less than this remains (more than the longest GET lifetime). */
export const DRIVE_READ_DELEGATION_REFRESH_MS = 3 * HOUR_MS;

function envValue(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The Drive storage config, or null unless (BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID), BLOB_WEBHOOK_PUBLIC_KEY,
 * SPACETIMEDB_SERVICE_TOKEN, NEXT_PUBLIC_SPACETIMEDB_URI and NEXT_PUBLIC_SPACETIMEDB_MODULE are set and
 * DRIVE_BLOB_DATABASE === NEXT_PUBLIC_SPACETIMEDB_MODULE.
 */
export function parseDriveStorageConfig(env: Readonly<Record<string, string | undefined>>): DriveStorageConfig | null {
  const readWriteToken = envValue(env, "BLOB_READ_WRITE_TOKEN");
  const storeId = envValue(env, "BLOB_STORE_ID");
  const webhookPublicKey = envValue(env, "BLOB_WEBHOOK_PUBLIC_KEY");
  const serviceToken = envValue(env, "SPACETIMEDB_SERVICE_TOKEN");
  const uri = envValue(env, "NEXT_PUBLIC_SPACETIMEDB_URI");
  const database = envValue(env, "NEXT_PUBLIC_SPACETIMEDB_MODULE");
  const pairedDatabase = envValue(env, "DRIVE_BLOB_DATABASE");
  if (readWriteToken === "" && storeId === "") return null;
  if (webhookPublicKey === "" || serviceToken === "" || uri === "" || database === "") return null;
  if (pairedDatabase !== database) return null;

  const vercelEnv = envValue(env, "VERCEL_ENV");
  const alert = Number(envValue(env, "DRIVE_PLATFORM_ALERT_BYTES"));
  const cronSecret = envValue(env, "CRON_SECRET");
  return {
    blobAuth: readWriteToken !== "" ? { token: readWriteToken } : { storeId },
    webhookPublicKey,
    serviceToken,
    database,
    callbacksEnabled: envValue(env, "VERCEL_BLOB_CALLBACK_URL") !== ""
      || (envValue(env, "VERCEL") === "1" && (vercelEnv === "production" || vercelEnv === "preview")),
    uploadsPaused: envValue(env, "DRIVE_UPLOADS_PAUSED") === "1",
    reconcileLive: vercelEnv === "production",
    platformAlertBytes: Number.isSafeInteger(alert) && alert > 0 ? alert : null,
    cronSecret: cronSecret !== "" ? cronSecret : null,
  };
}
