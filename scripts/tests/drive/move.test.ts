// components/drive/model/move.ts — where a selection may move (dialog, drag and drop, space shortcuts).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildDriveEntries, buildDriveTree, type DriveTree } from "@/components/drive/model/entries";
import { MOVE_BLOCK_I18N, canDropOn, moveRoots, planMove, type MoveActor } from "@/components/drive/model/move";
import type { DriveEntry, DriveMoveTarget, VirtualEntry } from "@/components/drive/model/types";
import { resolveDocAccess, type DocsGatePermissions } from "@/lib/docs/access";
import type { DocumentMeta } from "@/lib/docs/types";
import { driveAdminAccess, isOrgAdminRole, resolveDriveItemAccess } from "@/lib/drive/access";
import { DRIVE_MAX_DEPTH } from "@/lib/drive/rules";
import type { DriveItem } from "@/lib/drive/types";
import type { OrgRole } from "@/lib/types";

const ORG = "org-1";
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
interface Member { id: string; role: OrgRole; permissions?: DocsGatePermissions }
const GATE: DocsGatePermissions = { dashboard: { view: true } };
const OWNER: Member = { id: uuid(), role: "owner" };
const MANAGER: Member = { id: uuid(), role: "manager", permissions: GATE };
const ANA: Member = { id: uuid(), role: "staff", permissions: GATE };
const BEN: Member = { id: uuid(), role: "staff", permissions: GATE };
const EDITOR: Member = { id: uuid(), role: "staff", permissions: { ...GATE, drive: { view: true, edit: true } } };
const FORMER = uuid();
const ACTIVE = new Set([OWNER.id, MANAGER.id, ANA.id, BEN.id, EDITOR.id]);

function item(patch: Partial<DriveItem> = {}): DriveItem {
  return {
    id: uuid(), organizationId: ORG, space: "my", parentId: "", kind: "file", name: "a.pdf", mimeType: "application/pdf",
    sizeBytes: 10, blobKey: "", thumbKey: "", thumbBytes: 0, etag: "e", ownerMemberId: ANA.id, createdByMemberId: ANA.id,
    uploaderIdentityHex: "aa", status: "ready", uploadExpiresAt: new Date(0), uploadAttempts: 1, trashed: false,
    trashRootId: "", trashedAt: null, trashedByMemberId: "", createdAt: new Date(0), updatedAt: new Date(0),
    lastEditorMemberId: ANA.id, ...patch,
  };
}
const folder = (patch: Partial<DriveItem> = {}) => item({ kind: "folder", name: "F", mimeType: "", sizeBytes: 0, ...patch });
function doc(patch: Partial<DocumentMeta> = {}): DocumentMeta {
  return {
    id: uuid(), organizationId: ORG, ownerMemberId: ANA.id, title: "Doc", excerpt: "", icon: null, visibility: "private",
    templateId: null, pageSetup: null, wordCount: 0, createdAt: new Date(0), updatedAt: new Date(0),
    lastEditorMemberId: null, trashedAt: null, trashedByMemberId: null, fileType: "doc", folderId: "", ...patch,
  };
}

function treeFor(actor: Member, items: DriveItem[], docs: DocumentMeta[] = []): DriveTree {
  const docAccess = (d: DocumentMeta) => resolveDocAccess({ doc: d, memberId: actor.id, orgRole: actor.role, permissions: actor.permissions, grants: [] });
  const admin = driveAdminAccess(actor.role, actor.permissions);
  return buildDriveTree(buildDriveEntries({
    drive: {
      items, itemsById: new Map(items.map((i) => [i.id, i])),
      documents: docs.filter((d) => !d.trashedAt && docAccess(d).canView), trashedDocuments: [], grants: [],
      starredItemIds: new Set(), starredDocumentIds: new Set(),
      accessForItem: (i) => resolveDriveItemAccess(i, { organizationId: ORG, memberId: actor.id, role: actor.role, gate: true, canViewAll: admin.view, canEditAll: admin.edit }),
      accessForDocument: docAccess, admin,
    },
    ceiling: null,
    actor: { memberId: actor.id, surface: "manager", acting: false },
    memberNames: new Map(), openedMap: new Map(), localUploadIds: new Set(),
  }));
}

const moveActor = (m: Member, patch: Partial<MoveActor> = {}): MoveActor => ({
  memberId: m.id, orgAdmin: isOrgAdminRole(m.role), canEditAll: driveAdminAccess(m.role, m.permissions).edit,
  isActiveMember: (id) => ACTIVE.has(id), ...patch,
});
const at = (tree: DriveTree, row: { id: string }, kind: "item" | "doc" = "item"): DriveEntry => tree.byKey.get(`${kind}:${row.id}`)!;
const myRoot = (owner: string): DriveMoveTarget => ({ space: "my", parentId: "", ownerMemberId: owner });
const STORE_ROOT: DriveMoveTarget = { space: "store", parentId: "", ownerMemberId: "" };
const into = (f: DriveItem): DriveMoveTarget => ({ space: f.space, parentId: f.id, ownerMemberId: f.space === "my" ? f.ownerMemberId : "" });
const blocked = (tree: DriveTree, entries: DriveEntry[], target: DriveMoveTarget, actor: MoveActor) => planMove(entries, target, tree, actor).blocked;

describe("planMove — blocks", () => {
  test("into itself or a folder inside it", () => {
    const a = folder();
    const b = folder({ parentId: a.id });
    const tree = treeFor(ANA, [a, b]);
    expect(blocked(tree, [at(tree, a)], into(a), moveActor(ANA))).toBe("intoSelf");
    expect(blocked(tree, [at(tree, a)], into(b), moveActor(ANA))).toBe("intoDescendant");
  });

  test("a stale concurrent cycle: A→B planned after B→A landed", () => {
    const a = folder();
    const b = folder({ parentId: a.id }); // B→A already happened
    const tree = treeFor(ANA, [a, b]);
    expect(blocked(tree, [at(tree, a)], into(b), moveActor(ANA))).toBe("intoDescendant");
    expect(canDropOn([at(tree, a)], into(b), tree, moveActor(ANA))).toBe(false);
  });

  test("a trashed target, or one inside a trashed folder", () => {
    const t = folder({ trashed: true, trashedAt: new Date(1) });
    const tRow = { ...t, trashRootId: t.id };
    const u = folder({ parentId: t.id, trashed: true, trashRootId: t.id, trashedAt: new Date(1) });
    const file = item();
    const tree = treeFor(ANA, [tRow, u, file]);
    expect(blocked(tree, [at(tree, file)], into(tRow), moveActor(ANA))).toBe("targetTrashed");
    expect(blocked(tree, [at(tree, file)], into(u), moveActor(ANA))).toBe("targetTrashed");
  });

  test("targets the actor can't add to", () => {
    const bensStoreFolder = folder({ space: "store", ownerMemberId: BEN.id });
    const file = item({ space: "store" });
    const tree = treeFor(ANA, [bensStoreFolder, file]);
    // A colleague's Store folder takes contributions; their My files don't.
    expect(blocked(tree, [at(tree, file)], into(bensStoreFolder), moveActor(ANA))).toBeNull();
    expect(blocked(tree, [at(tree, file)], myRoot(BEN.id), moveActor(ANA))).toBe("targetNotWritable");
    expect(blocked(tree, [at(tree, file)], { space: "store", parentId: uuid(), ownerMemberId: "" }, moveActor(ANA))).toBe("targetNotWritable");
    // A folder named with the wrong space.
    expect(blocked(tree, [at(tree, file)], { space: "my", parentId: bensStoreFolder.id, ownerMemberId: "" }, moveActor(ANA))).toBe("targetNotWritable");
    // A store tablet without My files; a departed member's root.
    expect(blocked(tree, [at(tree, file)], myRoot(ANA.id), moveActor(ANA, { storeOnly: true }))).toBe("targetNotWritable");
    const mgrTree = treeFor(MANAGER, [file]);
    expect(blocked(mgrTree, [at(mgrTree, file)], myRoot(FORMER), moveActor(MANAGER))).toBe("targetNotWritable");
  });

  test("mixed owners, and a folder holding someone else's files (descendantOwners)", () => {
    const anas = item({ space: "store" });
    const bens = item({ space: "store", ownerMemberId: BEN.id });
    const box = folder({ space: "store" });
    const bensInside = item({ space: "store", parentId: box.id, ownerMemberId: BEN.id });
    const mgr = treeFor(MANAGER, [anas, bens]);
    expect(blocked(mgr, [at(mgr, anas), at(mgr, bens)], myRoot(ANA.id), moveActor(MANAGER))).toBe("mixedOwners");
    const ana = treeFor(ANA, [box, bensInside]);
    expect(blocked(ana, [at(ana, box)], myRoot(ANA.id), moveActor(ANA))).toBe("descendantOwners");
  });

  test("publishing a member's private file: the owner, or an admin rescuing a former member's", () => {
    const anas = item();
    const formers = item({ ownerMemberId: FORMER, createdByMemberId: FORMER });
    const mgr = treeFor(MANAGER, [anas, formers]);
    expect(blocked(mgr, [at(mgr, anas)], STORE_ROOT, moveActor(MANAGER))).toBe("spaceNotAllowed");
    expect(blocked(mgr, [at(mgr, formers)], STORE_ROOT, moveActor(MANAGER))).toBeNull();
    const ana = treeFor(ANA, [anas]);
    expect(planMove([at(ana, anas)], STORE_ROOT, ana, moveActor(ANA))).toMatchObject({ blocked: null, changesSpace: "toStore" });
  });

  test("C21: drive.edit moves inside the owner's files, never across spaces", () => {
    const f = folder({ ownerMemberId: BEN.id });
    const file = item({ ownerMemberId: BEN.id });
    const tree = treeFor(EDITOR, [f, file]);
    expect(blocked(tree, [at(tree, file)], into(f), moveActor(EDITOR))).toBeNull();
    expect(blocked(tree, [at(tree, file)], STORE_ROOT, moveActor(EDITOR))).toBe("noPermission");
  });

  test("documents inside a moved folder need a document's own move right", () => {
    const box = folder({ space: "store" });
    const target = folder({ space: "store" });
    const bensDoc = doc({ ownerMemberId: BEN.id, visibility: "org_view", folderId: box.id });
    const tree = treeFor(ANA, [box, target], [bensDoc]);
    expect(blocked(tree, [at(tree, box)], into(target), moveActor(ANA))).toBe("noPermission");
    const editable = treeFor(ANA, [box, target], [{ ...bensDoc, visibility: "org_edit" }]);
    expect(blocked(editable, [at(editable, box)], into(target), moveActor(ANA))).toBe("noPermission");
    const edTree = treeFor(EDITOR, [{ ...box, ownerMemberId: EDITOR.id }, target], [{ ...bensDoc, visibility: "org_edit" }]);
    expect(blocked(edTree, [at(edTree, box)], into(target), moveActor(EDITOR))).toBeNull();
  });

  test("unfinished uploads, selected or inside", () => {
    const pending = item({ status: "pending" });
    const box = folder();
    const inside = item({ parentId: box.id, status: "pending" });
    const target = folder();
    const tree = treeFor(ANA, [pending, box, inside, target]);
    expect(blocked(tree, [at(tree, pending)], into(target), moveActor(ANA))).toBe("notReady");
    expect(blocked(tree, [at(tree, box)], into(target), moveActor(ANA))).toBe("notReady");
  });

  test("too deep: the deepest moved item may not pass DRIVE_MAX_DEPTH", () => {
    const chain: DriveItem[] = [];
    for (let i = 0; i < DRIVE_MAX_DEPTH - 1; i++) chain.push(folder({ parentId: chain[i - 1]?.id ?? "" }));
    const deepest = chain[chain.length - 1];
    const box = folder();
    const inBox = item({ parentId: box.id });
    const single = item();
    const tree = treeFor(ANA, [...chain, box, inBox, single]);
    expect(blocked(tree, [at(tree, single)], into(deepest), moveActor(ANA))).toBeNull();
    expect(blocked(tree, [at(tree, box)], into(deepest), moveActor(ANA))).toBe("tooDeep");
  });

  test("already there; virtual entries never move", () => {
    const file = item();
    const tree = treeFor(ANA, [file]);
    expect(blocked(tree, [at(tree, file)], myRoot(ANA.id), moveActor(ANA))).toBe("sameLocation");
    expect(blocked(tree, [], myRoot(ANA.id), moveActor(ANA))).toBe("sameLocation");
    const v = { ...at(tree, file), type: "virtual", key: "v:bugs:x", location: null } as unknown as VirtualEntry;
    expect(blocked(tree, [at(tree, file), v], STORE_ROOT, moveActor(ANA))).toBe("virtual");
    expect(moveRoots([v], tree, moveActor(ANA))).toEqual({ my: null, store: null });
  });
});

describe("planMove — the plan", () => {
  test("ids, the resolved target and the affected counts include descendants", () => {
    const box = folder({ space: "store" });
    const a = item({ space: "store", parentId: box.id });
    const sub = folder({ space: "store", parentId: box.id });
    const b = item({ space: "store", parentId: sub.id });
    const inner = doc({ visibility: "org_edit", folderId: sub.id });
    const loose = doc({ visibility: "org_edit" });
    const tree = treeFor(ANA, [box, a, sub, b], [inner, loose]);
    const plan = planMove([at(tree, box), at(tree, loose, "doc"), at(tree, a)], { space: "my", parentId: "", ownerMemberId: "" }, tree, moveActor(ANA));
    expect(plan.itemIds).toEqual([box.id, a.id]);
    expect(plan.documentIds).toEqual([loose.id]);
    expect(plan.target).toEqual(myRoot(ANA.id));
    expect(plan.affected).toEqual({ items: 4, documents: 2 });
    expect([plan.changesSpace, plan.blocked]).toEqual(["toMy", null]);
  });

  test("a folder target takes the folder's space and owner", () => {
    const bensFolder = folder({ ownerMemberId: BEN.id });
    const bensFile = item({ ownerMemberId: BEN.id });
    const tree = treeFor(MANAGER, [bensFolder, bensFile]);
    const plan = planMove([at(tree, bensFile)], { space: "my", parentId: bensFolder.id, ownerMemberId: "" }, tree, moveActor(MANAGER));
    expect(plan.target).toEqual({ space: "my", parentId: bensFolder.id, ownerMemberId: BEN.id });
    expect([plan.blocked, plan.changesSpace]).toEqual([null, null]);
  });

  test("store tablet: the tablet account must pass the space rule too", () => {
    const anasPrivate = item();
    const anasStore = item({ space: "store" });
    const tree = treeFor(ANA, [anasPrivate, anasStore]);
    const onOwnerTablet = moveActor(ANA, { caller: { memberId: OWNER.id, orgAdmin: true } });
    expect(blocked(tree, [at(tree, anasPrivate)], STORE_ROOT, onOwnerTablet)).toBe("spaceNotAllowed");
    expect(blocked(tree, [at(tree, anasStore)], myRoot(ANA.id), onOwnerTablet)).toBeNull();
    expect(blocked(tree, [at(tree, anasStore)], myRoot(ANA.id), moveActor(ANA, { caller: { memberId: BEN.id, orgAdmin: false } }))).toBe("noPermission");
  });
});

describe("moveRoots", () => {
  test("one owner: their My root; Store when publishing is allowed", () => {
    const f = folder();
    const x = item({ parentId: f.id });
    const tree = treeFor(ANA, [f, x]);
    expect(moveRoots([at(tree, f)], tree, moveActor(ANA))).toEqual({ my: myRoot(ANA.id), store: STORE_ROOT });
    expect(moveRoots([at(tree, f)], tree, moveActor(ANA, { storeOnly: true }))).toEqual({ my: null, store: STORE_ROOT });
  });

  test("mixed owners: no My root", () => {
    const a = item({ space: "store" });
    const b = item({ space: "store", ownerMemberId: BEN.id });
    const tree = treeFor(MANAGER, [a, b]);
    expect(moveRoots([at(tree, a), at(tree, b)], tree, moveActor(MANAGER))).toEqual({ my: null, store: STORE_ROOT });
  });

  test("admins keep an active member's private files in that member's My files; a former member's may go to Store", () => {
    const anas = item();
    const formers = item({ ownerMemberId: FORMER });
    const tree = treeFor(MANAGER, [anas, formers]);
    expect(moveRoots([at(tree, anas)], tree, moveActor(MANAGER))).toEqual({ my: myRoot(ANA.id), store: null });
    expect(moveRoots([at(tree, formers)], tree, moveActor(MANAGER)).store).toEqual(STORE_ROOT);
  });

  test("C22: a Store file goes to its owner's My files for an org admin, not for drive.edit alone", () => {
    const bens = item({ space: "store", ownerMemberId: BEN.id });
    const tree = treeFor(MANAGER, [bens]);
    expect(moveRoots([at(tree, bens)], tree, moveActor(MANAGER)).my).toEqual(myRoot(BEN.id));
    expect(moveRoots([at(tree, bens)], tree, moveActor(MANAGER, { orgAdmin: false, canEditAll: true })).my).toBeNull();
  });
});

describe("MOVE_BLOCK_I18N", () => {
  test("every reason has a drive-ui copy key", () => {
    const en = JSON.parse(readFileSync("scripts/i18n/drive/drive-ui/en.json", "utf8")) as Record<string, unknown>;
    const lookup = (key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
    for (const [reason, key] of Object.entries(MOVE_BLOCK_I18N)) {
      expect(key).toBe(`drive.dialogs.blocked.${reason}`);
      expect(typeof lookup(key)).toBe("string");
    }
  });
});
