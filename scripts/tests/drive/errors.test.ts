// lib/drive/errors.ts — `[drive.<code>]` parsing, the client-only codes, and the
// i18n key of any failure a Drive screen shows. Server-union parity is in parity.test.ts.

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOC_ERROR_I18N_KEYS } from "@/lib/docs/errors";
import {
  DRIVE_ERROR_I18N_KEYS,
  DRIVE_GENERIC_ERROR_KEY,
  DRIVE_SERVER_ERROR_CODES,
  DriveClientError,
  driveErrorCode,
  driveErrorKey,
  type DriveClientErrorCode,
} from "@/lib/drive/errors";
import { flattenMessages, leavesOf, loadFragments } from "../../i18n/drive/fragment";

class SenderError extends Error {}

const CLIENT_ONLY: DriveClientErrorCode[] = [
  "not_published", "not_connected", "not_uploaded", "not_configured", "network",
  "upload_start_failed", "download_failed", "unauthenticated", "aborted", "unknown",
];

function setOnline(value: boolean | undefined): void {
  Object.defineProperty(globalThis.navigator, "onLine", { value, configurable: true });
}

afterEach(() => {
  delete (globalThis.navigator as { onLine?: boolean }).onLine;
});

describe("DriveClientError", () => {
  test("carries its code", () => {
    const err = new DriveClientError("not_connected");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("DriveClientError");
    expect(err.code).toBe("not_connected");
    expect(err.message).toBe("[drive.not_connected]");
    expect(new DriveClientError("network", "Offline").message).toBe("Offline");
    expect(driveErrorCode(err)).toBe("not_connected");
  });

  test("a stringified one reads back the same code", () => {
    expect(driveErrorCode(String(new DriveClientError("not_configured")))).toBe("not_configured");
    expect(driveErrorCode({ message: new DriveClientError("aborted").message })).toBe("aborted");
  });
});

describe("driveErrorCode", () => {
  test("every server code, however the message arrives", () => {
    for (const code of DRIVE_SERVER_ERROR_CODES) {
      expect(driveErrorCode(new SenderError(`[drive.${code}] Human text`))).toBe(code);
      expect(driveErrorCode(`SenderError: [drive.${code}] Human text`)).toBe(code);
      expect(driveErrorCode({ message: `  [drive.${code}]` })).toBe(code);
    }
  });

  test("a code this client does not know is still a Drive failure", () => {
    expect(driveErrorCode(new Error("[drive.some_future_code] x"))).toBe("unknown");
  });

  test("membership, upload SDK and abort failures", () => {
    expect(driveErrorCode(new SenderError("Not an active member of this organization"))).toBe("forbidden");
    expect(driveErrorCode(new Error("Vercel Blob: The request was aborted."))).toBe("aborted");
    expect(driveErrorCode(new DOMException("signal is aborted without reason", "AbortError"))).toBe("aborted");
    expect(driveErrorCode(new Error("Vercel Blob: Failed to retrieve the presigned URL"))).toBe("upload_start_failed");
  });

  test("docs and sheets failures, and anything else, are not Drive codes", () => {
    for (const err of [
      new Error("[doc.forbidden] You do not have access"),
      new Error("[sheet.lease] Someone else is editing"),
      new Error("prefix [drive.forbidden] not at start"),
      new Error("Failed to fetch"),
      "plain",
      null,
      undefined,
      42,
    ]) {
      expect(driveErrorCode(err)).toBeNull();
    }
  });

  test("offline turns an unrecognised failure into network, never a recognised one", () => {
    setOnline(false);
    expect(driveErrorCode(new TypeError("Failed to fetch"))).toBe("network");
    expect(driveErrorCode(new Error("[drive.quota_exceeded] Full"))).toBe("quota_exceeded");
    expect(driveErrorCode(new Error("Vercel Blob: The request was aborted."))).toBe("aborted");
    expect(driveErrorCode(new Error("[doc.forbidden] x"))).toBeNull();
    expect(driveErrorCode(null)).toBeNull();
    setOnline(true);
    expect(driveErrorCode(new TypeError("Failed to fetch"))).toBeNull();
  });
});

describe("DRIVE_ERROR_I18N_KEYS", () => {
  test("one key per code", () => {
    expect(Object.keys(DRIVE_ERROR_I18N_KEYS).sort()).toEqual([...DRIVE_SERVER_ERROR_CODES, ...CLIENT_ONLY].sort());
  });

  test("the CONTRACTS §2.6 table", () => {
    expect(DRIVE_ERROR_I18N_KEYS).toMatchObject({
      not_found: "drive.errors.notFound", forbidden: "drive.errors.forbidden", operator: "drive.errors.operator",
      subtree_forbidden: "drive.errors.subtreeForbidden", device_scope: "drive.errors.deviceScope",
      invalid: "drive.errors.invalid", invalid_name: "drive.errors.invalidName", cycle: "drive.errors.cycle",
      too_deep: "drive.errors.tooDeep", space_mismatch: "drive.errors.spaceMismatch", batch_too_large: "drive.errors.batchTooLarge",
      trashed: "drive.errors.trashed", expired: "drive.errors.expired", conflict: "drive.errors.conflict",
      not_uploaded: "drive.errors.notUploaded", too_large: "drive.errors.tooLarge", blocked_type: "drive.errors.blockedType",
      too_many_pending: "drive.errors.tooManyPending", too_many_attempts: "drive.errors.tooManyAttempts",
      too_many_items: "drive.errors.tooManyItems", quota_exceeded: "drive.errors.quotaExceeded",
      not_configured: "drive.errors.storageUnavailable", not_published: "drive.errors.notPublished",
      unauthenticated: "drive.errors.unauthenticated", network: "drive.errors.offline",
      upload_start_failed: "drive.errors.uploadStartFailed", download_failed: "drive.errors.downloadFailed",
      not_connected: "toast.notConnected", aborted: "drive.upload.canceled",
      orphan_brake: DRIVE_GENERIC_ERROR_KEY, unknown: DRIVE_GENERIC_ERROR_KEY,
    });
  });

  test("every key exists in English: messages/en.json or a Drive i18n fragment", () => {
    const messages = flattenMessages(JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "..", "messages", "en.json"), "utf8")));
    const known = new Set(messages.keys());
    for (const fragment of loadFragments()) for (const key of leavesOf(fragment, "en").keys()) known.add(key);
    const missing = [...new Set([...Object.values(DRIVE_ERROR_I18N_KEYS), DRIVE_GENERIC_ERROR_KEY, ...Object.values(DOC_ERROR_I18N_KEYS)])]
      .filter((key) => !known.has(key));
    expect(missing).toEqual([]);
  });
});

describe("driveErrorKey", () => {
  test("Drive, Docs and Sheets prefixes each get their own copy", () => {
    expect(driveErrorKey(new SenderError("[drive.quota_exceeded] Full"))).toBe("drive.errors.quotaExceeded");
    expect(driveErrorKey(new DriveClientError("not_configured"))).toBe("drive.errors.storageUnavailable");
    expect(driveErrorKey(new DriveClientError("aborted"))).toBe("drive.upload.canceled");
    expect(driveErrorKey(new DriveClientError("not_connected"))).toBe("toast.notConnected");
    expect(driveErrorKey(new Error("[doc.forbidden] You do not have access"))).toBe(DOC_ERROR_I18N_KEYS.forbidden);
    expect(driveErrorKey("SenderError: [doc.too_large] x")).toBe(DOC_ERROR_I18N_KEYS.too_large);
    expect(driveErrorKey(new Error("[sheet.lease] Someone else is editing"))).toBe("sheets.errors.lease");
    expect(driveErrorKey(new Error("[sheet.versions_full] x"))).toBe("sheets.errors.versionsFull");
    expect(driveErrorKey(new Error("Not an active member of this organization"))).toBe("drive.errors.forbidden");
  });

  test("unknown codes and anything else fall back to the generic message", () => {
    for (const err of [new Error("[doc.nope] x"), new Error("[sheet.nope] x"), new Error("[drive.nope] x"), new Error("boom"), null, {}]) {
      expect(driveErrorKey(err)).toBe(DRIVE_GENERIC_ERROR_KEY);
    }
    expect(DRIVE_GENERIC_ERROR_KEY).toBe("drive.errors.generic");
  });

  test("a DriveClientError is read by its code, whatever its message says", () => {
    expect(driveErrorKey(new DriveClientError("forbidden", "[doc.not_found] from a nested call"))).toBe("drive.errors.forbidden");
  });
});
