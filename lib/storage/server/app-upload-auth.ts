// The checks behind every UploadThing endpoint (app/api/uploadthing/core.ts).
// Pure: tests inject the WorkOS check and the reducer calls.
//
// middleware (before UploadThing signs any upload URL):
//   1. input `{ organizationId, source }` (appUploadInputParser), else BAD_REQUEST "Invalid input";
//   2. a verified `Authorization: Bearer <WorkOS token>`, else FORBIDDEN `[drive.unauthenticated]`;
//   3. 1..APP_UPLOAD_MAX_FILES files, else BAD_REQUEST `[drive.invalid]`;
//   4. the service token is set, else INTERNAL_SERVER_ERROR `[drive.not_configured]`: without it no upload
//      could be recorded, so accepting one would store bytes the quota never sees;
//   5. begin_app_upload with the caller's own token: an active member of that store with room for the files'
//      total size, which the module then holds until the files are recorded. Its refusal comes back as
//      `[drive.quota_exceeded]`, `[drive.forbidden]`, … in the message, which lib/storage/app-upload.ts turns
//      into copy.
// onUploadComplete (UploadThing's callback, after the bytes landed): service_record_app_file with the service
// token and the size UploadThing measured, retried on an upstream failure. A failure that outlasts the retries is
// logged (`storage.app_upload.record_failed`) and never fails the upload. Nothing recovers it automatically: the
// nightly recompute only re-sums recorded rows, so re-run scripts/backfill-app-files.ts (it re-lists UploadThing
// and records every referenced file not yet counted).
//
// UploadThingError is the only error a middleware may throw: anything else reaches the client as a bare
// "Failed to run middleware".

import { UploadThingError } from "uploadthing/server";
import { bearerToken, reducerFailure } from "@/lib/drive/server/http";
import type { DriveServerDeps } from "@/lib/drive/server/handlers/types";
import { appFileKeyHash } from "@/lib/storage/uploadthing-key";
import { APP_UPLOAD_MAX_FILES, isAppFileSource, type AppFileSource } from "@/lib/storage/sources";

// A type alias, not an interface: UploadThing wants a JSON object type, and only aliases get the implicit index signature.
export type AppUploadInput = { organizationId: string; source: AppFileSource };
/** What the middleware hands onUploadComplete. */
export type AppUploadMetadata = AppUploadInput;

export interface AppUploadServerDeps {
  /** The WorkOS user id of a verified `Authorization: Bearer <jwt>` header, else null. */
  verifyUser(authHeader: string | null): Promise<string | null>;
  /** A reducer over HTTP; "user" calls run with `userToken`, "service" calls with the service token. */
  call: DriveServerDeps["call"];
  /** Never pass tokens, keys or URLs in `fields`. */
  log: DriveServerDeps["log"];
  /** Whether the service token that records uploads is set. */
  recordingConfigured(): boolean;
  /** Waits between recording attempts; tests pass a no-op. */
  sleep?(ms: number): Promise<void>;
}

/** Waits before the 2nd and 3rd recording attempts (an upstream failure only). */
export const RECORD_RETRY_DELAYS_MS: readonly number[] = [500, 2000];

const ORG_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** `{ organizationId, source }` with nothing else checked here: membership and quota are the module's call. */
export function parseAppUploadInput(raw: unknown): AppUploadInput | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const { organizationId, source } = raw as Record<string, unknown>;
  if (typeof organizationId !== "string" || !ORG_ID_RE.test(organizationId.trim())) return null;
  if (!isAppFileSource(source)) return null;
  return { organizationId: organizationId.trim().toLowerCase(), source };
}

/** UploadThing's `.input()` parser (its zod-like shape; the repo has no schema library). */
export const appUploadInputParser = {
  _input: undefined as unknown as AppUploadInput,
  _output: undefined as unknown as AppUploadInput,
  async parseAsync(raw: unknown): Promise<AppUploadInput> {
    const input = parseAppUploadInput(raw);
    if (!input) throw new UploadThingError({ code: "BAD_REQUEST", message: "[drive.invalid] Invalid upload input" });
    return input;
  },
};

const UNAUTHENTICATED = "[drive.unauthenticated] Sign in to upload";

/** The token of a verified caller, else FORBIDDEN `[drive.unauthenticated]` (UploadThing has no 401 code). */
export async function requireUploadCaller(deps: Pick<AppUploadServerDeps, "verifyUser">, authHeader: string | null): Promise<string> {
  const token = bearerToken(authHeader);
  if (!token) throw new UploadThingError({ code: "FORBIDDEN", message: UNAUTHENTICATED });
  const userId = await deps.verifyUser(`Bearer ${token}`);
  if (!userId) throw new UploadThingError({ code: "FORBIDDEN", message: UNAUTHENTICATED });
  return token;
}

/** A begin_app_upload failure as the UploadThingError the client reads (`[drive.<code>]` leads the message). */
export function appUploadRefusal(err: unknown): UploadThingError {
  const failure = reducerFailure(err);
  const message = failure.message.startsWith("[drive.") ? failure.message : `[drive.${failure.code}] ${failure.message}`;
  switch (failure.code) {
    case "quota_exceeded":
    case "forbidden":
      return new UploadThingError({ code: "FORBIDDEN", message });
    case "unauthenticated":
      return new UploadThingError({ code: "FORBIDDEN", message: UNAUTHENTICATED });
    case "invalid":
    case "not_found":
      return new UploadThingError({ code: "BAD_REQUEST", message });
    default:
      // not_published (an older module), upstream: nothing the uploader can fix.
      return new UploadThingError({ code: "INTERNAL_SERVER_ERROR", message: `[drive.${failure.code}] Uploads are unavailable` });
  }
}

/** The middleware: verified caller, file count, then membership + quota in the module. Returns the metadata. */
export async function authorizeAppUpload(
  deps: AppUploadServerDeps,
  opts: { authHeader: string | null; input: AppUploadInput; files: ReadonlyArray<{ size: number }> },
): Promise<AppUploadMetadata> {
  const token = await requireUploadCaller(deps, opts.authHeader);
  const { organizationId, source } = opts.input;
  const fileCount = opts.files.length;
  if (fileCount < 1 || fileCount > APP_UPLOAD_MAX_FILES) {
    throw new UploadThingError({ code: "BAD_REQUEST", message: "[drive.invalid] Invalid number of files" });
  }
  if (!deps.recordingConfigured()) {
    deps.log("error", "storage.app_upload.not_configured", { source });
    throw new UploadThingError({ code: "INTERNAL_SERVER_ERROR", message: "[drive.not_configured] Uploads are unavailable" });
  }
  let totalBytes = 0;
  for (const file of opts.files) {
    if (!Number.isSafeInteger(file.size) || file.size < 0) {
      throw new UploadThingError({ code: "BAD_REQUEST", message: "[drive.invalid] Invalid file size" });
    }
    totalBytes += file.size;
  }
  try {
    await deps.call("beginAppUpload", { organizationId, source, totalBytes, fileCount }, token);
  } catch (err) {
    const refusal = appUploadRefusal(err);
    if (refusal.code === "INTERNAL_SERVER_ERROR") deps.log("error", "storage.app_upload.begin_failed", { source });
    throw refusal;
  }
  return { organizationId, source };
}

/** onUploadComplete: records the stored file. Never throws. */
export async function recordAppUpload(
  deps: Pick<AppUploadServerDeps, "call" | "log" | "sleep">,
  metadata: AppUploadMetadata,
  file: { key: string; size: number; type: string },
): Promise<void> {
  const keyHash = appFileKeyHash(file.key);
  if (!keyHash || !Number.isSafeInteger(file.size) || file.size < 0) {
    deps.log("warn", "storage.app_upload.record_skipped", { source: metadata.source });
    return;
  }
  const args = {
    organizationId: metadata.organizationId, keyHash, source: metadata.source, sizeBytes: file.size, mimeType: file.type ?? "",
  };
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      await deps.call("recordAppFile", args);
      return;
    } catch (err) {
      const code = reducerFailure(err).code;
      // Only a transient upstream failure is worth another try; a refusal (not_found, invalid, …) stays one.
      if (code === "upstream" && attempt < RECORD_RETRY_DELAYS_MS.length) {
        await sleep(RECORD_RETRY_DELAYS_MS[attempt]);
        continue;
      }
      deps.log("error", "storage.app_upload.record_failed", { source: metadata.source, code, attempts: attempt + 1 });
      return;
    }
  }
}

/**
 * The platform blog's cover image (app/admins/blogs, endpoint `platformImage`): no store, so nothing is recorded or
 * counted. Only a verified platform admin (lib/auth/admin.ts) may upload; anyone else gets FORBIDDEN.
 */
export async function authorizePlatformUpload(
  verifyAdmin: (authHeader: string | null) => Promise<{ isAdmin: boolean } | null>,
  authHeader: string | null,
): Promise<{ platform: true }> {
  const token = bearerToken(authHeader);
  const result = token ? await verifyAdmin(`Bearer ${token}`) : null;
  if (!result) throw new UploadThingError({ code: "FORBIDDEN", message: UNAUTHENTICATED });
  if (!result.isAdmin) throw new UploadThingError({ code: "FORBIDDEN", message: "[drive.forbidden] Platform admins only" });
  return { platform: true };
}
