// Contracts between the Drive route handlers and the outside world. The
// handlers are pure factories over DriveServerDeps, so tests inject every
// effect (clock, env, JWT check, SpacetimeDB, Blob) and never import the
// server-guarded modules (config, blob, stdb, deps). lib/drive/server/deps.ts
// builds the real one.

import type { IssuedSignedToken } from "@vercel/blob";
import type { handleUploadPresigned } from "@vercel/blob/client";
import type { SqlRow } from "@/lib/drive/server/sql-rows";
import type { DriveStdbArgs, DriveStdbCallKey } from "@/lib/drive/server/stdb-calls";

/** Parsed Drive storage env (handlers/config.ts). null anywhere means "not configured". */
export interface DriveStorageConfig {
  /** BLOB_READ_WRITE_TOKEN wins; otherwise BLOB_STORE_ID with the Vercel OIDC token. */
  blobAuth: { token: string } | { storeId: string };
  /** BLOB_WEBHOOK_PUBLIC_KEY: verifies Vercel's upload-completed callbacks. */
  webhookPublicKey: string;
  /** SPACETIMEDB_SERVICE_TOKEN. */
  serviceToken: string;
  /** NEXT_PUBLIC_SPACETIMEDB_MODULE, which must equal DRIVE_BLOB_DATABASE (one store per database). */
  database: string;
  /** VERCEL_BLOB_CALLBACK_URL set, or a Vercel production / preview deployment: Vercel can reach the callback. */
  callbacksEnabled: boolean;
  /** DRIVE_UPLOADS_PAUSED === "1": the kill switch that refuses new upload tokens. */
  uploadsPaused: boolean;
  /** VERCEL_ENV === "production": the reconcile cron may queue orphans for deletion. */
  reconcileLive: boolean;
  /** DRIVE_PLATFORM_ALERT_BYTES (a positive integer) or null. */
  platformAlertBytes: number | null;
  /** CRON_SECRET or null (the crons then refuse to run). */
  cronSecret: string | null;
}

export interface DriveHeadResult {
  size: number;
  contentType: string;
  etag: string;
  /** ms since the epoch. */
  uploadedAt: number;
}

export interface DriveListPage {
  blobs: Array<{ pathname: string; size: number; uploadedAt: number }>;
  /** Only in `folded` mode. */
  folders: string[];
  cursor?: string;
  hasMore: boolean;
}

export interface DriveBlobOps {
  /** A `put` delegation scoped to exactly `pathname`. */
  issuePutToken(
    pathname: string,
    opts: { maximumSizeInBytes: number; allowedContentTypes: string[]; validUntil: number },
  ): Promise<IssuedSignedToken>;
  /** A presigned GET URL for a private blob; `download` appends `download=1` (served as an attachment). */
  presignGet(pathname: string, opts: { validUntil: number; download: boolean }): Promise<string>;
  /** null when the blob does not exist. */
  head(pathname: string): Promise<DriveHeadResult | null>;
  /** Missing keys are not an error. */
  del(pathnames: string[]): Promise<void>;
  list(opts: { prefix: string; cursor?: string; limit?: number; mode?: "expanded" | "folded" }): Promise<DriveListPage>;
}

export type DriveLogLevel = "info" | "warn" | "error";

export interface DriveServerDeps {
  /** ms since the epoch. */
  now(): number;
  config(): DriveStorageConfig | null;
  /** The WorkOS user id of a verified `Authorization: Bearer <jwt>` header, else null. */
  verifyUser(authHeader: string | null): Promise<string | null>;
  /** A reducer over HTTP. "user" calls need `userToken` (the caller's); "service" calls ignore it. */
  call<K extends DriveStdbCallKey>(key: K, args: DriveStdbArgs[K], userToken?: string): Promise<void>;
  /** One SELECT over HTTP `/sql` as `userToken` (null = the service identity). Rows keyed by column name. */
  sql(query: string, userToken: string | null): Promise<SqlRow[]>;
  blob: DriveBlobOps;
  handleUploadPresigned: typeof handleUploadPresigned;
  /** A JSON response with the API CORS headers plus `init.headers`. */
  json(req: Request, body: unknown, init?: { status?: number; headers?: Record<string, string> }): Response;
  /** Never pass tokens, signed URLs or delegation material in `fields`. */
  log(level: DriveLogLevel, event: string, fields: Record<string, string | number | boolean>): void;
}

export type DriveRouteHandler = (req: Request) => Promise<Response>;
