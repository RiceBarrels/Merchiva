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
const ORG = "org-access-matrix";

type DashboardView = true | false | "missing";
/** permissions.drive: the Drive "everyone's files" power. */
type DriveGrant = "none" | "view" | "edit";
interface Case {
  orgRole: OrgRole;
  dashboardView: DashboardView;
  driveGrant: DriveGrant;
  isDocOwner: boolean;
  visibility: DocVisibility;
  grant: DocGrantRole | null;
  trashed: boolean;
}

const ORG_ROLES: OrgRole[] = ["owner", "manager", "staff"];
const VIEWS: DashboardView[] = [true, false, "missing"];
const DRIVE_GRANTS: DriveGrant[] = ["none", "view", "edit"];
const VISIBILITIES: DocVisibility[] = ["org_edit", "org_view", "private"];
const GRANTS: (DocGrantRole | null)[] = [null, "viewer", "commenter", "editor"];

function allCases(): Case[] {
  const out: Case[] = [];
  for (const orgRole of ORG_ROLES)
    for (const dashboardView of VIEWS)
      for (const driveGrant of DRIVE_GRANTS)
        for (const isDocOwner of [false, true])
          for (const visibility of VISIBILITIES)
            for (const grant of GRANTS)
              for (const trashed of [false, true]) out.push({ orgRole, dashboardView, driveGrant, isDocOwner, visibility, grant, trashed });
  return out;
}

function permissionsFor(view: DashboardView, drive: DriveGrant = "none"): DocsGatePermissions {
  const dashboard = view === "missing" ? {} : { dashboard: { view } };
  return { ...dashboard, drive: { view: drive !== "none", edit: drive === "edit" } };
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
    permissions: permissionsFor(c.dashboardView, c.driveGrant),
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
  // Row 4 — the highest of the visibility role, the Drive floor and the grant role.
  const visibilityRole: DocRole = { org_edit: "editor", org_view: "viewer", private: "none" }[c.visibility] as DocRole;
  const driveFloor: DocRole = { none: "none", view: "viewer", edit: "editor" }[c.driveGrant] as DocRole;
  const grantRole: DocRole = c.grant ?? "none";
  return [visibilityRole, driveFloor, grantRole].reduce((a, b) => (DOC_ROLE_RANK[b] > DOC_ROLE_RANK[a] ? b : a));
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
    expect(cases.length).toBe(3 * 3 * 3 * 2 * 3 * 4 * 2);
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
  const base: Case = { orgRole: "staff", dashboardView: true, driveGrant: "none", isDocOwner: false, visibility: "org_edit", grant: null, trashed: false };

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

  test("the Drive floor: drive.view → at least viewer, drive.edit → at least editor, never lower", () => {
    expect(docRoleFor(inputFor({ ...base, visibility: "private", driveGrant: "view" }))).toBe("viewer");
    expect(docRoleFor(inputFor({ ...base, visibility: "private", driveGrant: "edit" }))).toBe("editor");
    expect(docRoleFor(inputFor({ ...base, visibility: "org_view", driveGrant: "edit" }))).toBe("editor");
    expect(docRoleFor(inputFor({ ...base, visibility: "org_edit", driveGrant: "view" }))).toBe("editor");
    expect(docRoleFor(inputFor({ ...base, visibility: "private", driveGrant: "view", grant: "commenter" }))).toBe("commenter");
    expect(docRoleFor(inputFor({ ...base, visibility: "private", driveGrant: "edit", dashboardView: false }))).toBe("none");
    expect(docRoleFor({ ...inputFor({ ...base, visibility: "private" }), permissions: { dashboard: { view: true }, drive: { edit: true } } })).toBe("editor");
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

// ── Parity with the server module ─────────────────────────────────────────────
//
// The server reads the member's STORED permissions JSON; the client reads
// `usePermissions().permissions`, which app/manager/layout.tsx builds as
// `{ ...fallback, ...JSON.parse(stored) }` (fallback = default/owner permissions:
// dashboard: { view: true }, and drive off for staff; unparseable JSON →
// fallback). Parity is checked over stored-JSON variants, feeding each side what
// it really sees. The server code must be present: a missing docRoleFor fails
// here instead of skipping (scripts/tests/docs/server-source-coverage.test.ts).

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
  '{"drive":{"view":true}}',
  '{"drive":{"edit":true}}',
  '{"drive":{"view":true,"edit":true}}',
  '{"drive":{"view":false,"edit":false}}',
  '{"drive":{"view":"yes"}}',
  '{"drive":null}',
  '{"drive":[]}',
  '{"dashboard":{"view":true},"drive":{"view":true}}',
  '{"dashboard":{"view":false},"drive":{"edit":true}}',
];

/** lib/db/team.ts defaultPermissions() / ownerPermissions(): dashboard on; drive off (owners and managers never read it). */
const LAYOUT_FALLBACK = { dashboard: { view: true }, drive: { view: false, edit: false } };

function layoutMergedPermissions(stored: string): DocsGatePermissions {
  try {
    return { ...LAYOUT_FALLBACK, ...(JSON.parse(stored) as Partial<DocsGatePermissions>) };
  } catch {
    return LAYOUT_FALLBACK;
  }
}

class StubSenderError extends Error {}
const server = loadServerDeclarations(["docRoleFor"], {
  isServiceCaller: (ctx: { service?: boolean }) => ctx.service === true,
  SenderError: StubSenderError,
});
if (!server) throw new Error("spacetimedb/src/index.ts (or a file it imports) no longer defines docRoleFor");

type ServerDocRoleFor = (
  ctx: unknown,
  doc: { id: string; organizationId: string; ownerMemberId: string; visibility: string },
  member: { id: { toString(): string }; organizationId: string; role: string; permissions: string },
) => string;

const serverRoleFor = server.docRoleFor as ServerDocRoleFor;

function serverCtx(grants: readonly { documentId: string }[]) {
  return {
    service: false,
    db: { documentAccess: { byDocumentId: { filter: (id: string) => grants.filter((g) => g.documentId === id) } } },
  };
}

describe("server docRoleFor parity (spacetimedb/src/index.ts)", () => {
  test("client docRoleFor equals server docRoleFor for every role × stored permissions (incl. drive) × doc × grant", () => {
    const mismatches: object[] = [];
    let checked = 0;
    for (const orgRole of ORG_ROLES)
      for (const stored of STORED_PERMISSIONS)
        for (const isDocOwner of [false, true])
          for (const visibility of VISIBILITIES)
            for (const grant of GRANTS) {
              const grants = grantsFor(grant);
              const doc = { id: DOC_ID, organizationId: ORG, ownerMemberId: isDocOwner ? ME : SOMEONE, visibility };
              const member = { id: { toString: () => ME }, organizationId: ORG, role: orgRole, permissions: stored };
              const serverRole = serverRoleFor(serverCtx(grants), doc, member);
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

  test("drive.view / drive.edit lift a staff member's role on a colleague's private document on both sides", () => {
    const doc = { id: DOC_ID, organizationId: ORG, ownerMemberId: SOMEONE, visibility: "private" };
    const expected: Array<[string, DocRole]> = [
      ['{"dashboard":{"view":true}}', "none"],
      ['{"drive":{"view":true}}', "viewer"],
      ['{"drive":{"edit":true}}', "editor"],
    ];
    for (const [stored, role] of expected) {
      const member = { id: { toString: () => ME }, organizationId: ORG, role: "staff", permissions: stored };
      expect(serverRoleFor(serverCtx([]), doc, member)).toBe(role);
      expect(docRoleFor({ doc: { ...doc, trashedAt: null }, memberId: ME, orgRole: "staff", permissions: layoutMergedPermissions(stored), grants: [] })).toBe(role);
    }
  });

  test("another organization's document is none on the server, for every role, power and grant", () => {
    const doc = { id: DOC_ID, organizationId: ORG, ownerMemberId: ME, visibility: "org_edit" };
    for (const orgRole of ORG_ROLES)
      for (const stored of STORED_PERMISSIONS) {
        const member = { id: { toString: () => ME }, organizationId: "org-elsewhere", role: orgRole, permissions: stored };
        expect(serverRoleFor(serverCtx(grantsFor("editor")), doc, member)).toBe("none");
      }
  });
});
