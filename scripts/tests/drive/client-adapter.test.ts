// lib/drive/client.ts, the adapter the Drive UI calls: startDriveUpload knows
// its item id before any request and runs the real transport (fake
// connection, stubbed status, local upload route), reports `not_configured`
// without Blob storage and releases the row of a failed one-shot upload;
// fetchDriveUrls maps and chunks through the
// shared loader; deleteDriveItemsForever calls the Drive write wrapper and
// drops cached URLs.

import { afterEach, describe, expect, test } from "bun:test";
import { isDocumentId, newDocumentId } from "@/lib/docs/ids";
import { registerDriveTokenGetter } from "@/lib/drive/api";
import { deleteDriveItemsForever, fetchDriveUrls, startDriveUpload } from "@/lib/drive/client";
import { DriveClientError } from "@/lib/drive/errors";
import { DRIVE_MAX_BATCH, DRIVE_MAX_FILE_BYTES, DRIVE_MULTIPART_THRESHOLD_BYTES } from "@/lib/drive/rules";
import { __resetDriveStorageStatusForTests } from "@/lib/drive/upload";
import { sharedDriveUrlLoader } from "@/lib/drive/url-loader";
import { clearConnection, setActiveOrgId, setConnection } from "@/lib/spacetimedb/client";

const ORG = "0b6a2c1e-7d4f-4a1b-9c2d-3e4f5a6b7c8d";
const g = globalThis as { window?: unknown };
const realFetch = globalThis.fetch;
let unregister: (() => void) | null = null;

afterEach(() => {
  clearConnection();
  globalThis.fetch = realFetch;
  delete g.window;
  unregister?.();
  unregister = null;
  __resetDriveStorageStatusForTests();
});

/**
 * GET /api/drive/status answers these in turn (the last one repeats). The Blob SDK fetches through undici, which a
 * stubbed globalThis.fetch never sees, so the upload route itself is served by Bun.serve where a test needs it.
 */
function stubStatus(answers: Array<{ configured: boolean; paused: boolean } | number>): () => number {
  let asked = 0;
  globalThis.fetch = (async (req: RequestInfo | URL, init?: RequestInit) => {
    if (!String(req).endsWith("/api/drive/status")) return realFetch(req, init);
    const answer = answers[Math.min(asked++, answers.length - 1)];
    if (typeof answer === "number") return new Response("down", { status: answer });
    return Response.json({ ...answer, maxFileBytes: DRIVE_MAX_FILE_BYTES, multipartThresholdBytes: DRIVE_MULTIPART_THRESHOLD_BYTES, thumbMaxBytes: 1 });
  }) as typeof fetch;
  return () => asked;
}

const READY = { configured: true, paused: false };

type Reducer = (args: Record<string, unknown>) => Promise<void>;

function connect(reducers: Record<string, Reducer>): void {
  setConnection({ reducers } as never);
  setActiveOrgId(ORG);
}

const input = (file: File, extra: Partial<Parameters<typeof startDriveUpload>[0]> = {}) => ({
  organizationId: ORG, file, name: file.name, space: "store" as const, parentId: "", actingMemberId: "", ...extra,
});

describe("startDriveUpload", () => {
  test("the item id is known synchronously; without a connection `done` rejects with not_connected", async () => {
    unregister = registerDriveTokenGetter(async () => "tok");
    stubStatus([READY]);
    const handle = startDriveUpload(input(new File(["hello"], "a.txt")), { onProgress: () => undefined });
    expect(isDocumentId(handle.itemId)).toBe(true);
    const err = await handle.done.catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("not_connected");
  });

  test("a file that cannot be uploaded has no item id and `done` says why", async () => {
    const handle = startDriveUpload(input(new File(["x"], "setup.exe")), { onProgress: () => undefined });
    expect(handle.itemId).toBe("");
    expect(((await handle.done.catch((e: unknown) => e)) as DriveClientError).code).toBe("blocked_type");
  });

  /** Serves the upload route, refusing every token request the way `refusal` says. */
  function serveUploadRoute(refusal: { status: number; code: string }) {
    const routes: string[] = [];
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req) {
        routes.push(new URL(req.url).pathname);
        return Response.json({ error: "Refused", code: refusal.code }, { status: refusal.status });
      },
    });
    g.window = { location: { href: `http://127.0.0.1:${server.port}/store` } };
    return { routes, stop: () => server.stop(true) };
  }

  test("without Blob storage, or paused, `done` rejects with not_configured and no pending row is reserved", async () => {
    const begun: Array<Record<string, unknown>> = [];
    connect({ beginDriveUpload: async (args) => void begun.push(args), abortDriveUpload: async () => undefined });
    unregister = registerDriveTokenGetter(async () => "tok");
    const asked = stubStatus([{ configured: false, paused: false }]);
    const route = serveUploadRoute({ status: 503, code: "not_configured" });
    try {
      const phases: Array<[number, number]> = [];
      const handle = startDriveUpload(input(new File(["hello"], "a.txt")), { onProgress: (loaded, total) => phases.push([loaded, total]) });
      const second = startDriveUpload(input(new File(["hi"], "b.txt")), { onProgress: () => undefined });
      for (const done of [handle.done, second.done]) expect(((await done.catch((e: unknown) => e)) as DriveClientError).code).toBe("not_configured");
      expect(asked()).toBe(1);
      expect(phases[0]).toEqual([0, 5]);

      __resetDriveStorageStatusForTests();
      stubStatus([{ configured: true, paused: true }]);
      const paused = startDriveUpload(input(new File(["hello"], "c.txt")), { onProgress: () => undefined });
      expect(((await paused.done.catch((e: unknown) => e)) as DriveClientError).code).toBe("not_configured");
      expect(begun).toEqual([]);
      expect(route.routes).toEqual([]);
    } finally {
      route.stop();
    }
  });

  test("begins the planned item as the operator even when the status can't be read; a refused token request releases the row", async () => {
    const begun: Array<Record<string, unknown>> = [];
    const aborted: Array<Record<string, unknown>> = [];
    connect({ beginDriveUpload: async (args) => void begun.push(args), abortDriveUpload: async (args) => void aborted.push(args) });
    unregister = registerDriveTokenGetter(async () => "tok");
    // An unreadable status blocks nothing and is not kept: read before begin and again after the refusal.
    const asked = stubStatus([500]);
    const route = serveUploadRoute({ status: 422, code: "invalid" });
    try {
      const operator = newDocumentId();
      const handle = startDriveUpload(input(new File(["hello"], "Shelf photo.txt"), { actingMemberId: operator, space: "my" }), {
        onProgress: () => undefined,
      });
      const err = await handle.done.catch((e: unknown) => e);
      expect((err as DriveClientError).code).toBe("upload_start_failed");
      expect(begun).toHaveLength(1);
      expect(begun[0]).toMatchObject({ organizationId: ORG, itemId: handle.itemId, space: "my", name: "Shelf photo.txt", actingMemberId: operator });
      expect(route.routes).toEqual(["/api/drive/upload"]);
      expect(asked()).toBe(2);
      // One-shot uploads have no retry: the row stops counting toward the uploader's caps at once.
      expect(aborted).toEqual([{ itemId: handle.itemId }]);
    } finally {
      route.stop();
    }
  });

  test("storage paused after the status read: the refused PUT reports not_configured and releases the row", async () => {
    const aborted: Array<Record<string, unknown>> = [];
    connect({ beginDriveUpload: async () => undefined, abortDriveUpload: async (args) => void aborted.push(args) });
    unregister = registerDriveTokenGetter(async () => "tok");
    const asked = stubStatus([READY, { configured: true, paused: true }]);
    const route = serveUploadRoute({ status: 503, code: "not_configured" });
    try {
      const handle = startDriveUpload(input(new File(["hello"], "a.txt")), { onProgress: () => undefined });
      const err = await handle.done.catch((e: unknown) => e);
      expect((err as DriveClientError).code).toBe("not_configured");
      expect(route.routes).toEqual(["/api/drive/upload"]);
      expect(asked()).toBe(2);
      expect(aborted).toEqual([{ itemId: handle.itemId }]);
    } finally {
      route.stop();
    }
  });

  test("abort() cancels: the pending row is released and `done` rejects with aborted", async () => {
    unregister = registerDriveTokenGetter(async () => "tok");
    stubStatus([READY]);
    let releaseBegin: () => void = () => undefined;
    const aborted: Array<Record<string, unknown>> = [];
    connect({
      beginDriveUpload: () => new Promise<void>((resolve) => {
        releaseBegin = resolve;
      }),
      abortDriveUpload: async (args) => void aborted.push(args),
    });
    const handle = startDriveUpload(input(new File(["hello"], "a.txt")), { onProgress: () => undefined });
    await new Promise((resolve) => setTimeout(resolve, 5));
    handle.abort();
    releaseBegin();
    const err = await handle.done.catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("aborted");
    expect(aborted).toEqual([{ itemId: handle.itemId }]);
  });
});

describe("fetchDriveUrls", () => {
  function stubUrlRoute(nullIds: ReadonlySet<string> = new Set()) {
    const bodies: Array<{ items: Array<{ id: string; variant: string; purpose: string }>; actingMemberId?: string }> = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as (typeof bodies)[number];
      bodies.push(body);
      return Response.json({
        results: body.items.map((it) => ({
          id: it.id,
          url: nullIds.has(it.id) ? null : `https://blob.test/${it.id}/${it.purpose}`,
          expiresAt: nullIds.has(it.id) ? null : Date.now() + 600_000,
        })),
      });
    }) as typeof fetch;
    return bodies;
  }

  test("any number of ids, chunked ≤ 50 per request; ids without a URL are left out", async () => {
    unregister = registerDriveTokenGetter(async () => "tok");
    const ids = Array.from({ length: 120 }, () => newDocumentId());
    const bodies = stubUrlRoute(new Set([ids[3]]));
    const urls = await fetchDriveUrls([...ids, ids[0]]);
    expect(bodies.map((b) => b.items.length)).toEqual([50, 50, 20]);
    expect(bodies[0].items[0]).toEqual({ id: ids[0], variant: "original", purpose: "view" });
    expect(Object.keys(urls)).toHaveLength(119);
    expect(urls[ids[3]]).toBeUndefined();
    expect(urls[ids[119]].url).toBe(`https://blob.test/${ids[119]}/view`);
  });

  test("download URLs, narrowed to the acting member", async () => {
    unregister = registerDriveTokenGetter(async () => "tok");
    const bodies = stubUrlRoute();
    const id = newDocumentId();
    const operator = newDocumentId();
    const urls = await fetchDriveUrls([id.toUpperCase()], { download: true, actingMemberId: operator });
    expect(urls[id].url).toBe(`https://blob.test/${id}/download`);
    expect(bodies[0]).toEqual({ items: [{ id, variant: "original", purpose: "download" }], actingMemberId: operator });
  });
});

describe("deleteDriveItemsForever", () => {
  test("calls deleteDriveEntriesForever with the ids and the acting member, in batches the module accepts", async () => {
    const calls: Array<Record<string, unknown>> = [];
    connect({ deleteDriveEntriesForever: async (args) => void calls.push(args) });
    const ids = Array.from({ length: DRIVE_MAX_BATCH + 5 }, () => newDocumentId());
    await deleteDriveItemsForever(ids, "op-1");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ organizationId: ORG, itemIds: JSON.stringify(ids.slice(0, DRIVE_MAX_BATCH)), documentIds: "[]", actingMemberId: "op-1" });
    expect(JSON.parse(String(calls[1].itemIds))).toEqual(ids.slice(DRIVE_MAX_BATCH));
  });

  test("drops the items' cached URLs, even when the delete fails", async () => {
    unregister = registerDriveTokenGetter(async () => "tok");
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { items: Array<{ id: string }> };
      return Response.json({ results: body.items.map((it) => ({ id: it.id, url: `https://blob.test/${it.id}`, expiresAt: Date.now() + 600_000 })) });
    }) as typeof fetch;
    const id = newDocumentId();
    await fetchDriveUrls([id]);
    const req = { id, variant: "original" as const, purpose: "view" as const };
    expect(sharedDriveUrlLoader().peek(req)).not.toBeNull();
    connect({ deleteDriveEntriesForever: async () => Promise.reject(new Error("[drive.forbidden] Not yours")) });
    const err = await deleteDriveItemsForever([id], "").catch((e: unknown) => e);
    expect((err as Error).message).toContain("[drive.forbidden]");
    expect(sharedDriveUrlLoader().peek(req)).toBeNull();
  });
});
