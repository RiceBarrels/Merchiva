// Sheet reducers fail with `SenderError("[sheet.<code>] Human text")` (spacetimedb/src/drive/sheets.ts);
// the SDK rejects the reducer promise with that message verbatim. The client adds `[sheet.offline]` when
// no live connection exists (lib/spacetimedb/actions/sheets.ts). Sheet screens also meet Docs failures
// (`[doc.*]`: access, trash, unpublished module) and Drive failures (`[drive.*]`: acting operator), so
// sheetOrDocErrorKey is the one place a Sheets screen turns any failure into copy.

import { DOC_ERROR_I18N_KEYS, docErrorCode } from "@/lib/docs/errors";
import { driveErrorKey } from "@/lib/drive/errors";
import type { SheetErrorCode } from "./types";

/** i18n key of each code (`sheets.errors.*`, scripts/i18n/drive/sheets/). */
export const SHEET_ERROR_I18N_KEYS: Readonly<Record<SheetErrorCode, string>> = {
  lease: "sheets.errors.lease",
  not_sheet: "sheets.errors.notSheet",
  stale: "sheets.errors.stale",
  too_large: "sheets.errors.tooLarge",
  invalid: "sheets.errors.invalid",
  sequence: "sheets.errors.sequence",
  quota: "sheets.errors.quota",
  versions_full: "sheets.errors.versionsFull",
  offline: "sheets.errors.offline",
};

const SHEET_ERROR_CODES: ReadonlySet<string> = new Set(Object.keys(SHEET_ERROR_I18N_KEYS));
// Optional "SenderError: " prefix covers errors that were stringified on the way (as lib/docs/errors.ts).
const SHEET_CODE_RE = /^\s*(?:[A-Za-z]*Error:\s*)?\[sheet\.([a-z_]+)\]\s*/;

/** Thrown by the sheet reducer wrappers when there is no live connection; reads back as `offline`. */
export class SheetOfflineError extends Error {
  constructor(message = "[sheet.offline] Not connected") {
    super(message);
    this.name = "SheetOfflineError";
  }
}

function rawMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/** The `[sheet.<code>]` code of a failure, or null (not a sheet failure, or a code this client does not know). */
export function sheetErrorCode(err: unknown): SheetErrorCode | null {
  if (err instanceof SheetOfflineError) return "offline";
  const match = SHEET_CODE_RE.exec(rawMessage(err));
  return match && SHEET_ERROR_CODES.has(match[1]) ? (match[1] as SheetErrorCode) : null;
}

/** The human part of a sheet error message, without the `[sheet.<code>]` prefix. */
export function sheetErrorMessage(err: unknown): string {
  return rawMessage(err).replace(SHEET_CODE_RE, "").trim();
}

/**
 * i18n key for any failure a Sheets screen shows: `[sheet.*]` → `sheets.errors.*`, `[doc.*]` →
 * `docs.errors.*`, everything else (Drive codes, network, unknown) → lib/drive/errors driveErrorKey,
 * whose fallback is `drive.errors.generic`.
 */
export function sheetOrDocErrorKey(err: unknown): string {
  const sheet = sheetErrorCode(err);
  if (sheet) return SHEET_ERROR_I18N_KEYS[sheet];
  const doc = docErrorCode(err);
  if (doc) return DOC_ERROR_I18N_KEYS[doc];
  return driveErrorKey(err);
}
