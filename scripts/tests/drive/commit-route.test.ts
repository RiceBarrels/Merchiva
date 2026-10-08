// POST /api/drive/commit: visibility first (user-token SQL, no billed HEAD for
// strangers), then HEAD and the service commit; the route answers from its own
// read because reducers return nothing.

import { describe, expect, test } from "bun:test";
import { driveBlobKey, driveThumbKeyFor } from "@/lib/drive/rules";
import { createCommitRouteHandler } from "@/lib/drive/server/handlers/commit";
import type { SqlRow } from "@/lib/drive/server/sql-rows";
import { NOW, ORG, OTHER_ORG, makeDeps, postJson, readBody, reducerError, sqlError, testConfig, type FakeOptions } from "./fake-deps";

const ITEM = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const BLOB = "9b2e4c1a-7d3f-4e8b-a6c5-1f0e2d3c4b5a";
const KEY = driveBlobKey(ORG, ITEM, BLOB, "photo.jpg");
const THUMB = driveThumbKeyFor(KEY);
const OTHER_KEY = driveBlobKey(ORG, ITEM, "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f", "photo.jpg");
const PATH = "/api/drive/commit";
const QUERY = `SELECT id, status, blob_key, thumb_key, size_bytes FROM drive_item WHERE id = '${ITEM}'`;

function row(overrides: Partial<Record<string, unknown>> = {}): SqlRow {
  return { id: ITEM, status: "pending", blob_key: KEY, thumb_key: "", size_bytes: 5000, ...overrides };
}

function setup(rows: SqlRow[], options: FakeOptions = {}) {
  const fake = makeDeps({ onSql: () => rows, ...options });
  return { ...fake, handler: createCommitRouteHandler(fake.deps) };
}

const commit = (body: unknown, token?: string | null) => postJson(PATH, body, { token });
const head = (size: number) => ({ size, contentType: "image/jpeg", etag: "\"etag-1\"", uploadedAt: NOW });

describe("POST /api/drive/commit", () => {
  test("401 without a verified token; 503 without storage env", async () => {
    const anonymous = setup([row()]);
    expect((await anonymous.handler(commit({ itemId: ITEM, blobKey: KEY }, null))).status).toBe(401);
    expect(anonymous.sqls).toHaveLength(0);
    const fake = makeDeps({ config: null });
    const res = await createCommitRouteHandler(fake.deps)(commit({ itemId: ITEM, blobKey: KEY }));
    expect(res.status).toBe(503);
    expect((await readBody(res)).code).toBe("not_configured");
  });

  test("400 for a body that is not JSON; 422 for mismatched ids and keys, before any read", async () => {
    const { handler, sqls } = setup([row()]);
    expect((await handler(postJson(PATH, "{"))).status).toBe(400);
    const bad = [
      {}, { itemId: ITEM }, { itemId: ITEM.toUpperCase(), blobKey: KEY }, { itemId: "nope", blobKey: KEY },
      { itemId: "7a2b9c4d-1e3f-4a5b-8c6d-9e0f1a2b3c4d", blobKey: KEY }, { itemId: ITEM, blobKey: THUMB },
      { itemId: ITEM, blobKey: KEY, thumbKey: driveThumbKeyFor(OTHER_KEY) }, { itemId: ITEM, blobKey: KEY, thumbKey: 5 },
    ];
    for (const body of bad) expect({ body, status: (await handler(commit(body))).status }).toEqual({ body, status: 422 });
    expect(sqls).toHaveLength(0);
  });

  test("the visibility read runs as the caller; no row → 404 with no HEAD", async () => {
    const { handler, sqls, heads, calls } = setup([]);
    const res = await handler(commit({ itemId: ITEM, blobKey: KEY }));
    expect(res.status).toBe(404);
    expect((await readBody(res)).code).toBe("not_found");
    expect(sqls).toEqual([{ query: QUERY, token: "user-jwt" }]);
    expect(heads).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  test("an SQL failure maps like a reducer failure", async () => {
    const { handler } = setup([], { onSql: () => { throw sqlError(401, "Invalid token"); } });
    expect((await handler(commit({ itemId: ITEM, blobKey: KEY }))).status).toBe(401);
  });

  test("happy path: HEAD, commit with the observed size and etag as the service, 200", async () => {
    const { handler, calls, heads } = setup([row(), row()], { blobs: { [KEY]: head(4999) } });
    const res = await handler(commit({ itemId: ITEM, blobKey: KEY }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await readBody(res)).toEqual({ outcome: "committed", sizeBytes: 4999 });
    expect(heads).toEqual([KEY]);
    expect(calls).toEqual([{ key: "commitUpload", args: { itemId: ITEM, blobKey: KEY, observedBytes: 4999, etag: "\"etag-1\"" } }]);
  });

  test("already ready under this key → 200 with the stored size, no HEAD", async () => {
    const { handler, heads, calls } = setup([row({ status: "ready", size_bytes: 4321 })]);
    const res = await handler(commit({ itemId: ITEM, blobKey: KEY }));
    expect(await readBody(res)).toEqual({ outcome: "committed", sizeBytes: 4321 });
    expect(heads).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  test("a pending or ready row under another key → 422 with no module call and no HEAD", async () => {
    for (const status of ["pending", "ready"]) {
      const { handler, calls, heads } = setup([row({ blob_key: OTHER_KEY, status })]);
      const res = await handler(commit({ itemId: ITEM, blobKey: KEY }));
      expect(res.status).toBe(422);
      expect((await readBody(res)).code).toBe("invalid");
      expect(calls).toHaveLength(0);
      expect(heads).toHaveLength(0);
    }
  });

  test("regression: random same-org keys posted against a visible ready file never reach service_discard_drive_blob", async () => {
    // Any member sees every ready Store file; each discard used to queue one drive_blob_gc 'delete' row, without a cap.
    const { handler, calls, heads } = setup([row({ blob_key: KEY, status: "ready" })]);
    for (let i = 0; i < 25; i++) {
      const junk = driveBlobKey(ORG, ITEM, crypto.randomUUID(), "x");
      expect((await handler(commit({ itemId: ITEM, blobKey: junk }))).status).toBe(422);
    }
    expect(calls).toHaveLength(0);
    expect(heads).toHaveLength(0);
  });

  test("a ready row and a key whose org segment is forged → 422 with no discard (no GC row for another org)", async () => {
    const forged = driveBlobKey(OTHER_ORG, ITEM, BLOB, "photo.jpg");
    for (const stored of [row({ blob_key: OTHER_KEY, status: "ready" }), row({ blob_key: "", status: "ready" })]) {
      const { handler, calls, heads } = setup([stored]);
      const res = await handler(commit({ itemId: ITEM, blobKey: forged }));
      expect(res.status).toBe(422);
      expect((await readBody(res)).code).toBe("invalid");
      expect(calls).toHaveLength(0);
      expect(heads).toHaveLength(0);
    }
  });

  test("nothing stored yet → 409 not_uploaded, no commit", async () => {
    const { handler, calls } = setup([row()]);
    const res = await handler(commit({ itemId: ITEM, blobKey: KEY }));
    expect(res.status).toBe(409);
    expect((await readBody(res)).code).toBe("not_uploaded");
    expect(calls).toHaveLength(0);
  });

  test("larger than declared, or empty → the module rejects it; 413 rejected_oversize", async () => {
    for (const size of [5001, 0]) {
      const { handler, calls } = setup([row()], { blobs: { [KEY]: head(size) } });
      const res = await handler(commit({ itemId: ITEM, blobKey: KEY }));
      expect(res.status).toBe(413);
      expect(await readBody(res)).toMatchObject({ code: "too_large", outcome: "rejected_oversize", sizeBytes: size });
      expect(calls.map((c) => c.key)).toEqual(["commitUpload"]);
    }
  });

  test("the row vanished before the commit → discard, 404", async () => {
    const { handler, calls } = setup([row()], {
      blobs: { [KEY]: head(10) },
      onCall: (key) => {
        if (key === "commitUpload") throw reducerError("service_commit_drive_upload", 530, "[drive.not_found] Upload not found");
      },
    });
    expect((await handler(commit({ itemId: ITEM, blobKey: KEY }))).status).toBe(404);
    expect(calls.map((c) => c.key)).toEqual(["commitUpload", "discardBlob"]);
  });

  test("other commit failures keep their code", async () => {
    const { handler } = setup([row()], {
      blobs: { [KEY]: head(10) },
      onCall: () => { throw reducerError("service_commit_drive_upload", 500, "boom"); },
    });
    const res = await handler(commit({ itemId: ITEM, blobKey: KEY }));
    expect(res.status).toBe(502);
    expect((await readBody(res)).code).toBe("upstream");
  });

  test("a thumbnail is attached before the commit; its failure is not fatal", async () => {
    const ok = setup([row()], { blobs: { [KEY]: head(10), [THUMB]: head(700) } });
    expect((await ok.handler(commit({ itemId: ITEM, blobKey: KEY, thumbKey: THUMB }))).status).toBe(200);
    expect(ok.heads).toEqual([THUMB, KEY]);
    expect(ok.calls).toEqual([
      { key: "setThumb", args: { itemId: ITEM, thumbKey: THUMB, observedBytes: 700 } },
      { key: "commitUpload", args: { itemId: ITEM, blobKey: KEY, observedBytes: 10, etag: "\"etag-1\"" } },
    ]);

    const failing = setup([row()], {
      blobs: { [KEY]: head(10), [THUMB]: head(700) },
      onCall: (key) => { if (key === "setThumb") throw reducerError("service_set_drive_thumb", 530, "[drive.invalid] no"); },
    });
    expect((await failing.handler(commit({ itemId: ITEM, blobKey: KEY, thumbKey: THUMB }))).status).toBe(200);
    expect(failing.logs.some((l) => l.event === "drive.commit.thumb_failed")).toBe(true);

    const attached = setup([row({ thumb_key: THUMB })], { blobs: { [KEY]: head(10), [THUMB]: head(700) } });
    await attached.handler(commit({ itemId: ITEM, blobKey: KEY, thumbKey: THUMB }));
    expect(attached.heads).toEqual([KEY]);
  });

  test("uploads paused: commits still settle", async () => {
    const fake = makeDeps({ config: testConfig({ uploadsPaused: true }), onSql: () => [row()], blobs: { [KEY]: head(10) } });
    expect((await createCommitRouteHandler(fake.deps)(commit({ itemId: ITEM, blobKey: KEY }))).status).toBe(200);
  });
});
