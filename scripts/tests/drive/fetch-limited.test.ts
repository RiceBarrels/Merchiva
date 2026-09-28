// lib/drive/download.ts fetchLimited: a file kept by another app, read with a
// byte budget. Only http(s) and a real limit; the bytes come back as one array;
// a larger declared length or body is too_large and stops reading; transfer
// failures map to download_failed / aborted.

import { afterEach, describe, expect, test } from "bun:test";
import type { DriveClientError } from "@/lib/drive/errors";
import { fetchLimited } from "@/lib/drive/download";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fetchLimited", () => {
  test("only http(s) addresses and a limit ≥ 0; nothing is fetched otherwise", async () => {
    let fetches = 0;
    globalThis.fetch = (async () => {
      fetches++;
      return new Response("x");
    }) as unknown as typeof fetch;
    const bad = await fetchLimited("data:text/plain,hi", 10).catch((e: unknown) => e);
    expect((bad as DriveClientError).code).toBe("invalid");
    const noLimit = await fetchLimited("https://files.test/a.txt", Number.NaN).catch((e: unknown) => e);
    expect((noLimit as DriveClientError).code).toBe("invalid");
    const negative = await fetchLimited("https://files.test/a.txt", -1).catch((e: unknown) => e);
    expect((negative as DriveClientError).code).toBe("invalid");
    expect(fetches).toBe(0);
  });

  test("returns the bytes, fetched without credentials and with the caller's signal", async () => {
    const inits: (RequestInit | undefined)[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      inits.push(init);
      return new Response(new Uint8Array([1, 2, 3, 4, 5]));
    }) as typeof fetch;
    const controller = new AbortController();
    const bytes = await fetchLimited("https://files.test/a.bin", 5, controller.signal);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes]).toEqual([1, 2, 3, 4, 5]);
    expect(bytes.buffer.byteLength).toBe(5);
    expect(inits[0]).toMatchObject({ credentials: "omit", signal: controller.signal });
  });

  test("a larger declared length is too_large before any byte is read, and the body is cancelled", async () => {
    let pulled = 0;
    let cancelled = false;
    globalThis.fetch = (async () => new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled++;
          controller.enqueue(new Uint8Array(400));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "content-length": "5000" } },
    )) as unknown as typeof fetch;
    const err = await fetchLimited("https://files.test/big.bin", 1_000).catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("too_large");
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThanOrEqual(1);
  });

  test("stops reading once the body passes the limit", async () => {
    let pulled = 0;
    globalThis.fetch = (async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(400));
        if (pulled > 50) controller.close();
      },
    }))) as unknown as typeof fetch;
    const err = await fetchLimited("https://files.test/stream.bin", 1_000).catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("too_large");
    expect(pulled).toBeLessThan(10);
  });

  test("an HTTP error is download_failed with its status; a refused fetch is download_failed; an abort is aborted", async () => {
    globalThis.fetch = (async () => new Response("gone", { status: 404 })) as unknown as typeof fetch;
    const http = await fetchLimited("https://files.test/gone.bin", 1_000).catch((e: unknown) => e);
    expect((http as DriveClientError).code).toBe("download_failed");
    expect((http as DriveClientError).message).toContain("HTTP 404");

    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const refused = await fetchLimited("https://files.test/cors.bin", 1_000).catch((e: unknown) => e);
    expect((refused as DriveClientError).code).toBe("download_failed");

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      return new Response("x");
    }) as typeof fetch;
    const controller = new AbortController();
    controller.abort();
    const aborted = await fetchLimited("https://files.test/a.bin", 1_000, controller.signal).catch((e: unknown) => e);
    expect((aborted as DriveClientError).code).toBe("aborted");
  });
});
