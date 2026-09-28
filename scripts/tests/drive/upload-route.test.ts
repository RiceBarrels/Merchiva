// POST /api/drive/upload through the REAL @vercel/blob handleUploadPresigned:
// presigning runs offline over a synthetic delegation, and upload-completed
// callbacks are signed with a freshly generated Ed25519 key.

import { afterEach, describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { driveBlobKey, driveThumbKeyFor } from "@/lib/drive/rules";
import { createUploadRouteHandler } from "@/lib/drive/server/handlers/upload";
import { DRIVE_PUT_TTL_MULTIPART_MS, DRIVE_PUT_TTL_SINGLE_MS } from "@/lib/drive/server/handlers/config";
import type { DriveStdbCallKey } from "@/lib/drive/server/stdb-calls";
import { NOW, ORG, makeDeps, postJson, readBody, reducerError, testConfig, type FakeOptions } from "./fake-deps";

const ITEM = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const BLOB = "9b2e4c1a-7d3f-4e8b-a6c5-1f0e2d3c4b5a";
const KEY = driveBlobKey(ORG, ITEM, BLOB, "Q3 report.xlsx");
const THUMB = driveThumbKeyFor(KEY);
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
const PATH = "/api/drive/upload";

function setup(options: FakeOptions = {}, configOverrides = {}) {
  const fake = makeDeps({ config: testConfig({ webhookPublicKey: PEM, ...configOverrides }), ...options });
  return { ...fake, handler: createUploadRouteHandler(fake.deps) };
}

function clientPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ v: 1, itemId: ITEM, sizeBytes: 5000, contentType: XLSX, ...overrides });
}

function generate(pathname: string, payload: string | null, multipart = false, token?: string | null): Request {
  return postJson(PATH, { type: "blob.generate-presigned-url", payload: { pathname, clientPayload: payload, multipart } }, { token });
}

function completed(pathname: string, tokenPayload: string | null, opts: { signature?: string } = {}): Request {
  const body = {
    type: "blob.upload-completed",
    payload: {
      blob: { url: `https://s.private.blob.vercel-storage.com/${pathname}`, downloadUrl: "", pathname, contentType: XLSX, contentDisposition: "", etag: "\"e1\"" },
      tokenPayload,
    },
  };
  const raw = JSON.stringify(body);
  const signature = opts.signature ?? sign(null, Buffer.from(raw), privateKey).toString("hex");
  return postJson(PATH, raw, { token: null, headers: signature === "" ? {} : { "x-vercel-signature": signature } });
}

const originalToken = JSON.stringify({ v: 1, itemId: ITEM, thumb: false });
const thumbToken = JSON.stringify({ v: 1, itemId: ITEM, thumb: true });
const failWith = (key: DriveStdbCallKey, name: string, status: number, body: string): FakeOptions["onCall"] => (k) => {
  if (k === key) throw reducerError(name, status, body);
};

afterEach(() => {
  delete process.env.VERCEL_BLOB_CALLBACK_URL;
});

describe("token requests (blob.generate-presigned-url)", () => {
  test("503 not_configured without storage env, before anything else", async () => {
    const fake = makeDeps({ config: null });
    const res = await createUploadRouteHandler(fake.deps)(generate(KEY, clientPayload()));
    expect(res.status).toBe(503);
    expect((await readBody(res)).code).toBe("not_configured");
    expect(fake.calls).toHaveLength(0);
  });

  test("503 when uploads are paused", async () => {
    const { handler, calls } = setup({}, { uploadsPaused: true });
    const res = await handler(generate(KEY, clientPayload()));
    expect(res.status).toBe(503);
    expect((await readBody(res)).code).toBe("not_configured");
    expect(calls).toHaveLength(0);
  });

  test("401 without a verified token", async () => {
    for (const token of [null, "forged"]) {
      const { handler, calls } = setup();
      const res = await handler(generate(KEY, clientPayload(), false, token));
      expect(res.status).toBe(401);
      expect((await readBody(res)).code).toBe("unauthenticated");
      expect(calls).toHaveLength(0);
    }
  });

  test("400 for malformed JSON, oversized bodies and unknown events", async () => {
    const { handler } = setup();
    expect((await handler(postJson(PATH, "{nope"))).status).toBe(400);
    expect((await handler(postJson(PATH, { type: "blob.generate-client-token", payload: {} }))).status).toBe(400);
    expect((await handler(postJson(PATH, { type: "blob.generate-presigned-url", payload: {} }))).status).toBe(400);
    const padded = { type: "blob.generate-presigned-url", payload: { pathname: KEY, clientPayload: clientPayload(), multipart: false }, pad: "x".repeat(9000) };
    const tooBig = await handler(postJson(PATH, padded));
    expect(tooBig.status).toBe(400);
    expect((await readBody(tooBig)).error).toBe("Request body is too large");
  });

  test("422 for a bad payload or a key that is not this item's, without calling the module", async () => {
    const other = driveBlobKey(ORG, "7a2b9c4d-1e3f-4a5b-8c6d-9e0f1a2b3c4d", BLOB, "x.pdf");
    const bad: Array<[string, string | null, boolean]> = [
      [KEY, null, false],
      [KEY, "not json", false],
      [KEY, clientPayload({ v: 2 }), false],
      [KEY, clientPayload({ itemId: ITEM.toUpperCase() }), false],
      [KEY, clientPayload({ sizeBytes: 0 }), false],
      [KEY, clientPayload({ sizeBytes: 1.5 }), false],
      [KEY, clientPayload({ sizeBytes: 2 * 1024 ** 3 }), false],
      [KEY, clientPayload({ contentType: "Application/PDF" }), false],
      [KEY, clientPayload({ contentType: "" }), false],
      [other, clientPayload(), false],
      ["org/x/y/z/a.pdf", clientPayload(), false],
      [THUMB, clientPayload({ contentType: "image/webp", sizeBytes: 900 }), true],
    ];
    for (const [pathname, payload, multipart] of bad) {
      const { handler, calls, putTokens } = setup();
      const res = await handler(generate(pathname, payload, multipart));
      expect({ pathname, payload, status: res.status }).toEqual({ pathname, payload, status: 422 });
      expect((await readBody(res)).code).toBe("invalid");
      expect(calls).toHaveLength(0);
      expect(putTokens).toHaveLength(0);
    }
  });

  test("module refusals keep their codes", async () => {
    const cases: Array<[string, number, string]> = [
      ["[drive.forbidden] Only the person who started this upload can send it", 403, "forbidden"],
      ["[drive.expired] This upload has expired", 409, "expired"],
      ["[drive.conflict] This upload has already finished", 409, "conflict"],
      ["[drive.too_many_attempts] This upload failed too many times", 429, "too_many_attempts"],
      ["[drive.invalid] That does not match the upload", 422, "invalid"],
    ];
    for (const [body, status, code] of cases) {
      const { handler, putTokens } = setup({ onCall: failWith("authorizeUpload", "authorize_drive_upload", 530, body) });
      const res = await handler(generate(KEY, clientPayload()));
      expect(res.status).toBe(status);
      expect((await readBody(res)).code).toBe(code);
      expect(putTokens).toHaveLength(0);
    }
  });

  test("happy path: authorize as the caller, then a put delegation for exactly this key, size and type", async () => {
    const { handler, calls, putTokens } = setup();
    const res = await handler(generate(KEY, clientPayload()));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(calls).toEqual([{
      key: "authorizeUpload",
      args: { itemId: ITEM, variant: "original", pathname: KEY, sizeBytes: 5000, mimeType: XLSX, multipart: false },
      userToken: "user-jwt",
    }]);
    expect(putTokens).toEqual([{
      pathname: KEY,
      opts: { maximumSizeInBytes: 5000, allowedContentTypes: [XLSX], validUntil: NOW + DRIVE_PUT_TTL_SINGLE_MS },
    }]);
    const body = await readBody(res);
    expect(body.type).toBe("blob.generate-presigned-url");
    const presigned = body.presignedUrlPayload as { params: Record<string, string>; signature: string };
    expect(presigned.signature.length).toBeGreaterThan(20);
    expect(presigned.params).toEqual({
      "vercel-blob-allowed-content-types": XLSX,
      "vercel-blob-maximum-size-in-bytes": "5000",
      "vercel-blob-add-random-suffix": "false",
      "vercel-blob-allow-overwrite": "false",
    });
  });

  test("multipart originals get the long window; thumbnails authorize as 'thumb'", async () => {
    const multi = setup();
    expect((await multi.handler(generate(KEY, clientPayload({ sizeBytes: 64 * 1024 ** 2 }), true))).status).toBe(200);
    expect(multi.calls[0].args.multipart).toBe(true);
    expect(multi.putTokens[0].opts.validUntil).toBe(NOW + DRIVE_PUT_TTL_MULTIPART_MS);

    const thumb = setup();
    expect((await thumb.handler(generate(THUMB, clientPayload({ sizeBytes: 900, contentType: "image/webp" })))).status).toBe(200);
    expect(thumb.calls[0].args).toEqual({ itemId: ITEM, variant: "thumb", pathname: THUMB, sizeBytes: 900, mimeType: "image/webp", multipart: false });
    expect(thumb.putTokens[0].opts.allowedContentTypes).toEqual(["image/webp"]);
  });

  test("callbacks enabled: the presigned URL carries the callback and our token payload", async () => {
    process.env.VERCEL_BLOB_CALLBACK_URL = "https://cb.example";
    const { handler } = setup({}, { callbacksEnabled: true });
    const params = ((await readBody(await handler(generate(KEY, clientPayload())))).presignedUrlPayload as { params: Record<string, string> }).params;
    expect(params["vercel-blob-callback-url"]).toBe("https://cb.example/api/drive/upload");
    expect(JSON.parse(params["vercel-blob-callback-token-payload"])).toEqual({ v: 1, itemId: ITEM, thumb: false });
  });

  test("callbacks disabled: no callback is registered even when the SDK could find a URL", async () => {
    process.env.VERCEL_BLOB_CALLBACK_URL = "https://cb.example";
    const { handler } = setup();
    const params = ((await readBody(await handler(generate(KEY, clientPayload())))).presignedUrlPayload as { params: Record<string, string> }).params;
    expect(params["vercel-blob-callback-url"]).toBeUndefined();
  });
});

describe("upload-completed callbacks (Vercel-signed backstop)", () => {
  const head = { size: 4800, contentType: XLSX, etag: "\"e1\"", uploadedAt: NOW };

  test("a valid callback HEADs and commits with the observed size and etag", async () => {
    const { handler, calls, heads } = setup({ blobs: { [KEY]: head } });
    const res = await handler(completed(KEY, originalToken));
    expect(res.status).toBe(200);
    expect(heads).toEqual([KEY]);
    expect(calls).toEqual([{ key: "commitUpload", args: { itemId: ITEM, blobKey: KEY, observedBytes: 4800, etag: "\"e1\"" } }]);
  });

  test("a thumbnail callback attaches the thumbnail", async () => {
    const { handler, calls } = setup({ blobs: { [THUMB]: { ...head, size: 900 } } });
    expect((await handler(completed(THUMB, thumbToken))).status).toBe(200);
    expect(calls).toEqual([{ key: "setThumb", args: { itemId: ITEM, thumbKey: THUMB, observedBytes: 900 } }]);
  });

  test("paused uploads still settle callbacks", async () => {
    const { handler, calls } = setup({ blobs: { [KEY]: head } }, { uploadsPaused: true });
    expect((await handler(completed(KEY, originalToken))).status).toBe(200);
    expect(calls.map((c) => c.key)).toEqual(["commitUpload"]);
  });

  test("row gone or key mismatch → the key is handed to discard, 200", async () => {
    for (const body of ["[drive.not_found] Upload not found", "[drive.invalid] That is not this upload's key"]) {
      const { handler, calls } = setup({ blobs: { [KEY]: head }, onCall: failWith("commitUpload", "service_commit_drive_upload", 530, body) });
      expect((await handler(completed(KEY, originalToken))).status).toBe(200);
      expect(calls.map((c) => c.key)).toEqual(["commitUpload", "discardBlob"]);
      expect(calls[1].args).toEqual({ itemId: ITEM, blobKey: KEY });
    }
  });

  test("other final refusals answer 200 without a discard", async () => {
    const { handler, calls } = setup({ blobs: { [KEY]: head }, onCall: failWith("commitUpload", "service_commit_drive_upload", 530, "[drive.forbidden] Service identity required") });
    expect((await handler(completed(KEY, originalToken))).status).toBe(200);
    expect(calls.map((c) => c.key)).toEqual(["commitUpload"]);
  });

  test("transient failures answer 500 so Vercel retries", async () => {
    for (const [status, body] of [[500, "boom"], [404, "No such procedure"]] as const) {
      const { handler } = setup({ blobs: { [KEY]: head }, onCall: failWith("commitUpload", "service_commit_drive_upload", status, body) });
      const res = await handler(completed(KEY, originalToken));
      expect(res.status).toBe(500);
    }
    const headFails = setup({ onHead: () => { throw new Error("Vercel Blob: service unavailable"); } });
    expect((await headFails.handler(completed(KEY, originalToken))).status).toBe(500);
  });

  test("nothing stored, or a token payload that does not match the key → 200, no module call", async () => {
    const missing = setup();
    expect((await missing.handler(completed(KEY, originalToken))).status).toBe(200);
    expect(missing.calls).toHaveLength(0);
    for (const token of [null, "garbage", thumbToken, JSON.stringify({ v: 1, itemId: "7a2b9c4d-1e3f-4a5b-8c6d-9e0f1a2b3c4d", thumb: false })]) {
      const { handler, calls, heads } = setup({ blobs: { [KEY]: head } });
      expect((await handler(completed(KEY, token))).status).toBe(200);
      expect(calls).toHaveLength(0);
      expect(heads).toHaveLength(0);
    }
  });

  test("forged or missing signatures → 401, nothing done", async () => {
    for (const signature of ["00".repeat(64), ""]) {
      const { handler, calls, heads } = setup({ blobs: { [KEY]: head } });
      const res = await handler(completed(KEY, originalToken, { signature }));
      expect(res.status).toBe(401);
      expect((await readBody(res)).code).toBe("unauthenticated");
      expect(calls).toHaveLength(0);
      expect(heads).toHaveLength(0);
    }
  });
});
