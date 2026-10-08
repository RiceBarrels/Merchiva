// In-memory DriveServerDeps for the Drive route handler tests: a fixed clock,
// token → user map, scripted reducer calls and SQL, a fake Blob store, and the
// REAL @vercel/blob handleUploadPresigned (it runs offline: presigning is a
// local HMAC over our synthetic delegation). Every effect is recorded.

import { handleUploadPresigned } from "@vercel/blob/client";
import type { IssuedSignedToken } from "@vercel/blob";
import type {
  DriveHeadResult, DriveListPage, DriveLogLevel, DriveServerDeps, DriveStorageConfig,
} from "@/lib/drive/server/handlers/types";
import type { SqlRow } from "@/lib/drive/server/sql-rows";
import type { DriveStdbCallKey } from "@/lib/drive/server/stdb-calls";

/** Close to the real clock: the Blob SDK checks delegation expiry against Date.now(). */
export const NOW = Math.floor(Date.now() / 1000) * 1000;
export const ORG = "0b9d6a3e-1c2f-4a4b-8c5d-6e7f8a9b0c1d";
export const OTHER_ORG = "5e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b";
export const USER_TOKEN = "user-jwt";
export const USER_ID = "user_01";
export const STORE_ID = "teststore";

export interface RecordedCall { key: DriveStdbCallKey; args: Record<string, unknown>; userToken?: string }
export interface RecordedSql { query: string; token: string | null }
export interface RecordedLog { level: DriveLogLevel; event: string; fields: Record<string, string | number | boolean> }

export interface FakeOptions {
  config?: DriveStorageConfig | null;
  users?: Record<string, string>;
  /** Throw to fail the call (use reducerError for the real message format). */
  onCall?: (key: DriveStdbCallKey, args: Record<string, unknown>, userToken?: string) => void | Promise<void>;
  onSql?: (query: string, token: string | null) => SqlRow[] | Promise<SqlRow[]>;
  blobs?: Record<string, DriveHeadResult>;
  onHead?: (pathname: string) => void;
}

export interface FakeDeps {
  deps: DriveServerDeps;
  calls: RecordedCall[];
  sqls: RecordedSql[];
  heads: string[];
  putTokens: Array<{ pathname: string; opts: { maximumSizeInBytes: number; allowedContentTypes: string[]; validUntil: number } }>;
  presigns: Array<{ pathname: string; opts: { validUntil: number; download: boolean } }>;
  logs: RecordedLog[];
}

export function testConfig(overrides: Partial<DriveStorageConfig> = {}): DriveStorageConfig {
  return {
    blobAuth: { token: "vercel_blob_rw_teststore_secret" },
    webhookPublicKey: "unused",
    serviceToken: "service-token",
    database: "drive-staging",
    callbacksEnabled: false,
    uploadsPaused: false,
    reconcileLive: false,
    platformAlertBytes: null,
    cronSecret: null,
    ...overrides,
  };
}

/** The exact message lib/spacetimedb/server-rpc.ts callReducer throws. */
export function reducerError(name: string, status: number, body: string): Error {
  return new Error(`SpacetimeDB reducer ${name} failed (${status}): ${body}`);
}

/** The exact message lib/spacetimedb/sql.ts spacetimeSql throws. */
export function sqlError(status: number, body: string): Error {
  return new Error(`SpacetimeDB SQL failed (${status}): ${body}`);
}

function base64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A delegation shaped like the Blob API's (payload segment + signature); presign() only decodes the payload. */
export function syntheticDelegation(scope: Record<string, unknown>): IssuedSignedToken {
  const validUntil = typeof scope.validUntil === "number" ? scope.validUntil : NOW + 3_600_000;
  return {
    delegationToken: `${base64Url(JSON.stringify({ storeId: STORE_ID, ...scope, validUntil }))}.test-signature`,
    clientSigningToken: "test-client-signing-token",
    validUntil,
  };
}

export function makeDeps(options: FakeOptions = {}): FakeDeps {
  const calls: RecordedCall[] = [];
  const sqls: RecordedSql[] = [];
  const heads: string[] = [];
  const putTokens: FakeDeps["putTokens"] = [];
  const presigns: FakeDeps["presigns"] = [];
  const logs: RecordedLog[] = [];
  const users = options.users ?? { [USER_TOKEN]: USER_ID };
  const blobs = new Map(Object.entries(options.blobs ?? {}));
  const config = options.config === undefined ? testConfig() : options.config;

  const deps: DriveServerDeps = {
    now: () => NOW,
    config: () => config,
    async verifyUser(header) {
      const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
      return users[token] ?? null;
    },
    async call(key, args, userToken) {
      const named = { ...(args as Record<string, unknown>) };
      calls.push(userToken === undefined ? { key, args: named } : { key, args: named, userToken });
      await options.onCall?.(key, named, userToken);
    },
    async sql(query, token) {
      sqls.push({ query, token });
      return options.onSql ? options.onSql(query, token) : [];
    },
    blob: {
      async issuePutToken(pathname, opts) {
        putTokens.push({ pathname, opts });
        return syntheticDelegation({ pathname, operations: ["put"], ...opts });
      },
      async presignGet(pathname, opts) {
        presigns.push({ pathname, opts });
        const url = new URL(`https://${STORE_ID}.private.blob.vercel-storage.com/${pathname}`);
        url.searchParams.set("vercel-blob-signature", "sig");
        if (opts.download) url.searchParams.set("download", "1");
        return url.toString();
      },
      async head(pathname) {
        heads.push(pathname);
        options.onHead?.(pathname);
        return blobs.get(pathname) ?? null;
      },
      async del() {},
      async list(): Promise<DriveListPage> {
        return { blobs: [], folders: [], hasMore: false };
      },
    },
    handleUploadPresigned,
    json(_req, body, init) {
      return new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      });
    },
    log(level, event, fields) {
      logs.push({ level, event, fields });
    },
  };
  return { deps, calls, sqls, heads, putTokens, presigns, logs };
}

/** A POST with a JSON body (a string body is sent verbatim) and optional bearer token. */
export function postJson(path: string, body: unknown, opts: { token?: string | null; headers?: Record<string, string> } = {}): Request {
  const token = opts.token === undefined ? USER_TOKEN : opts.token;
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export async function readBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}
