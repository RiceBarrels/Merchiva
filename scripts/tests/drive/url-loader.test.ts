// lib/drive/url-loader.ts: same-tick batching, chunks of DRIVE_URL_BATCH_MAX,
// caching until the refresh margin, invalidation, error propagation, and one
// shared loader per acting member. Also the real postDriveUrls request shape
// (through a stubbed fetch) and the token bridge it reads.

import { afterEach, describe, expect, test } from "bun:test";
import { newDocumentId } from "@/lib/docs/ids";
import {
  postDriveUrls, registerDriveTokenGetter, type DriveSignedUrl, type DriveUrlRequest,
} from "@/lib/drive/api";
import { DriveClientError } from "@/lib/drive/errors";
import { DRIVE_URL_BATCH_MAX } from "@/lib/drive/rules";
import { createDriveUrlLoader, DRIVE_URL_REFRESH_MARGIN_MS, sharedDriveUrlLoader } from "@/lib/drive/url-loader";

type FetchUrls = typeof postDriveUrls;
interface Call { reqs: DriveUrlRequest[]; acting: string | null | undefined }

function recordingFetch(opts: { expiresAt?: number; nullFor?: ReadonlySet<string>; fail?: Error } = {}) {
  const calls: Call[] = [];
  const fetchUrls: FetchUrls = async (reqs, acting) => {
    calls.push({ reqs: [...reqs], acting });
    if (opts.fail) throw opts.fail;
    return reqs.map((req): DriveSignedUrl | null =>
      opts.nullFor?.has(req.id) ? null : { url: `https://blob.test/${req.id}/${req.variant}/${req.purpose}?n=${calls.length}`, expiresAt: opts.expiresAt ?? 1_000_000 });
  };
  return { calls, fetchUrls };
}

const view = (id: string): DriveUrlRequest => ({ id, variant: "original", purpose: "view" });

describe("createDriveUrlLoader", () => {
  test("calls made in the same tick go out as one request, in call order", async () => {
    const { calls, fetchUrls } = recordingFetch();
    const loader = createDriveUrlLoader({ fetchUrls, now: () => 0 });
    const ids = [newDocumentId(), newDocumentId(), newDocumentId()];
    const results = await Promise.all(ids.map((id) => loader.get(view(id))));
    expect(calls).toHaveLength(1);
    expect(calls[0].reqs.map((r) => r.id)).toEqual(ids);
    expect(results.map((r) => r?.url.split("/")[3])).toEqual(ids);
    expect(calls[0].acting).toBeNull();
  });

  test("a 120-id getMany is sent as 3 requests of at most 50", async () => {
    const { calls, fetchUrls } = recordingFetch();
    const loader = createDriveUrlLoader({ fetchUrls, now: () => 0 });
    const ids = Array.from({ length: 120 }, () => newDocumentId());
    const results = await loader.getMany(ids.map(view));
    expect(calls.map((c) => c.reqs.length)).toEqual([50, 50, 20]);
    expect(calls.every((c) => c.reqs.length <= DRIVE_URL_BATCH_MAX)).toBe(true);
    expect(results).toHaveLength(120);
    expect(results.every((r) => r !== null)).toBe(true);
    expect(results[119]?.url).toContain(ids[119]);
  });

  test("duplicate requests share one slot; variant and purpose are separate entries", async () => {
    const { calls, fetchUrls } = recordingFetch();
    const loader = createDriveUrlLoader({ fetchUrls, now: () => 0 });
    const id = newDocumentId();
    const [a, b, thumb, dl] = await Promise.all([
      loader.get(view(id)),
      loader.get({ id: id.toUpperCase(), variant: "original", purpose: "view" }),
      loader.get({ id, variant: "thumb", purpose: "view" }),
      loader.get({ id, variant: "original", purpose: "download" }),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].reqs).toEqual([view(id), { id, variant: "thumb", purpose: "view" }, { id, variant: "original", purpose: "download" }]);
    expect(a).toEqual(b);
    expect(thumb?.url).toContain("/thumb/view");
    expect(dl?.url).toContain("/original/download");
  });

  test("a signed URL is cached until expiresAt minus the margin, then fetched again", async () => {
    let clock = 0;
    const { calls, fetchUrls } = recordingFetch({ expiresAt: 15 * 60_000 });
    const loader = createDriveUrlLoader({ fetchUrls, now: () => clock });
    const id = newDocumentId();
    const first = await loader.get(view(id));
    expect(loader.peek(view(id))).toEqual(first);
    clock = 15 * 60_000 - DRIVE_URL_REFRESH_MARGIN_MS - 1;
    expect(await loader.get(view(id))).toEqual(first);
    expect(calls).toHaveLength(1);
    clock = 15 * 60_000 - DRIVE_URL_REFRESH_MARGIN_MS;
    expect(loader.peek(view(id))).toBeNull();
    const second = await loader.get(view(id));
    expect(calls).toHaveLength(2);
    expect(second?.url).not.toBe(first?.url);
  });

  test("a custom refresh margin is honoured", async () => {
    let clock = 0;
    const { fetchUrls } = recordingFetch({ expiresAt: 10_000 });
    const loader = createDriveUrlLoader({ fetchUrls, now: () => clock, refreshMarginMs: 1_000 });
    const id = newDocumentId();
    await loader.get(view(id));
    clock = 8_999;
    expect(loader.peek(view(id))).not.toBeNull();
    clock = 9_000;
    expect(loader.peek(view(id))).toBeNull();
  });

  test("null answers are not cached", async () => {
    const id = newDocumentId();
    const { calls, fetchUrls } = recordingFetch({ nullFor: new Set([id]) });
    const loader = createDriveUrlLoader({ fetchUrls, now: () => 0 });
    expect(await loader.get(view(id))).toBeNull();
    expect(await loader.get(view(id))).toBeNull();
    expect(calls).toHaveLength(2);
    expect(loader.peek(view(id))).toBeNull();
  });

  test("invalidate drops every variant of the item and skips caching a request already in flight", async () => {
    const { calls, fetchUrls } = recordingFetch();
    const loader = createDriveUrlLoader({ fetchUrls, now: () => 0 });
    const id = newDocumentId();
    const other = newDocumentId();
    await Promise.all([loader.get(view(id)), loader.get({ id, variant: "thumb", purpose: "view" }), loader.get(view(other))]);
    loader.invalidate(id.toUpperCase());
    expect(loader.peek(view(id))).toBeNull();
    expect(loader.peek({ id, variant: "thumb", purpose: "view" })).toBeNull();
    expect(loader.peek(view(other))).not.toBeNull();

    const inFlight = loader.get(view(id));
    loader.invalidate(id);
    expect(await inFlight).not.toBeNull();
    expect(loader.peek(view(id))).toBeNull();
    expect(calls).toHaveLength(2);
  });

  test("a failed request rejects every caller in its batch and is not cached", async () => {
    const failure = new DriveClientError("forbidden");
    const { calls, fetchUrls } = recordingFetch({ fail: failure });
    const loader = createDriveUrlLoader({ fetchUrls, now: () => 0 });
    const ids = [newDocumentId(), newDocumentId()];
    const settled = await Promise.allSettled(ids.map((id) => loader.get(view(id))));
    expect(settled.map((s) => s.status)).toEqual(["rejected", "rejected"]);
    expect((settled[0] as PromiseRejectedResult).reason).toBe(failure);
    await loader.get(view(ids[0])).catch(() => undefined);
    expect(calls).toHaveLength(2);
  });

  test("malformed ids resolve null without a request (the route would refuse the whole batch)", async () => {
    const { calls, fetchUrls } = recordingFetch();
    const loader = createDriveUrlLoader({ fetchUrls, now: () => 0 });
    expect(await loader.get(view("not-a-uuid"))).toBeNull();
    expect(await loader.get({ id: newDocumentId(), variant: "big" as never, purpose: "view" })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test("the acting member is sent with every batch", async () => {
    const { calls, fetchUrls } = recordingFetch();
    const operator = newDocumentId();
    const loader = createDriveUrlLoader({ fetchUrls, now: () => 0, actingMemberId: ` ${operator.toUpperCase()} ` });
    await loader.get(view(newDocumentId()));
    expect(calls[0].acting).toBe(operator);
  });

  test("batchWindowMs collects calls made a little apart", async () => {
    const { calls, fetchUrls } = recordingFetch();
    const loader = createDriveUrlLoader({ fetchUrls, now: () => 0, batchWindowMs: 30 });
    const a = loader.get(view(newDocumentId()));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const b = loader.get(view(newDocumentId()));
    await Promise.all([a, b]);
    expect(calls).toHaveLength(1);
    expect(calls[0].reqs).toHaveLength(2);
  });
});

describe("sharedDriveUrlLoader", () => {
  test("one loader per acting member ('' and null are the caller's own)", () => {
    const operator = newDocumentId();
    expect(sharedDriveUrlLoader()).toBe(sharedDriveUrlLoader(null));
    expect(sharedDriveUrlLoader("")).toBe(sharedDriveUrlLoader());
    expect(sharedDriveUrlLoader(operator)).toBe(sharedDriveUrlLoader(operator.toUpperCase()));
    expect(sharedDriveUrlLoader(operator)).not.toBe(sharedDriveUrlLoader());
  });
});

describe("postDriveUrls", () => {
  const realFetch = globalThis.fetch;
  let unregister: (() => void) | null = null;
  afterEach(() => {
    globalThis.fetch = realFetch;
    unregister?.();
    unregister = null;
  });

  function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push({ url, init: init ?? {} });
      return handler(url, init ?? {});
    }) as typeof fetch;
    return seen;
  }

  test("posts lowercase ids and the acting member with a Bearer token; maps results in order", async () => {
    unregister = registerDriveTokenGetter(async () => "tok-1");
    const a = newDocumentId();
    const b = newDocumentId();
    const seen = stubFetch((_url, init) => {
      const body = JSON.parse(String(init.body)) as { items: Array<{ id: string }> };
      return Response.json({
        results: [
          { id: body.items[0].id, url: "https://blob.test/a", expiresAt: 123 },
          { id: body.items[1].id, url: null, expiresAt: null },
        ],
      });
    });
    const results = await postDriveUrls([view(a.toUpperCase()), { id: b, variant: "thumb", purpose: "download" }], "OPERATOR-1");
    expect(results).toEqual([{ url: "https://blob.test/a", expiresAt: 123 }, null]);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toEndWith("/api/drive/url");
    expect(seen[0].init.method).toBe("POST");
    expect((seen[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(JSON.parse(String(seen[0].init.body))).toEqual({
      items: [view(a), { id: b, variant: "thumb", purpose: "download" }],
      actingMemberId: "operator-1",
    });
  });

  test("omits actingMemberId when there is none; never trusts a non-http URL", async () => {
    unregister = registerDriveTokenGetter(async () => "tok-1");
    const a = newDocumentId();
    const seen = stubFetch(() => Response.json({ results: [{ id: a, url: "javascript:alert(1)", expiresAt: 1 }] }));
    expect(await postDriveUrls([view(a)])).toEqual([null]);
    expect(JSON.parse(String(seen[0].init.body))).toEqual({ items: [view(a)] });
  });

  test("retries once after a 401 with the token read again, then reports the route's code", async () => {
    const tokens = ["old", "new", "newer"];
    unregister = registerDriveTokenGetter(async () => tokens.shift() ?? null);
    const seen = stubFetch(() => Response.json({ error: "Sign in", code: "unauthenticated" }, { status: 401 }));
    const err = await postDriveUrls([view(newDocumentId())]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DriveClientError);
    expect((err as DriveClientError).code).toBe("unauthenticated");
    expect(seen.map((s) => (s.init.headers as Record<string, string>).Authorization)).toEqual(["Bearer old", "Bearer new"]);
  });

  test("a known error code becomes a DriveClientError; upstream stays a plain Error", async () => {
    unregister = registerDriveTokenGetter(async () => "tok");
    stubFetch(() => Response.json({ error: "Enter your PIN again", code: "operator" }, { status: 403 }));
    const operator = await postDriveUrls([view(newDocumentId())], "x").catch((e: unknown) => e);
    expect((operator as DriveClientError).code).toBe("operator");
    stubFetch(() => Response.json({ error: "boom", code: "upstream" }, { status: 502 }));
    const upstream = await postDriveUrls([view(newDocumentId())]).catch((e: unknown) => e);
    expect(upstream).toBeInstanceOf(Error);
    expect(upstream).not.toBeInstanceOf(DriveClientError);
  });

  test("no token → unauthenticated without a request; unreachable API → network; > 50 → batch_too_large", async () => {
    unregister = registerDriveTokenGetter(async () => null);
    const seen = stubFetch(() => Response.json({ results: [] }));
    expect(((await postDriveUrls([view(newDocumentId())]).catch((e: unknown) => e)) as DriveClientError).code).toBe("unauthenticated");
    expect(seen).toHaveLength(0);

    unregister();
    unregister = registerDriveTokenGetter(async () => "tok");
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(((await postDriveUrls([view(newDocumentId())]).catch((e: unknown) => e)) as DriveClientError).code).toBe("network");

    const tooMany = Array.from({ length: DRIVE_URL_BATCH_MAX + 1 }, () => view(newDocumentId()));
    expect(((await postDriveUrls(tooMany).catch((e: unknown) => e)) as DriveClientError).code).toBe("batch_too_large");
    expect(await postDriveUrls([])).toEqual([]);
  });
});
