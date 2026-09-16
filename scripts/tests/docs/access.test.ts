import { describe, expect, test } from "bun:test";
import {
  DOC_ROLE_RANK,
  NO_DOC_ACCESS,
  docAccessFromRole,
  docRoleFor,
  docsGateAllows,
  resolveDocAccess,
  type DocsGatePermissions,
  type ResolveDocAccessInput,
} from "@/lib/docs/access";
import type { DocGrantRole, DocRole, DocVisibility } from "@/lib/docs/types";
import type { OrgRole } from "@/lib/types";
import { loadServerDeclarations } from "./server-source";

const DOC_ID = "1f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11";
const OTHER_DOC_ID = "7a2b9c4d-1e3f-4a5b-8c6d-9e0f1a2b3c4d";
const ME = "member-me";
const SOMEONE = "member-other";

type DashboardView = true | false | "missing";
interface Case {
  orgRole: OrgRole;
  dashboardView: DashboardView;
  isDocOwner: boolean;
  visibility: DocVisibility;
  grant: DocGrantRole | null;
  trashed: boolean;
}

const ORG_ROLES: OrgRole[] = ["owner", "manager", "staff"];
const VIEWS: DashboardView[] = [true, false, "missing"];
const VISIBILITIES: DocVisibility[] = ["org_edit", "org_view", "private"];
const GRANTS: (DocGrantRole | null)[] = [null, "viewer", "commenter", "editor"];

function allCases(): Case[] {
  const out: Case[] = [];
  for (const orgRole of ORG_ROLES)
    for (const dashboardView of VIEWS)
      for (const isDocOwner of [false, true])
        for (const visibility of VISIBILITIES)
          for (const grant of GRANTS)
            for (const trashed of [false, true]) out.push({ orgRole, dashboardView, isDocOwner, visibility, grant, trashed });
  return out;
}

function permissionsFor(view: DashboardView): DocsGatePermissions {
  return view === "missing" ? {} : { dashboard: { view } };
}

function grantsFor(grant: DocGrantRole | null) {
  return grant ? [{ documentId: DOC_ID, memberId: ME, role: grant }] : [];
}

function inputFor(c: Case, memberId: string | null = ME): ResolveDocAccessInput {
  return {
    doc: {
      id: DOC_ID,
      ownerMemberId: c.isDocOwner ? ME : SOMEONE,
      visibility: c.visibility,
      trashedAt: c.trashed ? new Date(1_700_000_000_000) : null,
    },
    memberId,
    orgRole: c.orgRole,
    permissions: permissionsFor(c.dashboardView),
    grants: grantsFor(c.grant),
  };
}

/** Plan §B4.5, row by row. `dashboardView` is the effective (layout-merged) permission. */
function matrixRole(c: Case): DocRole {
  // Row 1 — org owner (the service identity acts as a virtual owner member).
  if (c.orgRole === "owner") return "manager";
  // Row 2 — fails the gate: not owner and no dashboard.view === true.
  if (c.dashboardView !== true) return "none";
  // Row 3 — org manager, or the document's ownerMemberId.
  if (c.orgRole === "manager" || c.isDocOwner) return "manager";
  // Row 4 — the higher of the visibility role and the grant role.
  const visibilityRole: DocRole = { org_edit: "editor", org_view: "viewer", private: "none" }[c.visibility] as DocRole;
  const grantRole: DocRole = c.grant ?? "none";
  return DOC_ROLE_RANK[grantRole] > DOC_ROLE_RANK[visibilityRole] ? grantRole : visibilityRole;
}

/** "What each role can do" (plan §B4.5). */
const CAPABILITIES: Record<DocRole, { view: boolean; comment: boolean; edit: boolean; manage: boolean }> = {
  none: { view: false, comment: false, edit: false, manage: false },
  viewer: { view: true, comment: false, edit: false, manage: false },
  commenter: { view: true, comment: true, edit: false, manage: false },
  editor: { view: true, comment: true, edit: true, manage: false },
  manager: { view: true, comment: true, edit: true, manage: true },
};

describe("resolveDocAccess — plan §B4.5 matrix", () => {
  const cases = allCases();

  test(`enumerates ${cases.length} combinations`, () => {
    expect(cases.length).toBe(3 * 3 * 2 * 3 * 4 * 2);
  });

  test("role equals the matrix for every combination", () => {
    const mismatches = cases.filter((c) => docRoleFor(inputFor(c)) !== matrixRole(c));
    expect(mismatches).toEqual([]);
  });

  test("capability flags follow the role; editing or commenting on a trashed doc is never allowed", () => {
    for (const c of cases) {
      const role = matrixRole(c);
      const access = resolveDocAccess(inputFor(c));
      const caps = CAPABILITIES[role];
      expect(access).toEqual({
        role,
        canView: caps.view,
        // The server rejects every write on a trashed doc except restore / delete forever (canManage).
        canComment: caps.comment && !c.trashed,
        canEdit: caps.edit && !c.trashed,
        canManage: caps.manage,
      });
    }
  });
});

describe("resolveDocAccess — explicit rows", () => {
  const base: Case = { orgRole: "staff", dashboardView: true, isDocOwner: false, visibility: "org_edit", grant: null, trashed: false };

  test("org owner is manager even with dashboard.view false and a private doc", () => {
    expect(docRoleFor(inputFor({ ...base, orgRole: "owner", dashboardView: false, visibility: "private" }))).toBe("manager");
  });

  test("the gate requires dashboard.view === true", () => {
    expect(docRoleFor(inputFor({ ...base, dashboardView: "missing" }))).toBe("none");
    expect(docRoleFor(inputFor({ ...base, dashboardView: false }))).toBe("none");
  });

  test("the gate applies before manager / doc-owner promotion", () => {
    expect(docRoleFor(inputFor({ ...base, orgRole: "manager", dashboardView: false }))).toBe("none");
    expect(docRoleFor(inputFor({ ...base, isDocOwner: true, dashboardView: false }))).toBe("none");
  });

  test("org manager and document owner are managers", () => {
    expect(docRoleFor(inputFor({ ...base, orgRole: "manager", visibility: "private" }))).toBe("manager");
    expect(docRoleFor(inputFor({ ...base, isDocOwner: true, visibility: "private" }))).toBe("manager");
  });

  test("visibility base roles", () => {
    expect(docRoleFor(inputFor({ ...base, visibility: "org_edit" }))).toBe("editor");
    expect(docRoleFor(inputFor({ ...base, visibility: "org_view" }))).toBe("viewer");
    expect(docRoleFor(inputFor({ ...base, visibility: "private" }))).toBe("none");
  });

  test("grants raise but never lower", () => {
    expect(docRoleFor(inputFor({ ...base, visibility: "org_view", grant: "commenter" }))).toBe("commenter");
    expect(docRoleFor(inputFor({ ...base, visibility: "private", grant: "viewer" }))).toBe("viewer");
    expect(docRoleFor(inputFor({ ...base, visibility: "org_edit", grant: "viewer" }))).toBe("editor");
  });

  test("grants for another member, another document or an unknown role are ignored", () => {
    const input = inputFor({ ...base, visibility: "private" });
    expect(
      docRoleFor({
        ...input,
        grants: [
          { documentId: DOC_ID, memberId: SOMEONE, role: "editor" },
          { documentId: OTHER_DOC_ID, memberId: ME, role: "editor" },
          { documentId: DOC_ID, memberId: ME, role: "manager" as DocGrantRole },
        ],
      }),
    ).toBe("none");
  });

  test("the highest of several grants wins", () => {
    const input = inputFor({ ...base, visibility: "private" });
    expect(
      docRoleFor({
        ...input,
        grants: [
          { documentId: DOC_ID, memberId: ME, role: "viewer" },
          { documentId: DOC_ID, memberId: ME, role: "editor" },
          { documentId: DOC_ID, memberId: ME, role: "commenter" },
        ],
      }),
    ).toBe("editor");
  });

  test("an unknown member id never matches the doc owner or grants", () => {
    const c: Case = { ...base, visibility: "private", isDocOwner: true, grant: "editor" };
    const input = inputFor(c, null);
    expect(docRoleFor({ ...input, doc: { ...input.doc, ownerMemberId: "" } })).toBe("none");
    expect(docRoleFor(inputFor({ ...c, isDocOwner: false }, null))).toBe("none");
  });

  test("trashed documents stay viewable (and manageable) but take no edits or comments", () => {
    const access = resolveDocAccess(inputFor({ ...base, trashed: true }));
    expect(access.role).toBe("editor");
    expect(access.canView).toBe(true);
    expect(access.canComment).toBe(false);
    expect(access.canEdit).toBe(false);

    const manager = resolveDocAccess(inputFor({ ...base, orgRole: "manager", trashed: true }));
    expect(manager).toEqual({ role: "manager", canView: true, canComment: false, canEdit: false, canManage: true });
    expect(resolveDocAccess(inputFor({ ...base, grant: "commenter", visibility: "org_view", trashed: false })).canComment).toBe(true);
  });

  test("helpers", () => {
    expect(NO_DOC_ACCESS).toEqual(docAccessFromRole("none", false));
    expect(Object.isFrozen(NO_DOC_ACCESS)).toBe(true);
    expect(docsGateAllows("owner", null)).toBe(true);
    expect(docsGateAllows("manager", { dashboard: { view: true } })).toBe(true);
    expect(docsGateAllows("staff", undefined)).toBe(false);
    expect(docsGateAllows(null, { dashboard: null })).toBe(false);
  });
});

// ── Parity with the server module (when its docs code is present) ─────────────
//
// The server reads the member's STORED permissions JSON; the client reads
// `usePermissions().permissions`, which app/manager/layout.tsx:304-313 builds as
// `{ ...fallback, ...JSON.parse(stored) }` (fallback = default/owner permissions,
// both with dashboard: { view: true }; unparseable JSON → fallback). Parity is
// checked over stored-JSON variants, feeding each side what it really sees.

const STORED_PERMISSIONS: readonly string[] = [
  "{}",
  "",
  "not json",
  "null",
  "[]",
  '{"inventory":{"view":true}}',
  '{"dashboard":{"view":true}}',
  '{"dashboard":{"view":false}}',
  '{"dashboard":{}}',
  '{"dashboard":null}',
];

const LAYOUT_FALLBACK_DASHBOARD = { view: true }; // lib/db/team.ts defaultPermissions() / ownerPermissions()

function layoutMergedPermissions(stored: string): DocsGatePermissions {
  const fallback = { dashboard: LAYOUT_FALLBACK_DASHBOARD };
  try {
    return { ...fallback, ...(JSON.parse(stored) as Partial<DocsGatePermissions>) };
  } catch {
    return fallback;
  }
}

class StubSenderError extends Error {}
const server = loadServerDeclarations(["docRoleFor"], {
  isServiceCaller: (ctx: { service?: boolean }) => ctx.service === true,
  SenderError: StubSenderError,
});

type ServerDocRoleFor = (
  ctx: unknown,
  doc: { id: string; ownerMemberId: string; visibility: string },
  member: { id: { toString(): string }; role: string; permissions: string },
) => string;

describe.if(server !== null)("server docRoleFor parity (spacetimedb/src/index.ts)", () => {
  const serverRoleFor = server?.docRoleFor as ServerDocRoleFor;

  test("client docRoleFor equals server docRoleFor for every role × stored permissions × doc × grant", () => {
    const mismatches: object[] = [];
    let checked = 0;
    for (const orgRole of ORG_ROLES)
      for (const stored of STORED_PERMISSIONS)
        for (const isDocOwner of [false, true])
          for (const visibility of VISIBILITIES)
            for (const grant of GRANTS) {
              const grants = grantsFor(grant);
              const ctx = {
                service: false,
                db: { documentAccess: { byDocumentId: { filter: (id: string) => grants.filter((g) => g.documentId === id) } } },
              };
              const doc = { id: DOC_ID, ownerMemberId: isDocOwner ? ME : SOMEONE, visibility };
              const serverRole = serverRoleFor(ctx, doc, { id: { toString: () => ME }, role: orgRole, permissions: stored });
              const clientRole = docRoleFor({
                doc: { ...doc, trashedAt: null },
                memberId: ME,
                orgRole,
                permissions: layoutMergedPermissions(stored),
                grants,
              });
              checked++;
              if (serverRole !== clientRole) mismatches.push({ orgRole, stored, isDocOwner, visibility, grant, serverRole, clientRole });
            }
    expect(checked).toBe(3 * STORED_PERMISSIONS.length * 2 * 3 * 4);
    expect(mismatches).toEqual([]);
  });
});

test.if(server === null)("server docRoleFor not in spacetimedb/src/index.ts yet — parity check skipped", () => {
  console.warn("[docs/access.test] docRoleFor is missing from spacetimedb/src/index.ts; only the §B4.5 matrix was checked.");
});
