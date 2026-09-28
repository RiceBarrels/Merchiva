// POST /api/drive/url: RLS decides (the SELECT runs with the caller's token),
// rows are de-duplicated by id, only ready files are signed, active types are
// always downloads, and lifetimes follow the purpose.

import { describe, expect, test } from "bun:test";
import { DRIVE_GET_TTL_MS } from "@/lib/drive/server/handlers/config";
import { createUrlsRouteHandler, driveItemsQuery } from "@/lib/drive/server/handlers/urls";
import type { SqlRow } from "@/lib/drive/server/sql-rows";
import { NOW, ORG, makeDeps, postJson, readBody, sqlError, type FakeOptions } from "./fake-deps";

const A = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const B = "7a2b9c4d-1e3f-4a5b-8c6d-9e0f1a2b3c4d";
const C = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const D = "5c3d2e1f-0a9b-4c8d-8e7f-6a5b4c3d2e1f";
const PATH = "/api/drive/url";
const OWNER = "0b6f3a1e-2c4d-4e5f-9a6b-7c8d9e0f1a2b";

function file(id: string, overrides: Partial<Record<string, unknown>> = {}): SqlRow {
  return {
    id, kind: "file", status: "ready", blob_key: `org/${ORG}/${id}/b/${id.slice(0, 4)}.pdf`, thumb_key: "",
    mime_type: "application/pdf", space: "my", owner_member_id: OWNER, organization_id: ORG, ...overrides,
  };
}

function setup(rows: SqlRow[], options: FakeOptions = {}) {
  const fake = makeDeps({ onSql: () => rows, ...options });
  return { ...fake, handler: createUrlsRouteHandler(fake.deps) };
}

type Result = { id: string; url: string | null; expiresAt: number | null };
async function results(res: Response): Promise<Result[]> {
  return (await readBody(res)).results as Result[];
}
const item = (id: string, variant = "original", purpose = "view") => ({ id, variant, purpose });

describe("driveItemsQuery", () => {
  test("projects the columns the route reads, OR-joined over unique ids (no IN in the dialect)", () => {
    expect(driveItemsQuery([A, B, A])).toBe(
      "SELECT id, kind, status, blob_key, thumb_key, mime_type, space, owner_member_id, organization_id FROM drive_item "
      + `WHERE id = '${A}' OR id = '${B}'`,
    );
  });
  test("refuses anything but lowercase uuids (no quoting is ever needed)", () => {
    expect(() => driveItemsQuery([])).toThrow();
    expect(() => driveItemsQuery(["x' OR '1'='1"])).toThrow();
    expect(() => driveItemsQuery([A.toUpperCase()])).toThrow();
  });
});

describe("POST /api/drive/url", () => {
  test("401 without a verified token; 503 without storage env", async () => {
    const anonymous = setup([]);
    const res = await anonymous.handler(postJson(PATH, { items: [item(A)] }, { token: null }));
    expect(res.status).toBe(401);
    expect((await readBody(res)).code).toBe("unauthenticated");
    const fake = makeDeps({ config: null });
    expect((await createUrlsRouteHandler(fake.deps)(postJson(PATH, { items: [item(A)] }))).status).toBe(503);
  });

  test("422 for empty or oversized batches and malformed entries; 400 for non-JSON", async () => {
    const { handler, sqls } = setup([]);
    expect((await handler(postJson(PATH, "nope"))).status).toBe(400);
    const tooMany = Array.from({ length: 51 }, () => item(A));
    const bad: unknown[] = [
      {}, { items: [] }, { items: tooMany }, { items: [item(A.toUpperCase())] }, { items: [item("not-a-uuid")] },
      { items: [item(A, "big")] }, { items: [item(A, "original", "print")] }, { items: [null] }, { items: "x" },
      { items: [item(A)], actingMemberId: 7 }, { items: [item(A)], actingMemberId: "x' OR 1=1" },
    ];
    for (const body of bad) expect({ body, status: (await handler(postJson(PATH, body))).status }).toEqual({ body, status: 422 });
    expect(sqls).toHaveLength(0);
    expect((await handler(postJson(PATH, { items: Array.from({ length: 50 }, () => item(A)) }))).status).toBe(200);
  });

  test("reads as the caller; duplicate rows from two rules → one result each, request order kept", async () => {
    const { handler, sqls, presigns } = setup([file(B), file(A, { space: "store" }), file(A, { space: "store" })]);
    const res = await handler(postJson(PATH, { items: [item(A), item(B), item(A, "original", "download")] }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(sqls).toEqual([{ query: driveItemsQuery([A, B]), token: "user-jwt" }]);
    const out = await results(res);
    expect(out.map((r) => r.id)).toEqual([A, B, A]);
    expect(out.every((r) => r.url !== null)).toBe(true);
    expect(presigns).toHaveLength(3);
  });

  test("missing, pending, folders and thumbnails not attached yet → null", async () => {
    const { handler, presigns } = setup([
      file(A, { status: "pending" }), file(B, { kind: "folder", blob_key: "" }), file(C),
    ]);
    const out = await results(await handler(postJson(PATH, { items: [item(A), item(B), item(C, "thumb"), item(D)] })));
    expect(out).toEqual([A, B, C, D].map((id) => ({ id, url: null, expiresAt: null })));
    expect(presigns).toHaveLength(0);
  });

  test("an ex-member only sees their pending rows → nothing is signed", async () => {
    const { handler } = setup([file(A, { status: "pending" })]);
    const out = await results(await handler(postJson(PATH, { items: [item(A), item(B), item(A, "thumb", "view")] })));
    expect(out.every((r) => r.url === null)).toBe(true);
  });

  test("lifetimes per purpose; download=1 only for downloads", async () => {
    const thumbKey = `org/${ORG}/${A}/b/_thumb`;
    const { handler, presigns } = setup([file(A, { thumb_key: thumbKey })]);
    const out = await results(await handler(postJson(PATH, {
      items: [item(A, "original", "view"), item(A, "original", "stream"), item(A, "original", "download"), item(A, "thumb", "view")],
    })));
    expect(out.map((r) => r.expiresAt)).toEqual([
      NOW + DRIVE_GET_TTL_MS.view, NOW + DRIVE_GET_TTL_MS.stream, NOW + DRIVE_GET_TTL_MS.download, NOW + DRIVE_GET_TTL_MS.thumb,
    ]);
    expect(presigns.map((p) => p.opts.download)).toEqual([false, false, true, false]);
    expect(presigns[3].pathname).toBe(thumbKey);
    expect(presigns[0].pathname).toBe(file(A).blob_key as string);
    expect(out[2].url).toContain("download=1");
    expect(out[0].url).not.toContain("download=1");
  });

  test("active types (HTML, SVG, any +xml) are always signed as downloads", async () => {
    const { handler, presigns } = setup([
      file(A, { mime_type: "text/html" }), file(B, { mime_type: "image/svg+xml" }), file(C, { mime_type: "application/rss+xml" }),
      file(D, { mime_type: "image/png" }),
    ]);
    const out = await results(await handler(postJson(PATH, {
      items: [item(A, "original", "view"), item(B, "original", "stream"), item(C, "original", "view"), item(D, "original", "view")],
    })));
    expect(presigns.map((p) => p.opts.download)).toEqual([true, true, true, false]);
    expect(out.slice(0, 3).every((r) => r.expiresAt === NOW + DRIVE_GET_TTL_MS.download)).toBe(true);
  });

  test("a token SpacetimeDB rejects → 401; other SQL failures → 502", async () => {
    const rejected = setup([], { onSql: () => { throw sqlError(401, "Invalid token"); } });
    expect((await rejected.handler(postJson(PATH, { items: [item(A)] }))).status).toBe(401);
    const broken = setup([], { onSql: () => { throw sqlError(500, "boom"); } });
    const res = await broken.handler(postJson(PATH, { items: [item(A)] }));
    expect(res.status).toBe(502);
    expect((await readBody(res)).code).toBe("upstream");
  });

  test("an empty actingMemberId narrows nothing and reads no member", async () => {
    const { handler, sqls } = setup([file(A)]);
    const out = await results(await handler(postJson(PATH, { items: [item(A)], actingMemberId: "" })));
    expect(out[0].url).not.toBeNull();
    expect(sqls).toHaveLength(1);
  });
});
