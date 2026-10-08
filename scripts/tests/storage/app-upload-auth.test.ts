// The UploadThing middleware and completion logic (lib/storage/server/app-upload-auth.ts)
// with injected WorkOS / SpacetimeDB effects.

import { describe, expect, test } from "bun:test";
import { UploadThingError } from "uploadthing/server";
import type { DriveStdbArgs, DriveStdbCallKey } from "@/lib/drive/server/stdb-calls";
import {
  appUploadInputParser, authorizeAppUpload, authorizePlatformUpload, parseAppUploadInput, recordAppUpload,
  type AppUploadServerDeps,
} from "@/lib/storage/server/app-upload-auth";
import { sha256Hex } from "@/lib/storage/sha256";

const ORG = "0b7e2c4a-1f2d-4c3b-9a8e-112233445566";
const TOKEN = "jwt.token.sig";

interface Call { key: DriveStdbCallKey; args: unknown; token?: string }

function harness(opts: { user?: string | null; fail?: string; failTimes?: number; configured?: boolean } = {}) {
  const calls: Call[] = [];
  const logs: Array<{ level: string; event: string; fields: Record<string, unknown> }> = [];
  const deps: AppUploadServerDeps = {
    verifyUser: async (header) => (header === `Bearer ${TOKEN}` ? (opts.user === undefined ? "user_1" : opts.user) : null),
    async call<K extends DriveStdbCallKey>(key: K, args: DriveStdbArgs[K], token?: string) {
      calls.push({ key, args, token });
      if (opts.fail && (opts.failTimes === undefined || calls.length <= opts.failTimes)) throw new Error(opts.fail);
    },
    log: (level, event, fields) => logs.push({ level, event, fields }),
    recordingConfigured: () => opts.configured ?? true,
    sleep: async () => {},
  };
  return { deps, calls, logs };
}

async function refusal(promise: Promise<unknown>): Promise<UploadThingError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(UploadThingError);
    return err as UploadThingError;
  }
  throw new Error("expected a refusal");
}

const input = { organizationId: ORG, source: "chat" as const };
const files = [{ size: 1000 }, { size: 24 }];

describe("parseAppUploadInput", () => {
  test("accepts a store id and a known source; trims and lowercases the id", () => {
    expect(parseAppUploadInput({ organizationId: ` ${ORG.toUpperCase()} `, source: "tasks" })).toEqual({ organizationId: ORG, source: "tasks" });
  });

  test("refuses anything else", () => {
    for (const raw of [null, undefined, "x", [], {}, { organizationId: ORG }, { organizationId: ORG, source: "drive" },
      { organizationId: "", source: "chat" }, { organizationId: "a b", source: "chat" }, { organizationId: "x".repeat(65), source: "chat" },
      { organizationId: 5, source: "chat" }]) {
      expect(parseAppUploadInput(raw)).toBeNull();
    }
  });

  test("the UploadThing parser resolves the parsed input or rejects", async () => {
    expect(await appUploadInputParser.parseAsync(input)).toEqual(input);
    await expect(appUploadInputParser.parseAsync({ organizationId: ORG, source: "nope" })).rejects.toBeInstanceOf(UploadThingError);
  });
});

describe("authorizeAppUpload", () => {
  test("a member with room: begin_app_upload with the caller's token, the total size and count; returns the metadata", async () => {
    const { deps, calls } = harness();
    const metadata = await authorizeAppUpload(deps, { authHeader: `Bearer ${TOKEN}`, input, files });
    expect(metadata).toEqual(input);
    expect(calls).toEqual([{ key: "beginAppUpload", args: { organizationId: ORG, source: "chat", totalBytes: 1024, fileCount: 2 }, token: TOKEN }]);
  });

  test("no header, a malformed one, or a token WorkOS does not verify: FORBIDDEN [drive.unauthenticated], no call", async () => {
    for (const authHeader of [null, "", "Basic abc", "Bearer", "Bearer other.token"]) {
      const { deps, calls } = harness();
      const err = await refusal(authorizeAppUpload(deps, { authHeader, input, files }));
      expect(err.code).toBe("FORBIDDEN");
      expect(err.message).toContain("[drive.unauthenticated]");
      expect(calls).toHaveLength(0);
    }
  });

  test("zero files, more than 20, or a bad size: BAD_REQUEST, no call", async () => {
    for (const bad of [[], Array.from({ length: 21 }, () => ({ size: 1 })), [{ size: -1 }], [{ size: 1.5 }]]) {
      const { deps, calls } = harness();
      const err = await refusal(authorizeAppUpload(deps, { authHeader: `Bearer ${TOKEN}`, input, files: bad }));
      expect(err.code).toBe("BAD_REQUEST");
      expect(calls).toHaveLength(0);
    }
  });

  test("no service token: every upload is refused [drive.not_configured] before the module is asked", async () => {
    const { deps, calls, logs } = harness({ configured: false });
    const err = await refusal(authorizeAppUpload(deps, { authHeader: `Bearer ${TOKEN}`, input, files }));
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
    expect(err.message).toContain("[drive.not_configured]");
    expect(calls).toHaveLength(0);
    expect(logs.map((l) => l.event)).toEqual(["storage.app_upload.not_configured"]);
    // A signed-out caller still gets the sign-in refusal first.
    const anon = await refusal(authorizeAppUpload(harness({ configured: false }).deps, { authHeader: null, input, files }));
    expect(anon.message).toContain("[drive.unauthenticated]");
  });

  test("the module's refusals keep their [drive.*] tag for the client", async () => {
    const cases: Array<[string, string, string]> = [
      ["SpacetimeDB reducer begin_app_upload failed (530): [drive.quota_exceeded] Storage is full", "FORBIDDEN", "[drive.quota_exceeded]"],
      ["SpacetimeDB reducer begin_app_upload failed (530): Not an active member of this organization", "FORBIDDEN", "[drive.forbidden]"],
      ["SpacetimeDB reducer begin_app_upload failed (530): [drive.invalid] Unknown upload source", "BAD_REQUEST", "[drive.invalid]"],
      ["SpacetimeDB reducer begin_app_upload failed (401): bad token", "FORBIDDEN", "[drive.unauthenticated]"],
      ["SpacetimeDB reducer begin_app_upload failed (404): No such procedure", "INTERNAL_SERVER_ERROR", "[drive.not_published]"],
      ["fetch failed", "INTERNAL_SERVER_ERROR", "[drive.upstream]"],
    ];
    for (const [fail, code, tag] of cases) {
      const { deps, logs } = harness({ fail });
      const err = await refusal(authorizeAppUpload(deps, { authHeader: `Bearer ${TOKEN}`, input, files }));
      expect(err.code).toBe(code as UploadThingError["code"]);
      expect(err.message).toContain(tag);
      expect(logs.some((l) => l.event === "storage.app_upload.begin_failed")).toBe(code === "INTERNAL_SERVER_ERROR");
    }
  });
});

describe("recordAppUpload", () => {
  const KEY = "8Ix3dU0a9cWqK1mZ2pLr7tYvB5nE4hJ6sGfD0oXwQe1Ru3Tz";

  test("records the key's hash (never the key), the measured size and type, as the service", async () => {
    const { deps, calls } = harness();
    await recordAppUpload(deps, input, { key: KEY, size: 2048, type: "image/png" });
    expect(calls).toEqual([{
      key: "recordAppFile",
      args: { organizationId: ORG, keyHash: sha256Hex(KEY), source: "chat", sizeBytes: 2048, mimeType: "image/png" },
      token: undefined,
    }]);
    expect(JSON.stringify(calls)).not.toContain(KEY);
  });

  test("a recording failure is logged without the key and never thrown", async () => {
    const { deps, logs } = harness({ fail: "SpacetimeDB reducer service_record_app_file failed (530): [drive.not_found] Unknown organization" });
    await recordAppUpload(deps, input, { key: KEY, size: 1, type: "" });
    expect(logs).toEqual([{ level: "error", event: "storage.app_upload.record_failed", fields: { source: "chat", code: "not_found", attempts: 1 } }]);
  });

  test("an upstream failure is retried; one that outlasts the retries is logged", async () => {
    const upstream = "SpacetimeDB reducer service_record_app_file failed (503): Service Unavailable";
    const flaky = harness({ fail: upstream, failTimes: 2 });
    await recordAppUpload(flaky.deps, input, { key: KEY, size: 1, type: "" });
    expect(flaky.calls).toHaveLength(3);
    expect(flaky.logs).toEqual([]);
    const down = harness({ fail: upstream });
    await recordAppUpload(down.deps, input, { key: KEY, size: 1, type: "" });
    expect(down.calls).toHaveLength(3);
    expect(down.logs).toEqual([{ level: "error", event: "storage.app_upload.record_failed", fields: { source: "chat", code: "upstream", attempts: 3 } }]);
  });

  test("an unusable key or size is skipped with a warning", async () => {
    const { deps, calls, logs } = harness();
    await recordAppUpload(deps, input, { key: "a/b", size: 1, type: "" });
    await recordAppUpload(deps, input, { key: KEY, size: -1, type: "" });
    expect(calls).toHaveLength(0);
    expect(logs.map((l) => l.event)).toEqual(["storage.app_upload.record_skipped", "storage.app_upload.record_skipped"]);
  });
});

describe("authorizePlatformUpload", () => {
  const verifyAdmin = async (header: string | null) =>
    header === `Bearer ${TOKEN}` ? { isAdmin: true } : header === "Bearer staff" ? { isAdmin: false } : null;

  test("a verified platform admin may upload", async () => {
    expect(await authorizePlatformUpload(verifyAdmin, `Bearer ${TOKEN}`)).toEqual({ platform: true });
  });

  test("anyone else is refused", async () => {
    expect((await refusal(authorizePlatformUpload(verifyAdmin, null))).message).toContain("[drive.unauthenticated]");
    expect((await refusal(authorizePlatformUpload(verifyAdmin, "Bearer forged"))).message).toContain("[drive.unauthenticated]");
    expect((await refusal(authorizePlatformUpload(verifyAdmin, "Bearer staff"))).message).toContain("[drive.forbidden]");
  });
});
