// /api/drive/url with `actingMemberId` (CONTRACTS C16): a store tablet signed in
// as an owner sees every file through RLS; the PIN operator's view only NARROWS
// what gets signed — the operator's own files, the Store space, and everyone's
// files only with the Drive view power. No session check is needed because the
// operator can never widen what the caller's token already reads.

import { describe, expect, test } from "bun:test";
import { createUrlsRouteHandler } from "@/lib/drive/server/handlers/urls";
import type { SqlRow } from "@/lib/drive/server/sql-rows";
import { ORG, OTHER_ORG, makeDeps, postJson, readBody } from "./fake-deps";

const STAFF = "0b6f3a1e-2c4d-4e5f-9a6b-7c8d9e0f1a2b";
const COLLEAGUE = "7a2b9c4d-1e3f-4a5b-8c6d-9e0f1a2b3c4d";
const OWN_FILE = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const STORE_FILE = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const COLLEAGUE_FILE = "5c3d2e1f-0a9b-4c8d-8e7f-6a5b4c3d2e1f";
const OTHER_ORG_FILE = "9b2e4c1a-7d3f-4e8b-a6c5-1f0e2d3c4b5a";
const PATH = "/api/drive/url";
const STAFF_PERMISSIONS = JSON.stringify({ dashboard: { view: true }, drive: { view: false, edit: false } });

function file(id: string, space: string, owner: string, org = ORG): SqlRow {
  return {
    id, kind: "file", status: "ready", blob_key: `org/${org}/${id}/b/f.pdf`, thumb_key: "", mime_type: "application/pdf",
    space, owner_member_id: owner, organization_id: org,
  };
}

/** What an OWNER tablet's token reads: every file of the org (admin rule), plus the store file twice (two rules). */
const OWNER_TABLET_ROWS: SqlRow[] = [
  file(OWN_FILE, "my", STAFF), file(STORE_FILE, "store", COLLEAGUE), file(STORE_FILE, "store", COLLEAGUE),
  file(COLLEAGUE_FILE, "my", COLLEAGUE), file(OTHER_ORG_FILE, "store", COLLEAGUE, OTHER_ORG),
];

function member(overrides: Partial<Record<string, unknown>> = {}): SqlRow {
  return { id: { __uuid__: 1 }, organization_id: ORG, role: "staff", permissions: STAFF_PERMISSIONS, status: "active", ...overrides };
}

function setup(members: SqlRow[]) {
  const fake = makeDeps({
    onSql: (query) => (query.includes("FROM org_member") ? members : OWNER_TABLET_ROWS),
  });
  return { ...fake, handler: createUrlsRouteHandler(fake.deps) };
}

const ALL = [OWN_FILE, STORE_FILE, COLLEAGUE_FILE, OTHER_ORG_FILE].map((id) => ({ id, variant: "original", purpose: "view" }));

async function signedIds(res: Response): Promise<string[]> {
  const results = (await readBody(res)).results as Array<{ id: string; url: string | null }>;
  return results.filter((r) => r.url !== null).map((r) => r.id);
}

describe("operator narrowing (owner tablet + staff operator)", () => {
  test("without an operator the tablet's RLS view is signed as is", async () => {
    const { handler } = setup([member()]);
    expect(await signedIds(await handler(postJson(PATH, { items: ALL })))).toEqual([OWN_FILE, STORE_FILE, COLLEAGUE_FILE, OTHER_ORG_FILE]);
  });

  test("a staff operator gets their own file and the Store space; a colleague's My file stays null", async () => {
    const { handler, sqls } = setup([member(), member()]);
    const res = await handler(postJson(PATH, { items: ALL, actingMemberId: STAFF }));
    expect(res.status).toBe(200);
    expect(await signedIds(res)).toEqual([OWN_FILE, STORE_FILE]);
    expect(sqls[0]).toEqual({
      query: `SELECT id, organization_id, role, permissions, status FROM org_member WHERE id = '${STAFF}'`,
      token: "user-jwt",
    });
  });

  test("an uppercase operator id is read in lowercase", async () => {
    const { handler, sqls } = setup([member()]);
    await handler(postJson(PATH, { items: ALL, actingMemberId: STAFF.toUpperCase() }));
    expect(sqls[0].query).toContain(`'${STAFF}'`);
  });

  test("the Drive view power (or an admin role) widens the operator to everyone's files of their org only", async () => {
    const viewer = setup([member({ permissions: JSON.stringify({ dashboard: { view: true }, drive: { view: true } }) })]);
    expect(await signedIds(await viewer.handler(postJson(PATH, { items: ALL, actingMemberId: STAFF }))))
      .toEqual([OWN_FILE, STORE_FILE, COLLEAGUE_FILE]);
    const manager = setup([member({ role: "manager", permissions: JSON.stringify({ dashboard: { view: true } }) })]);
    expect(await signedIds(await manager.handler(postJson(PATH, { items: ALL, actingMemberId: STAFF }))))
      .toEqual([OWN_FILE, STORE_FILE, COLLEAGUE_FILE]);
    const owner = setup([member({ role: "owner", permissions: "{}" })]);
    expect(await signedIds(await owner.handler(postJson(PATH, { items: ALL, actingMemberId: STAFF }))))
      .toEqual([OWN_FILE, STORE_FILE, COLLEAGUE_FILE]);
  });

  // The Docs gate is the module's docMemberGate: a missing `dashboard` key or unreadable JSON passes (the role
  // defaults grant dashboard.view); only an explicit non-true `dashboard.view` fails it.
  async function signedFor(permissions: string, role = "staff"): Promise<string[]> {
    const { handler } = setup([member({ role, permissions })]);
    return signedIds(await handler(postJson(PATH, { items: ALL, actingMemberId: STAFF })));
  }
  const WIDE = [OWN_FILE, STORE_FILE, COLLEAGUE_FILE];
  const NARROW = [OWN_FILE, STORE_FILE];

  test("a manager passes the Docs gate without a `dashboard` key, with blank or unreadable JSON (same rule as the module)", async () => {
    for (const permissions of ["{}", "", "{not json", "[]", "null", JSON.stringify({ drive: { view: false } })]) {
      expect({ permissions, signed: await signedFor(permissions, "manager") }).toEqual({ permissions, signed: WIDE });
    }
  });

  test("an explicit dashboard.view that is not true fails the Docs gate, whatever the role or Drive power", async () => {
    for (const dashboard of [{ view: false }, {}, null, "yes"]) {
      const permissions = JSON.stringify({ dashboard, drive: { view: true, edit: true } });
      expect({ dashboard, signed: await signedFor(permissions, "manager") }).toEqual({ dashboard, signed: NARROW });
      expect({ dashboard, signed: await signedFor(permissions) }).toEqual({ dashboard, signed: NARROW });
    }
  });

  test("the Drive view or edit power without a `dashboard` key passes the gate and widens the operator", async () => {
    expect(await signedFor(JSON.stringify({ drive: { view: true } }))).toEqual(WIDE);
    expect(await signedFor(JSON.stringify({ drive: { edit: true } }))).toEqual(WIDE);
  });

  test("unreadable or powerless permissions give a staff operator no Drive power (the module's driveAccessOf)", async () => {
    for (const permissions of ["{not json", "", "{}", "[]", JSON.stringify({ drive: { view: "true" } }), JSON.stringify({ drive: [true] })]) {
      expect({ permissions, signed: await signedFor(permissions) }).toEqual({ permissions, signed: NARROW });
    }
  });

  test("an inactive or invisible operator → 403 operator, nothing signed", async () => {
    for (const members of [[member({ status: "disabled" })], []]) {
      const { handler, presigns } = setup(members);
      const res = await handler(postJson(PATH, { items: ALL, actingMemberId: STAFF }));
      expect(res.status).toBe(403);
      expect((await readBody(res)).code).toBe("operator");
      expect(presigns).toHaveLength(0);
    }
  });

  test("an operator of another organization signs none of this org's rows", async () => {
    const { handler } = setup([member({ organization_id: OTHER_ORG })]);
    expect(await signedIds(await handler(postJson(PATH, { items: ALL, actingMemberId: STAFF })))).toEqual([OTHER_ORG_FILE]);
  });
});
