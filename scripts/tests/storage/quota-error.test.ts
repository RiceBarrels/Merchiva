// lib/storage/quota-error.ts: a quota refusal from an app upload, found anywhere in the error's cause chain and
// re-raised so the Drive and Docs error mappers show the quota copy (imports used to swallow it as a skipped image).

import { describe, expect, test } from "bun:test";
import { DocImportError, importErrorMessageKey } from "@/lib/docs/import";
import { driveErrorCode } from "@/lib/drive/errors";
import { isQuotaExceededError, rethrowIfQuotaExceeded } from "@/lib/storage/quota-error";

const refusal = new Error("Upload failed", { cause: new Error("[drive.quota_exceeded] This store is out of storage") });

describe("quota refusals", () => {
  test("found on the error, its cause, or a string; nothing else matches", () => {
    expect(isQuotaExceededError(refusal)).toBe(true);
    expect(isQuotaExceededError("[drive.quota_exceeded] x")).toBe(true);
    expect(isQuotaExceededError(new Error("[drive.forbidden] no"))).toBe(false);
    expect(isQuotaExceededError(new Error("network"))).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
  });

  test("re-raised with the tag leading its own message, the original as cause; anything else returns", () => {
    let thrown: unknown = null;
    try {
      rethrowIfQuotaExceeded(refusal);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).cause).toBe(refusal);
    expect(driveErrorCode(thrown)).toBe("quota_exceeded");
    expect(() => rethrowIfQuotaExceeded(new Error("network"))).not.toThrow();
    expect(() => rethrowIfQuotaExceeded(null)).not.toThrow();
  });

  test("a docs import failed for a full store reads as the quota message", () => {
    const err = new DocImportError("failed", "x", { cause: refusal, driveKey: "appUpload.quotaExceeded" });
    expect(importErrorMessageKey(err)).toBe("appUpload.quotaExceeded");
  });
});
