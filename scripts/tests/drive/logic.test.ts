// spacetimedb/src/drive/logic.ts — the pure rules every drive reducer uses.
// Imported directly (the file has no imports), so these run the real code.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import {
  DRIVE_DEFAULT_QUOTA_BYTES,
  DRIVE_DOC_ROLE_RANK,
  DRIVE_MAX_DEPTH,
  DRIVE_MAX_FILE_BYTES,
  DRIVE_MAX_RESERVED_PER_UPLOADER_BYTES,
  DRIVE_NAME_MAX,
  DRIVE_OPERATOR_SESSION_TTL_MICROS,
  DRIVE_TRASH_RETENTION_MICROS,
  DRIVE_UPLOAD_TTL_MICROS,
  asciiFileName,
  cleanDriveName,
  collectSubtree,
  depthOf,
  driveAccessOf,
  driveBlobKey,
  driveExtension,
  driveItemRole,
  driveThumbKeyFor,
  isActiveDriveMime,
  isAncestorOrSelf,
  isBlockedDriveFile,
  isDriveSpace,
  isOrgAdminRole,
  minDocRole,
  minDriveRole,
  normalizeDriveMime,
  parseDriveBlobKey,
  parseIdList,
  rootItem,
  spaceMoveAllowed,
  withoutDrivePower,
  type DriveActorLike,
  type DriveItemRole,
} from "../../../spacetimedb/src/drive/logic";
import { loadServerDeclarations } from "../docs/server-source";

const LOGIC_PATH = join(import.meta.dir, "..", "..", "..", "spacetimedb", "src", "drive", "logic.ts");
const ORG = "0b9d6a3e-1c2f-7a4b-8c5d-6e7f8a9b0c1d";
const OTHER_ORG = "1c2f7a4b-0b9d-6a3e-8c5d-6e7f8a9b0c1d";
const ITEM = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const BLOB = "9b2e4c1a-7d3f-4e8b-a6c5-1f0e2d3c4b5a";
const GIB = 1_073_741_824n;
const HOUR = 3_600_000_000n;

describe("logic.ts stays pure", () => {
  test("it has no import or require of any kind", () => {
    const file = ts.createSourceFile("logic.ts", readFileSync(LOGIC_PATH, "utf8"), ts.ScriptTarget.ES2022, true);
    const imports = file.statements.filter((s) => ts.isImportDeclaration(s) || ts.isImportEqualsDeclaration(s));
    expect(imports).toHaveLength(0);
    expect(readFileSync(LOGIC_PATH, "utf8")).not.toMatch(/\brequire\(|\bimport\(/);
  });
});

describe("limits (user decisions)", () => {
  test("1 GiB per file, 10 GiB default quota, 2 GiB reserved per uploader", () => {
    expect(DRIVE_MAX_FILE_BYTES).toBe(1_073_741_824n);
    expect(DRIVE_DEFAULT_QUOTA_BYTES).toBe(10_737_418_240n);
    expect(DRIVE_MAX_RESERVED_PER_UPLOADER_BYTES).toBe(2n * DRIVE_MAX_FILE_BYTES);
  });
  test("3 h pending window, 30-day trash retention, 12 h operator session", () => {
    expect(DRIVE_UPLOAD_TTL_MICROS).toBe(3n * HOUR);
    expect(DRIVE_TRASH_RETENTION_MICROS).toBe(30n * 24n * HOUR);
    expect(DRIVE_OPERATOR_SESSION_TTL_MICROS).toBe(12n * HOUR);
    expect(GIB).toBe(DRIVE_MAX_FILE_BYTES);
  });
});

describe("cleanDriveName", () => {
  test("NFC, trimmed, controls and bidi controls stripped", () => {
    expect(cleanDriveName("  Café menu.pdf ")).toBe("Café menu.pdf");
    expect(cleanDriveName("a\u0000b\u001fc\u007f\u0085.txt")).toBe("abc.txt");
    expect(cleanDriveName("invoice‮fdp.exe")).toBe("invoicefdp.exe");
    expect(cleanDriveName("x‎‏؜⁦⁩y")).toBe("xy");
    expect(cleanDriveName("e‎́")).toBe("é"); // a stripped control no longer keeps the accent apart
  });
  test("rejects empty, dot names, separators and over-long names; never truncates", () => {
    for (const bad of ["", "   ", ".", "..", "a/b", "a\\b", "‮", "x".repeat(DRIVE_NAME_MAX + 1)]) {
      expect(cleanDriveName(bad)).toBeNull();
    }
    expect(cleanDriveName("x".repeat(DRIVE_NAME_MAX))).toBe("x".repeat(DRIVE_NAME_MAX));
    expect(cleanDriveName("...")).toBe("...");
  });
  test("idempotent", () => {
    for (const raw of ["  Café‎.pdf", "报告 2026.xlsx", "e‎́"]) {
      const once = cleanDriveName(raw) as string;
      expect(cleanDriveName(once)).toBe(once);
    }
  });
});

describe("MIME, extensions, blocked and active types", () => {
  test("normalizeDriveMime", () => {
    expect(normalizeDriveMime(" Text/HTML; charset=UTF-8 ")).toBe("text/html");
    expect(normalizeDriveMime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    for (const bad of ["", "text", "text/", "/html", "té/xt", "a/b c", `a/${"b".repeat(200)}`]) expect(normalizeDriveMime(bad)).toBe("");
  });
  test("driveExtension ignores trailing dots and spaces", () => {
    expect(driveExtension("Report.PDF")).toBe("pdf");
    expect(driveExtension("setup.exe. ")).toBe("exe");
    expect(driveExtension(".apk")).toBe("apk");
    expect(driveExtension("README")).toBe("");
  });
  test("isBlockedDriveFile: extension, leaf extension or MIME type", () => {
    expect(isBlockedDriveFile("setup.exe", "application/pdf")).toBe(true);
    expect(isBlockedDriveFile("SETUP.EXE", "")).toBe(true);
    expect(isBlockedDriveFile("setup.exe~", "")).toBe(true); // the blob leaf would be setup.exe
    expect(isBlockedDriveFile("menu.pdf", "application/x-msdownload")).toBe(true);
    expect(isBlockedDriveFile("menu.pdf", "application/pdf")).toBe(false);
    expect(isBlockedDriveFile("notes.txt", "text/plain")).toBe(false);
  });
  test("isActiveDriveMime: the list and every +xml", () => {
    expect(isActiveDriveMime("text/html")).toBe(true);
    expect(isActiveDriveMime("image/svg+xml")).toBe(true);
    expect(isActiveDriveMime("application/rss+xml")).toBe(true);
    expect(isActiveDriveMime("image/png")).toBe(false);
    expect(isDriveSpace("my") && isDriveSpace("store") && !isDriveSpace("shared")).toBe(true);
  });
});

describe("blob keys", () => {
  test("asciiFileName examples", () => {
    const cases: Array<[string, string]> = [
      ["Q3 report.xlsx", "Q3-report.xlsx"],
      ["报告.pdf", "file.pdf"],
      ["Café menu.JPG", "Caf-menu.jpg"],
      [".env", "env"],
      ["_thumb", "thumb"],
      ["a.b.tar.gz", "a.b.tar.gz"],
    ];
    for (const [name, leaf] of cases) expect(asciiFileName(name)).toBe(leaf);
    expect(asciiFileName("x".repeat(200)).length).toBeLessThanOrEqual(91);
  });
  test("driveBlobKey parses back; the thumb key shares the prefix", () => {
    const key = driveBlobKey(ORG, ITEM, BLOB, "Q3 report.xlsx");
    expect(key).toBe(`org/${ORG}/${ITEM}/${BLOB}/Q3-report.xlsx`);
    expect(parseDriveBlobKey(key)).toEqual({ organizationId: ORG, itemId: ITEM, blobId: BLOB, leaf: "Q3-report.xlsx", isThumb: false });
    const thumb = driveThumbKeyFor(key);
    expect(thumb).toBe(`org/${ORG}/${ITEM}/${BLOB}/_thumb`);
    expect(parseDriveBlobKey(thumb)?.isThumb).toBe(true);
    expect(driveThumbKeyFor("nope")).toBe("");
  });
  test("item and blob segments must be lowercase uuid v4; leaves must be ASCII", () => {
    const v1 = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    for (const bad of [
      `org/${ORG}/${v1}/${BLOB}/a.pdf`,
      `org/${ORG}/${ITEM}/${BLOB.toUpperCase()}/a.pdf`,
      `org/${ORG}/${ITEM}/${BLOB}/报告.pdf`,
      `org/${ORG}/${ITEM}/${BLOB}/_evil`,
      `org/${ORG}/${ITEM}/${BLOB}/a.pdf/extra`,
      `${ORG}/${ITEM}/${BLOB}/a.pdf`,
    ]) {
      expect(parseDriveBlobKey(bad)).toBeNull();
    }
  });
  test("parseIdList: lowercased, de-duplicated uuid v4s; '' is empty; junk or too many is null", () => {
    const a = ITEM;
    const b = BLOB;
    expect(parseIdList(JSON.stringify([a, b.toUpperCase(), a]), 3)).toEqual([a, b]);
    expect(parseIdList("", 5)).toEqual([]);
    expect(parseIdList("[]", 5)).toEqual([]);
    for (const bad of ["x", "{}", "[1]", `["${a}", null]`, `["not-a-uuid"]`, `["3f2504e0-4f89-11d3-9a0c-0305e82c3301"]`]) {
      expect(parseIdList(bad, 5)).toBeNull();
    }
    expect(parseIdList(JSON.stringify([a, b, a]), 2)).toBeNull();
  });
});

describe("Drive admin power", () => {
  test("owners and managers always; drive.edit implies view; the raw JSON otherwise", () => {
    const cases: Array<[string, string, { view: boolean; edit: boolean }]> = [
      ["owner", "{}", { view: true, edit: true }],
      ["manager", '{"drive":{"view":false,"edit":false}}', { view: true, edit: true }],
      ["staff", "{}", { view: false, edit: false }],
      ["staff", "", { view: false, edit: false }],
      ["staff", "not json", { view: false, edit: false }],
      ["staff", "null", { view: false, edit: false }],
      ["staff", '{"drive":null}', { view: false, edit: false }],
      ["staff", '{"drive":{"view":"yes"}}', { view: false, edit: false }],
      ["staff", '{"drive":{"view":true}}', { view: true, edit: false }],
      ["staff", '{"drive":{"edit":true}}', { view: true, edit: true }],
      ["cashier", '{"drive":{"view":true,"edit":true}}', { view: true, edit: true }],
    ];
    for (const [role, permissions, expected] of cases) expect(driveAccessOf({ role, permissions })).toEqual(expected);
    expect(isOrgAdminRole("owner") && isOrgAdminRole("manager") && !isOrgAdminRole("staff")).toBe(true);
  });
  test("withoutDrivePower forces drive off and keeps every other section", () => {
    const stripped = withoutDrivePower('{"inventory":{"view":true},"drive":{"view":true,"edit":true}}');
    expect(JSON.parse(stripped)).toEqual({ inventory: { view: true }, drive: { view: false, edit: false } });
    expect(driveAccessOf({ role: "staff", permissions: stripped })).toEqual({ view: false, edit: false });
    expect(JSON.parse(withoutDrivePower("{}"))).toEqual({ drive: { view: false, edit: false } });
    for (const unchanged of ["", "not json", "null", "[]", "7"]) expect(withoutDrivePower(unchanged)).toBe(unchanged);
  });
});

describe("driveItemRole", () => {
  const actor = (over: Partial<DriveActorLike> = {}): DriveActorLike => ({
    organizationId: ORG,
    memberId: "me",
    gate: true,
    orgAdmin: false,
    admin: { view: false, edit: false },
    ...over,
  });
  const item = (space: string, ownerMemberId: string, organizationId = ORG) => ({ organizationId, ownerMemberId, space });

  test("the full matrix", () => {
    type Power = "none" | "view" | "edit";
    const admins: Record<Power, { view: boolean; edit: boolean }> = {
      none: { view: false, edit: false }, view: { view: true, edit: false }, edit: { view: true, edit: true },
    };
    const expected = (space: string, own: boolean, orgAdmin: boolean, power: Power): DriveItemRole => {
      if (orgAdmin || own) return "manager";
      if (power === "edit") return "editor";
      if (space === "store") return "contributor";
      return power === "view" ? "viewer" : "none";
    };
    for (const space of ["my", "store"])
      for (const own of [false, true])
        for (const orgAdmin of [false, true])
          for (const power of ["none", "view", "edit"] as Power[]) {
            const role = driveItemRole(item(space, own ? "me" : "someone"), actor({ orgAdmin, admin: admins[power] }));
            expect({ space, own, orgAdmin, power, role }).toEqual({ space, own, orgAdmin, power, role: expected(space, own, orgAdmin, power) });
          }
  });
  test("another organization's item, or a failed gate, is none — even for an org admin", () => {
    expect(driveItemRole(item("store", "me", OTHER_ORG), actor({ orgAdmin: true, admin: { view: true, edit: true } }))).toBe("none");
    expect(driveItemRole(item("store", "me"), actor({ gate: false, orgAdmin: true }))).toBe("none");
    expect(driveItemRole(item("store", ""), actor({ memberId: "" }))).toBe("contributor"); // '' never matches the owner
  });
  test("space roots", () => {
    expect(rootItem(ORG, "store", "me")).toEqual({ organizationId: ORG, ownerMemberId: "", space: "store" });
    expect(driveItemRole(rootItem(ORG, "store", ""), actor())).toBe("contributor");
    expect(driveItemRole(rootItem(ORG, "my", "me"), actor())).toBe("manager");
    expect(driveItemRole(rootItem(ORG, "my", "someone"), actor())).toBe("none");
    expect(driveItemRole(rootItem(ORG, "my", "someone"), actor({ admin: { view: true, edit: false } }))).toBe("viewer");
  });
  test("minimums", () => {
    expect(minDriveRole("manager", "contributor")).toBe("contributor");
    expect(minDriveRole("none", "editor")).toBe("none");
    expect(minDocRole("commenter", "editor")).toBe("commenter");
    expect(minDocRole("manager", "manager")).toBe("manager");
  });
  test("DRIVE_DOC_ROLE_RANK equals index.ts DOC_ROLE_RANK", () => {
    const server = loadServerDeclarations(["DOC_ROLE_RANK"]);
    expect(server).not.toBeNull();
    expect({ ...DRIVE_DOC_ROLE_RANK }).toEqual({ ...(server?.DOC_ROLE_RANK as object) });
  });
});

describe("tree walks", () => {
  // root ─ a ─ a1 ─ a1x
  //      │    └ a2 (trashed) ─ a2x
  //      └ b (file)
  const tree: Record<string, { id: string; kind: string; trashed: boolean; parent: string }> = {
    a: { id: "a", kind: "folder", trashed: false, parent: "" },
    a1: { id: "a1", kind: "folder", trashed: false, parent: "a" },
    a1x: { id: "a1x", kind: "file", trashed: false, parent: "a1" },
    a2: { id: "a2", kind: "folder", trashed: true, parent: "a" },
    a2x: { id: "a2x", kind: "file", trashed: true, parent: "a2" },
    b: { id: "b", kind: "file", trashed: false, parent: "" },
  };
  const childrenOf = (id: string) => Object.values(tree).filter((n) => n.parent === id);
  const parentOf = (id: string) => tree[id]?.parent;

  test("collectSubtree stops at already-trashed descendants and caps the size", () => {
    expect(collectSubtree(["a"], childrenOf, 100)).toEqual(["a", "a1", "a1x"]);
    expect(collectSubtree(["a", "b", "a"], childrenOf, 100)).toEqual(["a", "b", "a1", "a1x"]);
    expect(collectSubtree(["a2"], childrenOf, 100)).toEqual(["a2"]); // a trashed root is the caller's to decide
    expect(collectSubtree(["a"], childrenOf, 3)).toEqual(["a", "a1", "a1x"]);
    expect(collectSubtree(["a"], childrenOf, 2)).toBeNull();
    expect(collectSubtree(["a", "b"], childrenOf, 1)).toBeNull();
  });
  test("isAncestorOrSelf and depthOf", () => {
    expect(isAncestorOrSelf("a", "a1", parentOf, DRIVE_MAX_DEPTH)).toBe(true);
    expect(isAncestorOrSelf("a1", "a1", parentOf, DRIVE_MAX_DEPTH)).toBe(true);
    expect(isAncestorOrSelf("a1", "a", parentOf, DRIVE_MAX_DEPTH)).toBe(false);
    expect(isAncestorOrSelf("a", "", parentOf, DRIVE_MAX_DEPTH)).toBe(false);
    expect(depthOf("", parentOf)).toBe(0);
    expect(depthOf("a", parentOf)).toBe(1);
    expect(depthOf("a1", parentOf)).toBe(2);
    const loop = (id: string) => (id === "x" ? "y" : "x");
    expect(depthOf("x", loop)).toBe(Number.POSITIVE_INFINITY);
    expect(isAncestorOrSelf("z", "x", loop, DRIVE_MAX_DEPTH)).toBe(true); // a loop refuses the move
  });
});

describe("spaceMoveAllowed (Q3)", () => {
  const base = { subtreeOwners: [] as string[], actorOrgAdmin: false, fromOwnerActive: true };
  const allowed = (over: Partial<Parameters<typeof spaceMoveAllowed>[0]> & { fromSpace: string; fromOwner: string; toSpace: string; toOwner: string; actorMemberId: string }) =>
    spaceMoveAllowed({ ...base, ...over });

  test("same container: always", () => {
    expect(allowed({ fromSpace: "store", fromOwner: "", toSpace: "store", toOwner: "", actorMemberId: "x" })).toBe(true);
    expect(allowed({ fromSpace: "my", fromOwner: "o", toSpace: "my", toOwner: "o", actorMemberId: "x" })).toBe(true);
  });
  test("into my of O: every row already O's, actor O or an org admin", () => {
    const into = { fromSpace: "store", fromOwner: "", toSpace: "my", toOwner: "o" };
    expect(allowed({ ...into, subtreeOwners: ["o", "o"], actorMemberId: "o" })).toBe(true);
    expect(allowed({ ...into, subtreeOwners: ["o"], actorMemberId: "admin", actorOrgAdmin: true })).toBe(true);
    expect(allowed({ ...into, subtreeOwners: ["o", "colleague"], actorMemberId: "o" })).toBe(false);
    expect(allowed({ ...into, subtreeOwners: ["o"], actorMemberId: "colleague" })).toBe(false);
    expect(allowed({ fromSpace: "my", fromOwner: "p", toSpace: "my", toOwner: "o", subtreeOwners: ["p"], actorMemberId: "admin", actorOrgAdmin: true })).toBe(false);
    expect(allowed({ ...into, toOwner: "", actorMemberId: "o" })).toBe(false);
  });
  test("my of O → store: O, or an org admin rescuing a departed O", () => {
    const out = { fromSpace: "my", fromOwner: "o", toSpace: "store", toOwner: "", subtreeOwners: ["o"] };
    expect(allowed({ ...out, actorMemberId: "o" })).toBe(true);
    expect(allowed({ ...out, actorMemberId: "admin", actorOrgAdmin: true })).toBe(false);
    expect(allowed({ ...out, actorMemberId: "admin", actorOrgAdmin: true, fromOwnerActive: false })).toBe(true);
    expect(allowed({ ...out, actorMemberId: "colleague", fromOwnerActive: false })).toBe(false);
  });
  test("unknown spaces are refused", () => {
    expect(allowed({ fromSpace: "shared", fromOwner: "", toSpace: "store", toOwner: "", actorMemberId: "x" })).toBe(false);
  });
});
