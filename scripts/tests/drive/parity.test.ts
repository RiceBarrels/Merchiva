// The client Drive data layer against the real module code: roles and the admin
// power (lib/drive/access.ts ⇄ spacetimedb/src/drive/logic.ts), editor links
// (lib/drive/hrefs.ts documentFileHref ⇄ index.ts docLink), error codes, the
// notice id and the role ranks. logic.ts has no imports, so it is imported
// directly; index.ts declarations are extracted with loadServerDeclarations.
// Storage constants and keys are paired in rules-parity.test.ts.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { DOC_ROLE_RANK, docsGateAllows, type DocsGatePermissions } from "@/lib/docs/access";
import { docFileType } from "@/lib/docs/mappers";
import {
  DRIVE_ROLE_RANK,
  driveAdminAccess,
  driveAdminFlags,
  driveItemRole,
  isOrgAdminRole,
  resolveDriveItemAccess,
  spaceMoveAllowed,
  storeDeviceIsStoreOnly,
  type DriveClientActor,
} from "@/lib/drive/access";
import { DRIVE_ERROR_I18N_KEYS, DRIVE_SERVER_ERROR_CODES, driveErrorKey } from "@/lib/drive/errors";
import { documentFileHref } from "@/lib/drive/hrefs";
import { DRIVE_NOTICE_ID } from "@/lib/drive/types";
import type { OrgRole } from "@/lib/types";
import * as logic from "../../../spacetimedb/src/drive/logic";
import { loadServerDeclarations } from "../docs/server-source";

const DRIVE_DIR = join(import.meta.dir, "..", "..", "..", "spacetimedb", "src", "drive");
const ORG = "org-parity";
const OTHER_ORG = "org-elsewhere";
const ME = "0b6f3a1e-2c4d-4e5f-9a6b-7c8d9e0f1a2b";
const SOMEONE = "7a2b9c4d-1e3f-4a5b-8c6d-9e0f1a2b3c4d";
const DOC_ID = "1f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11";
const THREAD_ID = "5c3d2e1f-0a9b-4c8d-8e7f-6a5b4c3d2e1f";

const server = loadServerDeclarations(["docLink", "docMemberGate", "DOC_ROLE_RANK"]);
if (!server) throw new Error("spacetimedb/src/index.ts (or a file it imports) no longer defines docLink / docMemberGate / DOC_ROLE_RANK");
const docLink = server.docLink as (documentId: string, threadId?: string, fileType?: string) => string;
const docMemberGate = server.docMemberGate as (member: { role: string; permissions: string }) => boolean;

const ORG_ROLES: OrgRole[] = ["owner", "manager", "staff"];
/** Stored org_member.permissions, as scripts/tests/docs/access.test.ts pairs them. */
const STORED_PERMISSIONS: readonly string[] = [
  "{}", "", "not json", "null", "[]",
  '{"dashboard":{"view":true}}', '{"dashboard":{"view":false}}', '{"dashboard":{}}', '{"dashboard":null}',
  '{"drive":{"view":true}}', '{"drive":{"edit":true}}', '{"drive":{"view":true,"edit":true}}',
  '{"drive":{"view":false,"edit":false}}', '{"drive":{"view":"yes"}}', '{"drive":null}', '{"drive":[]}',
  '{"dashboard":{"view":true},"drive":{"view":true}}', '{"dashboard":{"view":true},"drive":{"edit":true}}',
  '{"dashboard":{"view":false},"drive":{"edit":true}}', '{"dashboard":{"view":false},"drive":{"view":true}}',
];

/** What app/manager/layout.tsx hands the client: role defaults (dashboard on, drive off) under the stored JSON. */
const LAYOUT_FALLBACK = { dashboard: { view: true }, drive: { view: false, edit: false } };
function clientPermissions(stored: string): DocsGatePermissions {
  try {
    return { ...LAYOUT_FALLBACK, ...(JSON.parse(stored) as Partial<DocsGatePermissions>) };
  } catch {
    return LAYOUT_FALLBACK;
  }
}

/** The module's rights of one member (spacetimedb/src/drive/context.ts actorRights, non-service branch). */
function serverActor(role: string, permissions: string, memberId: string): logic.DriveActorLike {
  const gate = docMemberGate({ role, permissions });
  return {
    organizationId: ORG, memberId, gate, orgAdmin: logic.isOrgAdminRole(role),
    admin: gate ? logic.driveAccessOf({ role, permissions }) : { view: false, edit: false },
  };
}

function clientActor(role: OrgRole, permissions: DocsGatePermissions, memberId: string): DriveClientActor {
  const flags = driveAdminFlags(role, permissions);
  return { organizationId: ORG, memberId, role, gate: docsGateAllows(role, permissions), ...flags };
}

function unionMembers(file: string, typeName: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(join(DRIVE_DIR, file), "utf8"), ts.ScriptTarget.ES2022, true);
  for (const statement of source.statements) {
    if (!ts.isTypeAliasDeclaration(statement) || statement.name.text !== typeName) continue;
    const type = statement.type;
    const members = ts.isUnionTypeNode(type) ? type.types : [type];
    return members.map((m) => (ts.isLiteralTypeNode(m) && ts.isStringLiteral(m.literal) ? m.literal.text : `<${m.getText(source)}>`));
  }
  throw new Error(`${file} no longer declares ${typeName}`);
}

describe("admin power and item roles (lib/drive/access.ts ⇄ drive/logic.ts)", () => {
  test("driveAdminAccess = docMemberGate && driveAccessOf for every role × stored permissions", () => {
    const mismatches: object[] = [];
    for (const role of ORG_ROLES)
      for (const stored of STORED_PERMISSIONS) {
        const expected = serverActor(role, stored, ME).admin;
        const actual = driveAdminAccess(role, clientPermissions(stored));
        if (actual.view !== expected.view || actual.edit !== expected.edit) mismatches.push({ role, stored, expected, actual });
      }
    expect(mismatches).toEqual([]);
  });

  test("the client gate equals the module's docMemberGate over the same corpus", () => {
    for (const role of ORG_ROLES)
      for (const stored of STORED_PERMISSIONS) {
        expect({ role, stored, gate: clientActor(role, clientPermissions(stored), ME).gate })
          .toEqual({ role, stored, gate: docMemberGate({ role, permissions: stored }) });
      }
  });

  test("driveItemRole and resolveDriveItemAccess match for every actor × item (incl. another org)", () => {
    const mismatches: object[] = [];
    let checked = 0;
    for (const role of ORG_ROLES)
      for (const stored of STORED_PERMISSIONS)
        for (const organizationId of [ORG, OTHER_ORG])
          for (const ownerMemberId of [ME, SOMEONE, ""])
            for (const space of ["my", "store"] as const)
              for (const kind of ["folder", "file"] as const)
                for (const status of ["ready", "pending"] as const)
                  for (const trashed of [false, true]) {
                    const item = { organizationId, ownerMemberId, space, kind, status, trashed };
                    const expected = logic.driveItemRole(item, serverActor(role, stored, ME));
                    const access = resolveDriveItemAccess(item, clientActor(role, clientPermissions(stored), ME));
                    const rank = logic.DRIVE_ROLE_RANK[expected];
                    const expectedAccess = {
                      role: expected,
                      canView: rank >= logic.DRIVE_ROLE_RANK.viewer,
                      canAddChildren: rank >= logic.DRIVE_ROLE_RANK.contributor && kind === "folder" && !trashed && status === "ready",
                      canEdit: rank >= logic.DRIVE_ROLE_RANK.editor,
                      canManage: rank >= logic.DRIVE_ROLE_RANK.manager,
                    };
                    checked++;
                    if (JSON.stringify(access) !== JSON.stringify(expectedAccess)) mismatches.push({ role, stored, item, expectedAccess, access });
                  }
    expect(checked).toBe(3 * STORED_PERMISSIONS.length * 2 * 3 * 2 * 2 * 2 * 2);
    expect(mismatches).toEqual([]);
  });

  test("no organization, a failed gate or an unknown member never reaches another member's item", () => {
    const item = { organizationId: ORG, ownerMemberId: SOMEONE, space: "store" as const };
    const base = clientActor("owner", clientPermissions("{}"), ME);
    expect(driveItemRole(item, base)).toBe("manager");
    expect(driveItemRole(item, { ...base, organizationId: null })).toBe("none");
    expect(driveItemRole(item, { ...base, gate: false })).toBe("none");
    const staff = clientActor("staff", clientPermissions("{}"), ME);
    expect(driveItemRole({ ...item, ownerMemberId: "" }, { ...staff, memberId: null })).toBe("contributor");
    expect(driveItemRole({ ...item, space: "my", ownerMemberId: "" }, { ...staff, memberId: null })).toBe("none");
  });

  test("spaceMoveAllowed matches over the whole input table", () => {
    const OWNERS = [ME, SOMEONE, ""];
    const SPACES = ["my", "store", "elsewhere"];
    const SUBTREES: string[][] = [[], [ME], [SOMEONE], [ME, SOMEONE]];
    const mismatches: object[] = [];
    let checked = 0;
    for (const fromSpace of SPACES)
      for (const toSpace of SPACES)
        for (const fromOwner of OWNERS)
          for (const toOwner of OWNERS)
            for (const subtreeOwners of SUBTREES)
              for (const actorMemberId of [ME, SOMEONE, "c3d4e5f6-0000-4000-8000-000000000001"])
                for (const actorOrgAdmin of [false, true])
                  for (const fromOwnerActive of [false, true]) {
                    const input = { fromSpace, fromOwner, toSpace, toOwner, subtreeOwners, actorMemberId, actorOrgAdmin, fromOwnerActive };
                    checked++;
                    if (spaceMoveAllowed(input) !== logic.spaceMoveAllowed(input)) mismatches.push(input);
                  }
    expect(checked).toBe(3 * 3 * 3 * 3 * 4 * 3 * 2 * 2);
    expect(mismatches).toEqual([]);
  });

  test("org admin role and the store-only tablet rule", () => {
    for (const role of ["owner", "manager", "staff", "", "Owner"]) {
      expect(isOrgAdminRole(role)).toBe(logic.isOrgAdminRole(role));
      expect(storeDeviceIsStoreOnly(role as OrgRole)).toBe(!logic.isOrgAdminRole(role));
    }
    expect(storeDeviceIsStoreOnly(null)).toBe(true);
    expect(storeDeviceIsStoreOnly(undefined)).toBe(true);
  });

  test("role ranks", () => {
    expect(DRIVE_ROLE_RANK).toEqual({ ...logic.DRIVE_ROLE_RANK });
    expect(DOC_ROLE_RANK).toEqual({ ...logic.DRIVE_DOC_ROLE_RANK });
    expect({ ...(server.DOC_ROLE_RANK as object) }).toEqual({ ...logic.DRIVE_DOC_ROLE_RANK });
  });
});

describe("editor links (lib/drive/hrefs.ts ⇄ index.ts docLink)", () => {
  test("documentFileHref equals docLink for every stored fileType, with and without a comment thread", () => {
    for (const stored of ["", "doc", "sheet", "slides"]) {
      const doc = { id: DOC_ID, fileType: docFileType(stored) };
      expect(documentFileHref(doc)).toBe(docLink(DOC_ID, undefined, stored));
      expect(documentFileHref(doc, { comment: THREAD_ID })).toBe(docLink(DOC_ID, THREAD_ID, stored));
    }
    expect(docLink(DOC_ID)).toBe(documentFileHref({ id: DOC_ID, fileType: "doc" }));
  });

  test("the paths are the module's", () => {
    expect(docLink(DOC_ID, undefined, "sheet")).toBe(`/manager/drive/sheet?id=${DOC_ID}`);
    expect(docLink(DOC_ID, undefined, "slides")).toBe(`/manager/drive/slides?id=${DOC_ID}`);
    expect(docLink(DOC_ID, undefined, "")).toBe(`/manager/docs/edit?id=${DOC_ID}`);
  });
});

describe("codes and ids", () => {
  test("DRIVE_SERVER_ERROR_CODES = DriveErrorCode of drive/logic.ts, each with an i18n key", () => {
    expect([...DRIVE_SERVER_ERROR_CODES].sort()).toEqual(unionMembers("logic.ts", "DriveErrorCode").sort());
    for (const code of DRIVE_SERVER_ERROR_CODES) expect(DRIVE_ERROR_I18N_KEYS[code]).toMatch(/^drive\.errors\.[a-zA-Z]+$/);
  });

  test("every [sheet.<code>] of drive/sheet-logic.ts maps to its sheets.errors key", () => {
    const codes = unionMembers("sheet-logic.ts", "SheetErrorCode");
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      const camel = code.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      expect(driveErrorKey(new Error(`[sheet.${code}] x`))).toBe(`sheets.errors.${camel}`);
    }
  });

  test("DRIVE_NOTICE_ID equals the module's", () => {
    expect(DRIVE_NOTICE_ID).toBe(logic.DRIVE_NOTICE_ID);
    expect([...logic.DRIVE_NOTICE_IDS]).toContain(DRIVE_NOTICE_ID);
  });
});
