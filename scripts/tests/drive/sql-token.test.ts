// lib/spacetimedb/sql.ts spacetimeSql: anonymous by default (existing callers
// unchanged), and a Bearer token when `opts.token` is given (the Drive routes
// run their reads as the caller, so RLS decides what they see).

import { afterEach, describe, expect, test } from "bun:test";
import { spacetimeSql } from "@/lib/spacetimedb/sql";

const realFetch = globalThis.fetch;
const EMPTY_RESULT = [{ schema: { elements: [] }, rows: [] }];

interface Captured { url: string; headers: Headers; body: string; method: string }

function stubFetch(status = 200, body: string = JSON.stringify(EMPTY_RESULT)): Captured[] {
  const seen: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ""),
      method: String(init?.method ?? "GET"),
    });
    return new Response(body, { status });
  }) as typeof fetch;
  return seen;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("spacetimeSql token", () => {
  test("no options → no Authorization header (existing callers)", async () => {
    const seen = stubFetch();
    await spacetimeSql("SELECT * FROM blog_post");
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.has("authorization")).toBe(false);
    expect(seen[0].headers.get("content-type")).toBe("text/plain");
    expect(seen[0].method).toBe("POST");
    expect(seen[0].body).toBe("SELECT * FROM blog_post");
    expect(seen[0].url.endsWith("/sql")).toBe(true);
  });

  test("a token is sent as a Bearer", async () => {
    const seen = stubFetch();
    await spacetimeSql("SELECT id FROM drive_item WHERE id = 'x'", { token: "caller-jwt" });
    expect(seen[0].headers.get("authorization")).toBe("Bearer caller-jwt");
  });

  test("null / empty token → anonymous", async () => {
    const seen = stubFetch();
    await spacetimeSql("SELECT 1", { token: null });
    await spacetimeSql("SELECT 1", { token: "" });
    await spacetimeSql("SELECT 1", {});
    expect(seen.map((c) => c.headers.has("authorization"))).toEqual([false, false, false]);
  });

  test("returns the parsed result sets", async () => {
    const payload = [{ schema: { elements: [{ name: { some: "id" }, algebraic_type: { String: [] } }] }, rows: [["a"]] }];
    stubFetch(200, JSON.stringify(payload));
    expect(await spacetimeSql("SELECT id FROM drive_item", { token: "t" })).toEqual(payload);
  });

  test("a failure keeps the message format the Drive routes parse", async () => {
    stubFetch(401, "Invalid token: InvalidToken");
    await expect(spacetimeSql("SELECT 1", { token: "bad" })).rejects.toThrow("SpacetimeDB SQL failed (401): Invalid token: InvalidToken");
  });
});
