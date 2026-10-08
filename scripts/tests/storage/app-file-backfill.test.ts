// lib/storage/app-file-backfill.ts: listing, the entries scripts/backfill-app-files.ts
// sends to serviceBackfillAppFiles, and the batches it splits them into (the module's
// limits, spacetimedb/src/drive/storage-reducers.ts).

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { APP_BACKFILL_MAX as MODULE_BACKFILL_MAX } from "../../../spacetimedb/src/drive/storage-reducers";
import {
  APP_BACKFILL_MAX, APP_BACKFILL_MAX_CHARS, appBackfillChunks, appBackfillPlan, listAllUploadThingFiles,
  type AppBackfillEntry, type UploadThingListedFile,
} from "@/lib/storage/app-file-backfill";

const hashOf = (key: string): string => createHash("sha256").update(key, "utf8").digest("hex");
const file = (key: string, over: Partial<UploadThingListedFile> = {}): UploadThingListedFile => ({
  key, name: `${key}.png`, size: 100, status: "Uploaded", ...over,
});

describe("listAllUploadThingFiles", () => {
  test("pages with limit + offset until hasMore is false", async () => {
    const all = Array.from({ length: 7 }, (_, i) => file(`k${i}`));
    const calls: Array<{ limit: number; offset: number }> = [];
    const listed = await listAllUploadThingFiles(async (opts) => {
      calls.push(opts);
      const files = all.slice(opts.offset, opts.offset + opts.limit);
      return { files, hasMore: opts.offset + files.length < all.length };
    }, 3);
    expect(listed.map((f) => f.key)).toEqual(all.map((f) => f.key));
    expect(calls).toEqual([{ limit: 3, offset: 0 }, { limit: 3, offset: 3 }, { limit: 3, offset: 6 }]);
  });

  test("an empty page ends the listing even when hasMore stays true", async () => {
    let calls = 0;
    const listed = await listAllUploadThingFiles(async () => {
      calls++;
      return { files: calls === 1 ? [file("a")] : [], hasMore: true };
    }, 1);
    expect([listed.length, calls]).toEqual([1, 2]);
  });
});

describe("appBackfillPlan", () => {
  test("keeps uploaded files once each, hashed like the upload path, typed by extension", () => {
    const plan = appBackfillPlan([
      file("a", { name: "photo.JPG", size: 10 }),
      file("b", { name: "clip.mp4", size: 20, status: "Uploading" }),
      file("a", { size: 999 }),
      file("c", { name: "notes", size: 5 }),
      file("d/e"),
      file("", { size: 1 }),
      file("f", { size: -1 }),
      file("g", { status: "Deletion Pending" }),
      file("x".repeat(257)),
    ]);
    expect(plan.entries).toEqual([
      { key: "a", keyHash: hashOf("a"), sizeBytes: 10, mimeType: "image/jpeg" },
      { key: "c", keyHash: hashOf("c"), sizeBytes: 5, mimeType: "application/octet-stream" },
    ]);
    expect([plan.notUploaded, plan.duplicates, plan.invalid, plan.totalBytes]).toEqual([2, 1, 4, 15]);
  });
});

describe("appBackfillChunks", () => {
  const entries = (n: number): AppBackfillEntry[] =>
    Array.from({ length: n }, (_, i) => ({ key: `k${i}`, keyHash: hashOf(`k${i}`), sizeBytes: i, mimeType: "image/png" }));

  test("the module's batch limit", () => {
    expect(APP_BACKFILL_MAX).toBe(MODULE_BACKFILL_MAX);
    expect(APP_BACKFILL_MAX_CHARS).toBe(MODULE_BACKFILL_MAX * 512);
  });

  test("splits by count, in order, every chunk a JSON list of the entries", () => {
    const all = entries(5);
    const chunks = appBackfillChunks(all, 2);
    expect(chunks.length).toBe(3);
    expect(chunks.flatMap((c) => JSON.parse(c) as AppBackfillEntry[])).toEqual(all);
    expect(chunks.map((c) => (JSON.parse(c) as unknown[]).length)).toEqual([2, 2, 1]);
  });

  test("splits by characters, never past the limit", () => {
    const all = entries(10);
    const one = JSON.stringify(all[0]).length;
    const max = one * 3 + 4;
    const chunks = appBackfillChunks(all, 100, max);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(max);
    expect(chunks.flatMap((c) => JSON.parse(c) as AppBackfillEntry[])).toEqual(all);
  });

  test("nothing to send: no chunks", () => {
    expect(appBackfillChunks([])).toEqual([]);
  });
});
