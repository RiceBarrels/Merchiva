// The CLI's /api/store-ai calls must survive the ~5 minute WorkOS access token: every request
// asks the token source again (refreshing a near-expiry login), and a 401 gets one renewal and
// one retry. A fake /api/store-ai stands in for the app.

import { afterAll, describe, expect, test } from "bun:test";
import { ping, sendWithToken, streamChat, type TokenSource } from "@/cli/lib/api";
import { renewToken } from "@/cli/lib/auth";
import type { CliConfig } from "@/cli/lib/config";

interface Seen {
  token: unknown;
  organizationId: unknown;
}

const seen: Seen[] = [];
let validToken = "t1";

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const body = (await req.json()) as Record<string, unknown>;
    seen.push({ token: body.token, organizationId: body.organizationId });
    if (body.token !== validToken) {
      return Response.json({ error: "Invalid or expired token" }, { status: 401 });
    }
    return new Response(`Reply to ${String(body.message)}`, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
});
afterAll(() => server.stop(true));

const config: CliConfig = { baseUrl: `http://localhost:${server.port}`, lang: "en", orgId: "org-1", token: "stale" };

/** A login whose current token is whatever `state.current` holds; renewing hands out `state.next`. */
function fakeLogin(state: { current: string; next?: string }) {
  const calls = { current: 0, renew: 0 };
  const tokens: TokenSource = {
    current: async () => {
      calls.current++;
      return state.current;
    },
    renew: async () => {
      calls.renew++;
      if (!state.next) return undefined;
      state.current = state.next;
      return state.next;
    },
  };
  return { tokens, calls };
}

describe("sendWithToken", () => {
  test("a good token is sent once and never renewed", async () => {
    const { tokens, calls } = fakeLogin({ current: "a", next: "b" });
    const sent: Array<string | undefined> = [];
    const res = await sendWithToken(async (token) => {
      sent.push(token);
      return new Response("ok");
    }, tokens);
    expect(res.status).toBe(200);
    expect(sent).toEqual(["a"]);
    expect(calls).toEqual({ current: 1, renew: 0 });
  });

  test("a 401 renews the token and retries once with it", async () => {
    const { tokens, calls } = fakeLogin({ current: "old", next: "new" });
    const sent: Array<string | undefined> = [];
    const res = await sendWithToken(async (token) => {
      sent.push(token);
      return new Response(token === "new" ? "ok" : "no", { status: token === "new" ? 200 : 401 });
    }, tokens);
    expect(res.status).toBe(200);
    expect(sent).toEqual(["old", "new"]);
    expect(calls).toEqual({ current: 1, renew: 1 });
  });

  test("a 401 that can't be renewed is returned as is", async () => {
    const { tokens } = fakeLogin({ current: "old" });
    let sends = 0;
    const res = await sendWithToken(async () => {
      sends++;
      return new Response("no", { status: 401 });
    }, tokens);
    expect(res.status).toBe(401);
    expect(sends).toBe(1);
  });
});

describe("streamChat and ping against /api/store-ai", () => {
  test("each turn reads the token again, so a login refreshed mid-session keeps working", async () => {
    seen.length = 0;
    validToken = "t1";
    const state = { current: "t1" };
    const { tokens, calls } = fakeLogin(state);

    const first = await streamChat({ config, message: "one", tokens });
    expect(first.text).toBe("Reply to one");

    // Five minutes later: the old token is dead and the saved login holds a refreshed one.
    validToken = "t2";
    state.current = "t2";
    const second = await streamChat({ config, message: "two", tokens });
    expect(second.text).toBe("Reply to two");

    expect(calls.current).toBe(2);
    expect(seen).toEqual([
      { token: "t1", organizationId: "org-1" },
      { token: "t2", organizationId: "org-1" },
    ]);
    // The config's own token is never what goes out.
    expect(seen.some((s) => s.token === "stale")).toBe(false);
  });

  test("a token the server rejects is renewed and the turn still answers", async () => {
    seen.length = 0;
    validToken = "t3";
    const { tokens, calls } = fakeLogin({ current: "t2", next: "t3" });
    const result = await streamChat({ config, message: "three", tokens, organizationId: "org-2" });
    expect(result.text).toBe("Reply to three");
    expect(calls).toEqual({ current: 1, renew: 1 });
    expect(seen.map((s) => s.token)).toEqual(["t2", "t3"]);
    expect(seen.every((s) => s.organizationId === "org-2")).toBe(true);
  });

  test("an unrenewable 401 surfaces with the sign-in hint", async () => {
    validToken = "t4";
    const { tokens } = fakeLogin({ current: "t3" });
    await expect(streamChat({ config, message: "four", tokens })).rejects.toThrow(/401[\s\S]*merchiva login/);
  });

  test("doctor's ping refreshes the same way", async () => {
    seen.length = 0;
    validToken = "t5";
    const { tokens } = fakeLogin({ current: "t4", next: "t5" });
    expect(await ping(config, tokens)).toEqual({ ok: true, status: 200 });
    expect(seen.map((s) => s.token)).toEqual(["t4", "t5"]);
  });
});

test("a MERCHIVA_TOKEN override is never renewed", async () => {
  const previous = process.env.MERCHIVA_TOKEN;
  process.env.MERCHIVA_TOKEN = "env-token";
  try {
    expect(await renewToken()).toBeUndefined();
  } finally {
    if (previous === undefined) delete process.env.MERCHIVA_TOKEN;
    else process.env.MERCHIVA_TOKEN = previous;
  }
});
