// DRIVE_STDB_CALLS against the generated bindings: every reducer the Drive
// routes call over HTTP exists under that snake_case name, and its parameters
// are exactly `params`, in declaration order (HTTP /call takes a positional
// array). A camelCase name would answer 404 "No such procedure" on every call.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DRIVE_STDB_CALLS, driveCallArgs, type DriveStdbCallKey } from "@/lib/drive/server/stdb-calls";

const GENERATED = join(import.meta.dir, "..", "..", "..", "lib", "spacetimedb", "generated");
const KEYS = Object.keys(DRIVE_STDB_CALLS) as DriveStdbCallKey[];

describe("DRIVE_STDB_CALLS", () => {
  test("covers the storage reducers of CONTRACTS §2.8 (no plan-quota stamping, DECISIONS U10)", () => {
    expect([...KEYS].sort()).toEqual([
      "ackGc", "authorizeUpload", "backfillAppFiles", "beginAppUpload", "commitUpload", "discardBlob", "enqueueOrphans",
      "ensureReader", "failGc", "failUpload", "finishReconcile", "recomputeStorage", "recordAppFile", "setThumb", "sweep",
    ]);
    expect("setPlanQuota" in DRIVE_STDB_CALLS).toBe(false);
  });

  test("only authorize_drive_upload and begin_app_upload run as the user; everything else as the service identity", () => {
    const userCalls: ReadonlySet<string> = new Set(["authorizeUpload", "beginAppUpload"]);
    for (const key of KEYS) {
      expect(DRIVE_STDB_CALLS[key].as).toBe(userCalls.has(key) ? "user" : "service");
      if (!userCalls.has(key)) expect(DRIVE_STDB_CALLS[key].name.startsWith("service_")).toBe(true);
    }
  });

  for (const key of KEYS) {
    const spec = DRIVE_STDB_CALLS[key];
    test(`${key} → ${spec.name} matches the generated bindings`, async () => {
      expect(spec.name).toMatch(/^[a-z][a-z0-9_]*$/);
      const file = join(GENERATED, `${spec.name}_reducer.ts`);
      expect(existsSync(file)).toBe(true);
      const mod = (await import(file)) as { default: Record<string, unknown> };
      expect(Object.keys(mod.default)).toEqual([...spec.params]);
    });
  }
});

describe("driveCallArgs", () => {
  test("orders named arguments by params, whatever the object's key order", () => {
    expect(driveCallArgs("authorizeUpload", {
      multipart: false, mimeType: "image/webp", sizeBytes: 1200, pathname: "org/o/i/b/_thumb", variant: "thumb", itemId: "i",
    })).toEqual(["i", "thumb", "org/o/i/b/_thumb", 1200, "image/webp", false]);
    expect(driveCallArgs("commitUpload", { etag: "\"e\"", observedBytes: 5, blobKey: "k", itemId: "i" })).toEqual(["i", "k", 5, "\"e\""]);
    expect(driveCallArgs("failGc", { error: "boom", blobKeysJson: "[\"k\"]" })).toEqual(["[\"k\"]", "boom"]);
    expect(driveCallArgs("finishReconcile", { measuredCount: 3, measuredBytes: 9, organizationId: "o" })).toEqual(["o", 9, 3]);
    expect(driveCallArgs("beginAppUpload", { fileCount: 2, totalBytes: 10, source: "chat", organizationId: "o" }))
      .toEqual(["o", "chat", 10, 2]);
    expect(driveCallArgs("recordAppFile", { mimeType: "image/png", sizeBytes: 7, source: "bugs", keyHash: "h", organizationId: "o" }))
      .toEqual(["o", "h", "bugs", 7, "image/png"]);
  });

  test("a call without parameters posts an empty array", () => {
    expect(driveCallArgs("ensureReader", {})).toEqual([]);
  });

  test("a missing argument fails loudly instead of posting undefined", () => {
    const partial = { itemId: "i", blobKey: "k" } as unknown as Parameters<typeof driveCallArgs<"commitUpload">>[1];
    expect(() => driveCallArgs("commitUpload", partial)).toThrow(/observedBytes/);
  });
});
