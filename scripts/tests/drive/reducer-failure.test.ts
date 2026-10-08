// SpacetimeDB failures → Drive HTTP errors. The failures come from the REAL
// callReducer / spacetimeSql over a stubbed fetch, so the parsed message format
// is the one production throws (a reducer's SenderError arrives as HTTP 530
// with "[drive.<code>] text" as the body; an unknown reducer is 404).

import { afterEach, describe, expect, test } from "bun:test";
import { callReducer } from "@/lib/spacetimedb/server-rpc";
import { spacetimeSql } from "@/lib/spacetimedb/sql";
import { DRIVE_ERROR_I18N_KEYS, type DriveClientErrorCode } from "@/lib/drive/errors";
import {
  DriveHttpError, driveStatusFor, errorResponse, parseUpstreamFailure, reducerFailure, type DriveHttpCode,
} from "@/lib/drive/server/http";
import { makeDeps, postJson, readBody } from "./fake-deps";

const realFetch = globalThis.fetch;

function stubFetch(status: number, body: string): void {
  globalThis.fetch = (async () => new Response(body, { status })) as unknown as typeof fetch;
}

async function reducerFailureOf(status: number, body: string): Promise<DriveHttpError> {
  stubFetch(status, body);
  try {
    await callReducer({ token: "t", name: "authorize_drive_upload", args: [] });
  } catch (err) {
    return reducerFailure(err);
  }
  throw new Error("callReducer did not fail");
}

async function sqlFailureOf(status: number, body: string): Promise<DriveHttpError> {
  stubFetch(status, body);
  try {
    await spacetimeSql("SELECT id FROM drive_item", { token: "t" });
  } catch (err) {
    return reducerFailure(err);
  }
  throw new Error("spacetimeSql did not fail");
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("reducerFailure over the real callReducer", () => {
  const cases: Array<[number, string, DriveHttpCode, number]> = [
    [530, "[drive.forbidden] Only the person who started this upload can send it", "forbidden", 403],
    [530, "[drive.not_found] Upload not found", "not_found", 404],
    [530, "[drive.blocked_type] Programs and installers cannot be stored in Drive", "blocked_type", 415],
    [530, "[drive.expired] This upload has expired", "expired", 409],
    [530, "[drive.conflict] This upload has already finished", "conflict", 409],
    [530, "[drive.too_many_attempts] This upload failed too many times", "too_many_attempts", 429],
    [530, "[drive.too_many_pending] Wait", "too_many_pending", 429],
    [530, "[drive.quota_exceeded] Full", "quota_exceeded", 507],
    [530, "[drive.too_large] Big", "too_large", 413],
    [530, "[drive.invalid] That does not match the upload", "invalid", 422],
    [530, "[drive.operator] Enter your PIN again", "operator", 403],
    [530, "Not an active member of this organization", "forbidden", 403],
    [404, "No such procedure", "not_published", 503],
    [404, "`merchiva-x` not found", "not_published", 503],
    [401, "Invalid token: InvalidToken", "unauthenticated", 401],
    [403, "Forbidden", "unauthenticated", 401],
    [500, "internal error", "upstream", 502],
    [530, "[doc.forbidden] Not yours", "upstream", 502],
    [530, "[drive.some_future_code] New", "upstream", 502],
  ];
  for (const [status, body, code, http] of cases) {
    test(`${status} ${body.slice(0, 40)} → ${code} / ${http}`, async () => {
      const failure = await reducerFailureOf(status, body);
      expect(failure.code).toBe(code);
      expect(failure.status).toBe(http);
    });
  }

  test("the reducer's own text is kept as the message", async () => {
    const failure = await reducerFailureOf(530, "[drive.forbidden] Only the person who started this upload can send it");
    expect(failure.message).toBe("[drive.forbidden] Only the person who started this upload can send it");
  });

  test("a network failure (fetch TypeError) is upstream", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    let failure: DriveHttpError | null = null;
    try {
      await callReducer({ token: "t", name: "x", args: [] });
    } catch (err) {
      failure = reducerFailure(err);
    }
    expect(failure?.code).toBe("upstream");
    expect(failure?.status).toBe(502);
  });

  test("a DriveHttpError passes through", () => {
    const original = new DriveHttpError("operator", 403, "x");
    expect(reducerFailure(original)).toBe(original);
  });
});

describe("reducerFailure over the real spacetimeSql", () => {
  test("401 → unauthenticated", async () => {
    expect((await sqlFailureOf(401, "Invalid token: InvalidToken")).code).toBe("unauthenticated");
  });
  test("an older module without the table → not_published", async () => {
    const failure = await sqlFailureOf(400, "no such table: `drive_item`. If the table exists, it may be marked private.");
    expect(failure.code).toBe("not_published");
    expect(failure.status).toBe(503);
  });
  test("other SQL errors → upstream", async () => {
    expect((await sqlFailureOf(400, "syntax error")).code).toBe("upstream");
  });
});

describe("parseUpstreamFailure", () => {
  test("reads status and body from both helpers' messages", () => {
    expect(parseUpstreamFailure(new Error("SpacetimeDB reducer service_drive_sweep failed (530): [drive.forbidden] x")))
      .toEqual({ status: 530, body: "[drive.forbidden] x" });
    expect(parseUpstreamFailure(new Error("SpacetimeDB SQL failed (400): bad\nline")))
      .toEqual({ status: 400, body: "bad\nline" });
    expect(parseUpstreamFailure(new Error("something else"))).toEqual({ status: null, body: "something else" });
    expect(parseUpstreamFailure(42)).toEqual({ status: null, body: "" });
  });
});

describe("driveStatusFor (CONTRACTS §2.6)", () => {
  test("every server and client code has a status", () => {
    const expected: Record<string, number> = {
      not_found: 404, forbidden: 403, operator: 403, subtree_forbidden: 403, device_scope: 403,
      invalid: 422, invalid_name: 422, cycle: 422, too_deep: 422, space_mismatch: 422, batch_too_large: 422,
      trashed: 409, expired: 409, conflict: 409, not_uploaded: 409, too_large: 413, blocked_type: 415,
      too_many_pending: 429, too_many_attempts: 429, too_many_items: 429, quota_exceeded: 507,
      not_configured: 503, not_published: 503, unauthenticated: 401, orphan_brake: 502, unknown: 502,
    };
    for (const [code, status] of Object.entries(expected)) expect(driveStatusFor(code as DriveHttpCode)).toBe(status);
    expect(driveStatusFor("upstream")).toBe(502);
    for (const code of Object.keys(DRIVE_ERROR_I18N_KEYS) as DriveClientErrorCode[]) {
      expect(driveStatusFor(code)).toBeGreaterThanOrEqual(400);
    }
  });
});

describe("errorResponse", () => {
  const req = postJson("/api/drive/url", {});

  test("a DriveHttpError keeps its status and code", async () => {
    const { deps, logs } = makeDeps();
    const res = errorResponse(deps, req, new DriveHttpError("operator", 403, "Enter your PIN again"));
    expect(res.status).toBe(403);
    expect(await readBody(res)).toEqual({ error: "Enter your PIN again", code: "operator" });
    expect(logs).toEqual([{ level: "warn", event: "drive.route_error", fields: { route: "/api/drive/url", code: "operator" } }]);
  });

  test("a refused callback signature is 401", async () => {
    const { deps } = makeDeps();
    const res = errorResponse(deps, req, new Error("Vercel Blob: Invalid callback signature"));
    expect(res.status).toBe(401);
    expect((await readBody(res)).code).toBe("unauthenticated");
  });

  test("anything else is 502 upstream, logged without its text", async () => {
    const { deps, logs } = makeDeps();
    const res = errorResponse(deps, req, new Error("SpacetimeDB SQL failed (500): secret-ish detail"));
    expect(res.status).toBe(502);
    expect(await readBody(res)).toEqual({ error: "The storage service failed", code: "upstream" });
    expect(logs[0].fields).toEqual({ route: "/api/drive/url", code: "upstream", upstreamStatus: 500 });
  });
});
