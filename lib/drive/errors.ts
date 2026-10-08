// Drive reducers fail with `SenderError("[drive.<code>] Human text")`; the SDK
// rejects the reducer promise with that message verbatim, and the Drive API
// routes put the same prefix in their error bodies. The client adds its own codes
// (no connection, unpublished module, storage not configured, network, aborted
// uploads) as DriveClientError.
//
// driveErrorKey is the one place a Drive screen turns any failure into copy: it
// also reads the Docs `[doc.*]` and Sheets `[sheet.*]` prefixes, since Drive
// shows documents and spreadsheets next to files.

import { DOC_ERROR_I18N_KEYS, docErrorCode } from "@/lib/docs/errors";

/** `[drive.<code>]` codes of the module (= DriveErrorCode in spacetimedb/src/drive/logic.ts; parity-tested). */
export const DRIVE_SERVER_ERROR_CODES = [
  "not_found", "forbidden", "invalid", "invalid_name", "cycle", "too_deep", "trashed",
  "too_large", "quota_exceeded", "too_many_pending", "too_many_items", "batch_too_large",
  "expired", "conflict", "too_many_attempts", "blocked_type", "space_mismatch",
  "subtree_forbidden", "operator", "device_scope", "orphan_brake",
] as const;
export type DriveServerErrorCode = (typeof DRIVE_SERVER_ERROR_CODES)[number];

export type DriveClientErrorCode =
  | DriveServerErrorCode
  | "not_published" | "not_connected" | "not_uploaded" | "not_configured" | "network"
  | "upload_start_failed" | "download_failed" | "unauthenticated" | "aborted" | "unknown";

export class DriveClientError extends Error {
  readonly code: DriveClientErrorCode;
  constructor(code: DriveClientErrorCode, message?: string) {
    super(message ?? `[drive.${code}]`);
    this.name = "DriveClientError";
    this.code = code;
  }
}

/** i18n key of each code: `drive.errors.*` (scripts/i18n/drive/data-layer.json) apart from the reused toast and upload keys. */
export const DRIVE_ERROR_I18N_KEYS: Readonly<Record<DriveClientErrorCode, string>> = {
  not_found: "drive.errors.notFound",
  forbidden: "drive.errors.forbidden",
  operator: "drive.errors.operator",
  subtree_forbidden: "drive.errors.subtreeForbidden",
  device_scope: "drive.errors.deviceScope",
  invalid: "drive.errors.invalid",
  invalid_name: "drive.errors.invalidName",
  cycle: "drive.errors.cycle",
  too_deep: "drive.errors.tooDeep",
  space_mismatch: "drive.errors.spaceMismatch",
  batch_too_large: "drive.errors.batchTooLarge",
  trashed: "drive.errors.trashed",
  expired: "drive.errors.expired",
  conflict: "drive.errors.conflict",
  not_uploaded: "drive.errors.notUploaded",
  too_large: "drive.errors.tooLarge",
  blocked_type: "drive.errors.blockedType",
  too_many_pending: "drive.errors.tooManyPending",
  too_many_attempts: "drive.errors.tooManyAttempts",
  too_many_items: "drive.errors.tooManyItems",
  quota_exceeded: "drive.errors.quotaExceeded",
  not_configured: "drive.errors.storageUnavailable",
  not_published: "drive.errors.notPublished",
  unauthenticated: "drive.errors.unauthenticated",
  network: "drive.errors.offline",
  upload_start_failed: "drive.errors.uploadStartFailed",
  download_failed: "drive.errors.downloadFailed",
  not_connected: "toast.notConnected",
  aborted: "drive.upload.canceled",
  orphan_brake: "drive.errors.generic",
  unknown: "drive.errors.generic",
};

export const DRIVE_GENERIC_ERROR_KEY = "drive.errors.generic";

/**
 * `[sheet.<code>]` codes of the module (SheetErrorCode in spacetimedb/src/drive/sheet-logic.ts; parity-tested) →
 * `sheets.errors.*`. lib/sheets/errors.ts keeps the Sheets editor's own map; this one lets Drive screens show the
 * same copy without importing the editor's modules.
 */
const SHEET_CODE_KEYS: ReadonlyMap<string, string> = new Map([
  ["lease", "sheets.errors.lease"],
  ["not_sheet", "sheets.errors.notSheet"],
  ["stale", "sheets.errors.stale"],
  ["too_large", "sheets.errors.tooLarge"],
  ["invalid", "sheets.errors.invalid"],
  ["sequence", "sheets.errors.sequence"],
  ["quota", "sheets.errors.quota"],
  ["versions_full", "sheets.errors.versionsFull"],
]);

// Server codes plus the client's own: a stringified DriveClientError ("[drive.not_connected]") reads back the same.
const KNOWN_CODES: ReadonlySet<string> = new Set(Object.keys(DRIVE_ERROR_I18N_KEYS));
// Optional "SenderError: " prefix covers errors that were stringified on the way (same rule as lib/docs/errors.ts).
const DRIVE_CODE_RE = /^\s*(?:[A-Za-z]*Error:\s*)?\[drive\.([a-z_]+)\]\s*/;
const DOC_PREFIX_RE = /^\s*(?:[A-Za-z]*Error:\s*)?\[doc\.[a-z_]+\]/;
const SHEET_CODE_RE = /^\s*(?:[A-Za-z]*Error:\s*)?\[sheet\.([a-z_]+)\]/;
// The module's membership check: the caller left the org or was disabled.
const NOT_MEMBER_RE = /Not an active member/i;
// @vercel/blob client errors ("Vercel Blob: …"): BlobRequestAbortedError, and a refused or failed token request.
const BLOB_ABORTED_RE = /The request was aborted\./;
const BLOB_PRESIGN_RE = /Failed to retrieve the presigned URL/;

function rawMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

function errorName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "";
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * The Drive code of a failure, or null when it is not a Drive failure. A `[drive.<code>]` the client does not know
 * (a newer module) is "unknown". A cancelled upload or fetch is "aborted"; any other failure while the browser is
 * offline is "network".
 */
export function driveErrorCode(err: unknown): DriveClientErrorCode | null {
  if (err instanceof DriveClientError) return err.code;
  const message = rawMessage(err);
  const match = DRIVE_CODE_RE.exec(message);
  if (match) return KNOWN_CODES.has(match[1]) ? (match[1] as DriveClientErrorCode) : "unknown";
  if (DOC_PREFIX_RE.test(message) || SHEET_CODE_RE.test(message)) return null;
  if (NOT_MEMBER_RE.test(message)) return "forbidden";
  if (BLOB_ABORTED_RE.test(message) || errorName(err) === "AbortError") return "aborted";
  if (BLOB_PRESIGN_RE.test(message)) return "upload_start_failed";
  if (err != null && isOffline()) return "network";
  return null;
}

/**
 * i18n key for any failure a Drive screen shows: `[doc.*]` → `docs.errors.*`, `[sheet.*]` → `sheets.errors.*`,
 * Drive codes → DRIVE_ERROR_I18N_KEYS, anything else → `drive.errors.generic`.
 */
export function driveErrorKey(err: unknown): string {
  const message = rawMessage(err);
  if (!(err instanceof DriveClientError)) {
    if (DOC_PREFIX_RE.test(message)) {
      const code = docErrorCode(err);
      return code ? DOC_ERROR_I18N_KEYS[code] : DRIVE_GENERIC_ERROR_KEY;
    }
    const sheet = SHEET_CODE_RE.exec(message);
    if (sheet) return SHEET_CODE_KEYS.get(sheet[1]) ?? DRIVE_GENERIC_ERROR_KEY;
  }
  const code = driveErrorCode(err);
  return code ? DRIVE_ERROR_I18N_KEYS[code] : DRIVE_GENERIC_ERROR_KEY;
}
