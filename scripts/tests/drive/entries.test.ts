// components/drive/model/entries.ts — the entry list (the actor's access on every row) and the tree over it.
import { describe, expect, test } from "bun:test";
import {
  buildDriveEntries,
  buildDriveTree,
  containerKey,
  folderContainer,
  type BuildDriveEntriesInput,
} from "@/components/drive/model/entries";
import type { DocEntry, DriveEntry, FileEntry, FolderEntry } from "@/components/drive/model/types";
import { resolveDocAccess, type DocsGatePermissions } from "@/lib/docs/access";
import type { DocAccessGrant, DocumentMeta } from "@/lib/docs/types";
import { driveAdminAccess, resolveDriveItemAccess, type DriveClientActor } from "@/lib/drive/access";
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
const VIEWER: Member = { id: uuid(), role: "staff", permissions: { ...GATE, drive: { view: true } } };

function item(patch: Partial<DriveItem> = {}): DriveItem {
  return {
    id: uuid(), organizationId: ORG, space: "my", parentId: "", kind: "file", name: "a.pdf", mimeType: "application/pdf",
    sizeBytes: 10, blobKey: "", thumbKey: "", thumbBytes: 0, etag: "e", ownerMemberId: ANA.id, createdByMemberId: ANA.id,
    uploaderIdentityHex: "aa", status: "ready", uploadExpiresAt: new Date(0), uploadAttempts: 1, trashed: false,
    trashRootId: "", trashedAt: null, trashedByMemberId: "", createdAt: new Date(1_000), updatedAt: new Date(2_000),
    lastEditorMemberId: ANA.id, ...patch,
  };
}
const folder = (patch: Partial<DriveItem> = {}) => item({ kind: "folder", name: "F", mimeType: "", sizeBytes: 0, ...patch });

function doc(patch: Partial<DocumentMeta> = {}): DocumentMeta {
  return {
    id: uuid(), organizationId: ORG, ownerMemberId: ANA.id, title: "Doc", excerpt: "", icon: null, visibility: "private",
    templateId: null, pageSetup: null, wordCount: 0, createdAt: new Date(1_000), updatedAt: new Date(3_000),
    lastEditorMemberId: null, trashedAt: null, trashedByMemberId: null, fileType: "doc", folderId: "", ...patch,
  };
}

const clientActor = (m: Member): DriveClientActor => {
  const admin = driveAdminAccess(m.role, m.permissions);
  return { organizationId: ORG, memberId: m.id, role: m.role, gate: m.role === "owner" || m.permissions?.dashboard?.view === true, canViewAll: admin.view, canEditAll: admin.edit };
};
const docAccessFor = (m: Member, grants: readonly DocAccessGrant[]) => (d: DocumentMeta) =>
  resolveDocAccess({ doc: d, memberId: m.id, orgRole: m.role, permissions: m.permissions, grants });

interface World {
  items?: DriveItem[]; docs?: DocumentMeta[]; grants?: DocAccessGrant[]; actor: Member; tablet?: Member;
  surface?: "manager" | "store" | "personal"; starredItems?: string[]; starredDocs?: string[];
  opened?: [string, number][]; local?: string[];
}

/** buildDriveEntries over rows filtered the way useDrive filters them. */
function build(w: World): DriveEntry[] {
  const items = w.items ?? [];
  const grants = w.grants ?? [];
  const access = docAccessFor(w.actor, grants);
  const all = w.docs ?? [];
  const input: BuildDriveEntriesInput = {
    drive: {
      items,
      itemsById: new Map(items.map((i) => [i.id, i])),
      documents: all.filter((d) => !d.trashedAt && access(d).canView),
      trashedDocuments: all.filter((d) => d.trashedAt && access(d).canManage),
      grants,
      starredItemIds: new Set(w.starredItems ?? []),
      starredDocumentIds: new Set(w.starredDocs ?? []),
      accessForItem: (i) => resolveDriveItemAccess(i, clientActor(w.actor)),
      accessForDocument: access,
      admin: driveAdminAccess(w.actor.role, w.actor.permissions),
    },
    ceiling: w.tablet
      ? { item: (i) => resolveDriveItemAccess(i, clientActor(w.tablet!)), doc: docAccessFor(w.tablet, grants) }
      : null,
    actor: { memberId: w.actor.id, surface: w.surface ?? "manager", acting: !!w.tablet || w.surface === "store" },
    memberNames: new Map([[ANA.id, "Ana"], [BEN.id, "Ben"]]),
    openedMap: new Map(w.opened ?? []),
    localUploadIds: new Set(w.local ?? []),
  };
  return buildDriveEntries(input);
}

const byId = (entries: readonly DriveEntry[], id: string) => entries.find((e) => e.id === id);
const keys = (entries: readonly DriveEntry[]) => entries.map((e) => e.key).sort();

describe("buildDriveEntries — rows", () => {
  test("pending uploads only for the actor who started them; local vs elsewhere", () => {
    const mineHere = item({ status: "pending" });
    const mineThere = item({ status: "pending" });
    const benPending = item({ status: "pending", space: "store", ownerMemberId: BEN.id, createdByMemberId: BEN.id });
    const entries = build({ items: [mineHere, mineThere, benPending], actor: ANA, local: [mineHere.id] });
    expect((byId(entries, mineHere.id) as FileEntry).uploading).toBe("local");
    expect((byId(entries, mineThere.id) as FileEntry).uploading).toBe("elsewhere");
    expect(byId(entries, benPending.id)).toBeUndefined();
    expect(byId(entries, mineHere.id)!.access.canOpen).toBe(false);
    expect(byId(entries, mineHere.id)!.access.canRename).toBe(false);
  });

  test("documents of an unknown type are dropped; space and folder come from the document", () => {
    const f = folder();
    const benFolder = folder({ ownerMemberId: BEN.id });
    const unknown = doc({ fileType: "unknown" });
    const inFolder = doc({ folderId: f.id, fileType: "sheet" });
    const stale = doc({ folderId: uuid() });
    const wrongOwner = doc({ folderId: benFolder.id });
    const store = doc({ visibility: "org_edit", ownerMemberId: BEN.id, fileType: "slides" });
    const entries = build({ items: [f, benFolder], docs: [unknown, inFolder, stale, wrongOwner, store], actor: ANA });
    expect(byId(entries, unknown.id)).toBeUndefined();
    expect(byId(entries, inFolder.id)!.type).toBe("sheet");
    expect(byId(entries, inFolder.id)!.location).toEqual({ space: "my", ownerMemberId: ANA.id, parentId: f.id });
    expect(byId(entries, stale.id)!.location!.parentId).toBe("");
    expect(byId(entries, wrongOwner.id)!.location!.parentId).toBe("");
    expect(byId(entries, store.id)!.location).toEqual({ space: "store", ownerMemberId: "", parentId: "" });
    expect(byId(entries, store.id)!.type).toBe("slides");
  });

  test("keys, names, owners, stars, opened times and shared-with-me", () => {
    const file = item({ space: "store", ownerMemberId: BEN.id });
    const shared = doc({ ownerMemberId: BEN.id });
    const grant: DocAccessGrant = { id: "g", documentId: shared.id, organizationId: ORG, memberId: ANA.id, role: "viewer", grantedByMemberId: BEN.id, createdAt: new Date(0), updatedAt: new Date(0) };
    const mine = doc();
    const entries = build({ items: [file], docs: [shared, mine], grants: [grant], actor: ANA, starredItems: [file.id], opened: [[mine.id, 9_000]] });
    const f = byId(entries, file.id)!;
    expect(f.key).toBe(`item:${file.id}`);
    expect([f.ownerName, f.isMine, f.starred, f.createdAt, f.updatedAt]).toEqual(["Ben", false, true, 1_000, 2_000]);
    const s = byId(entries, shared.id) as DocEntry;
    expect([s.key, s.sharedWithMe, s.hasGrants]).toEqual([`doc:${shared.id}`, true, true]);
    const m = byId(entries, mine.id) as DocEntry;
    expect([m.sharedWithMe, m.hasGrants, m.isMine, m.openedAt]).toEqual([false, false, true, 9_000]);
  });

  test("rows the actor cannot view are not entries (a colleague's My files)", () => {
    const bens = item({ ownerMemberId: BEN.id });
    const bensDoc = doc({ ownerMemberId: BEN.id });
    expect(build({ items: [bens], docs: [bensDoc], actor: ANA })).toEqual([]);
    expect(build({ items: [bens], docs: [bensDoc], actor: VIEWER }).length).toBe(2);
  });
});

describe("buildDriveEntries — item access (C21)", () => {
  const benStore = item({ space: "store", ownerMemberId: BEN.id });
  const benMy = item({ ownerMemberId: BEN.id });
  const access = (actor: Member, row: DriveItem) => byId(build({ items: [row], actor }), row.id)!.access;

  test("viewer: open and download only", () => {
    expect(access(VIEWER, benMy)).toEqual({
      canOpen: true, canDownload: true, canRename: false, canMove: false, canTrash: false, canRestore: false,
      canDeleteForever: false, canShare: false, canStar: true, canAddChildren: false,
    });
  });

  test("contributor on a colleague's Store file: no rename, move or trash", () => {
    const a = access(ANA, benStore);
    expect([a.canOpen, a.canRename, a.canMove, a.canTrash]).toEqual([true, false, false, false]);
  });

  test("editor (drive.edit): rename and move, never trash", () => {
    const a = access(EDITOR, benMy);
    expect([a.canRename, a.canMove, a.canTrash]).toEqual([true, true, false]);
  });

  test("manager (owner of the row, or org owner/manager): trash", () => {
    expect(access(BEN, benStore).canTrash).toBe(true);
    expect(access(MANAGER, benMy).canTrash).toBe(true);
    expect(access(OWNER, benMy).canTrash).toBe(true);
  });

  test("folders are never downloads; add-children needs contributor on a live folder", () => {
    const store = folder({ space: "store", ownerMemberId: BEN.id });
    const a = access(ANA, store);
    expect([a.canDownload, a.canAddChildren]).toEqual([false, true]);
    expect(access(VIEWER, folder({ ownerMemberId: BEN.id })).canAddChildren).toBe(false);
  });

  test("trashing a folder needs manager on every live row inside", () => {
    const shared = folder({ space: "store" });
    const bensFile = item({ space: "store", parentId: shared.id, ownerMemberId: BEN.id });
    const mineInside = item({ space: "store", parentId: shared.id });
    const bensTrashed = item({ space: "store", parentId: shared.id, ownerMemberId: BEN.id, trashed: true, trashRootId: "x" });
    const rows = [shared, bensFile, mineInside];
    expect(byId(build({ items: rows, actor: ANA }), shared.id)!.access.canTrash).toBe(false);
    expect(byId(build({ items: rows, actor: MANAGER }), shared.id)!.access.canTrash).toBe(true);
    // Already-trashed rows are separate trash roots: they don't block.
    expect(byId(build({ items: [shared, mineInside, { ...bensTrashed, trashRootId: bensTrashed.id }], actor: ANA }), shared.id)!.access.canTrash).toBe(true);
    // A document inside counts too.
    const bensDoc = doc({ ownerMemberId: BEN.id, visibility: "org_edit", folderId: shared.id });
    expect(byId(build({ items: [shared, mineInside], docs: [bensDoc], actor: ANA }), shared.id)!.access.canTrash).toBe(false);
    // Nested: a folder two levels down holding Ben's file.
    const sub = folder({ space: "store", parentId: shared.id });
    const deep = item({ space: "store", parentId: sub.id, ownerMemberId: BEN.id });
    expect(byId(build({ items: [shared, sub, deep], actor: ANA }), shared.id)!.access.canTrash).toBe(false);
    expect(byId(build({ items: [shared, sub], actor: ANA }), shared.id)!.access.canTrash).toBe(true);
  });

  test("restore and delete forever only on the trash root, with manager", () => {
    const root = folder({ trashed: true, trashRootId: "", trashedAt: new Date(5_000) });
    const rootRow = { ...root, trashRootId: root.id };
    const child = item({ parentId: root.id, trashed: true, trashRootId: root.id, trashedAt: new Date(5_000) });
    const entries = build({ items: [rootRow, child], actor: ANA });
    expect(byId(entries, root.id)!.access.canRestore).toBe(true);
    expect(byId(entries, root.id)!.access.canDeleteForever).toBe(true);
    expect(byId(entries, root.id)!.trashedAt).toBe(5_000);
    expect(byId(entries, child.id)!.access.canRestore).toBe(false);
    expect(byId(entries, child.id)!.access.canStar).toBe(false);
    const benRoot = item({ ownerMemberId: BEN.id, trashed: true, trashedAt: new Date(1) });
    const benRow = { ...benRoot, trashRootId: benRoot.id };
    expect(byId(build({ items: [benRow], actor: EDITOR }), benRoot.id)!.access.canRestore).toBe(false);
    expect(byId(build({ items: [benRow], actor: MANAGER }), benRoot.id)!.access.canRestore).toBe(true);
  });

  test("delete forever on a folder also needs manager on every item trashed with it; restore does not", () => {
    const root = folder({ space: "store", ownerMemberId: VIEWER.id, createdByMemberId: VIEWER.id, trashed: true, trashedAt: new Date(5_000) });
    const rootRow = { ...root, trashRootId: root.id };
    const stamped = { parentId: root.id, trashed: true, trashRootId: root.id, trashedAt: new Date(5_000) };
    const mine = item({ space: "store", ownerMemberId: VIEWER.id, createdByMemberId: VIEWER.id, ...stamped });
    const bens = item({ space: "store", ownerMemberId: BEN.id, createdByMemberId: BEN.id, ...stamped });
    const flags = (actor: Member, rows: DriveItem[]) => {
      const a = byId(build({ items: rows, actor }), root.id)!.access;
      return [a.canRestore, a.canDeleteForever];
    };
    expect(flags(VIEWER, [rootRow, mine])).toEqual([true, true]);
    // Ben's file went to the trash with the folder; the owner of the folder only contributes to it.
    expect(flags(VIEWER, [rootRow, mine, bens])).toEqual([true, false]);
    expect(flags(MANAGER, [rootRow, mine, bens])).toEqual([true, true]);
    // A row trashed on its own (its own root) does not count.
    const separate = { ...bens, trashRootId: bens.id };
    expect(flags(VIEWER, [rootRow, mine, separate])).toEqual([true, true]);
  });
});

describe("buildDriveEntries — document access", () => {
  test("rename needs editor, trash manager; moves need manager or editor + drive.edit", () => {
    const storeDoc = doc({ ownerMemberId: BEN.id, visibility: "org_edit" });
    const a = byId(build({ docs: [storeDoc], actor: ANA }), storeDoc.id)!.access;
    expect([a.canOpen, a.canRename, a.canMove, a.canTrash, a.canDownload]).toEqual([true, true, false, false, false]);
    const e = byId(build({ docs: [storeDoc], actor: EDITOR }), storeDoc.id)!.access;
    expect([e.canMove, e.canTrash]).toEqual([true, false]);
    const o = byId(build({ docs: [storeDoc], actor: BEN }), storeDoc.id)!.access;
    expect([o.canMove, o.canTrash]).toEqual([true, true]);
  });

  test("no star while acting for an operator; share on the manager page only", () => {
    const d = doc();
    const manager = byId(build({ docs: [d], actor: ANA }), d.id)!.access;
    expect([manager.canStar, manager.canShare]).toEqual([true, true]);
    const store = byId(build({ docs: [d], actor: ANA, surface: "store" }), d.id)!.access;
    expect([store.canStar, store.canShare]).toEqual([false, false]);
    const personal = byId(build({ docs: [d], actor: ANA, surface: "personal" }), d.id)!.access;
    expect([personal.canStar, personal.canShare]).toEqual([true, false]);
  });

  test("trashed documents: restore and delete forever for managers", () => {
    const t = doc({ trashedAt: new Date(7_000) });
    const e = byId(build({ docs: [t], actor: ANA }), t.id)!;
    expect(e.trashedAt).toBe(7_000);
    expect([e.access.canRestore, e.access.canDeleteForever, e.access.canTrash, e.access.canRename]).toEqual([true, true, false, false]);
  });
});

describe("buildDriveEntries — store tablet ceiling", () => {
  test("staff tablet: the lower of the operator's and the account's rights", () => {
    const opFile = item({ space: "store", ownerMemberId: ANA.id });
    const e = byId(build({ items: [opFile], actor: ANA, tablet: BEN, surface: "store" }), opFile.id)!;
    // Ana owns it (manager), the tablet account Ben is only a contributor: no rename, move or trash.
    expect([e.access.canOpen, e.access.canRename, e.access.canMove, e.access.canTrash]).toEqual([true, false, false, false]);
    expect(byId(build({ items: [opFile], actor: ANA, surface: "store" }), opFile.id)!.access.canRename).toBe(true);
  });

  test("the operator never sees the tablet account's own My files, stars or trash", () => {
    const accountsFile = item({ ownerMemberId: BEN.id });
    const accountsDoc = doc({ ownerMemberId: BEN.id });
    const accountsTrash = doc({ ownerMemberId: BEN.id, trashedAt: new Date(1) });
    expect(build({ items: [accountsFile], docs: [accountsDoc, accountsTrash], actor: ANA, tablet: BEN, surface: "store" })).toEqual([]);
  });

  test("documents take the lower role too", () => {
    const opDoc = doc({ visibility: "org_edit" });
    const e = byId(build({ docs: [opDoc], actor: ANA, tablet: BEN, surface: "store" }), opDoc.id) as DocEntry;
    expect(e.docAccess.role).toBe("editor");
    expect([e.access.canRename, e.access.canTrash, e.access.canMove]).toEqual([true, false, false]);
  });
});

describe("buildDriveTree", () => {
  test("containerKey and folderContainer", () => {
    expect(containerKey({ space: "my", ownerMemberId: "o", parentId: "p" })).toBe("my:o:p");
    expect(containerKey({ space: "store", ownerMemberId: "ignored", parentId: "" })).toBe("store::");
    const f = folder({ space: "store" });
    const entry = byId(build({ items: [f], actor: ANA }), f.id) as FolderEntry;
    expect(folderContainer(entry)).toEqual({ space: "store", ownerMemberId: "", parentId: f.id });
  });

  test("children, path, descendants and trashed ancestors", () => {
    const a = folder();
    const b = folder({ parentId: a.id });
    const c = item({ parentId: b.id });
    const d = doc({ folderId: b.id });
    const gone = item({ parentId: a.id, trashed: true, trashedAt: new Date(1) });
    const goneRow = { ...gone, trashRootId: gone.id };
    const tree = buildDriveTree(build({ items: [a, b, c, goneRow], docs: [d], actor: ANA }));
    const root = { space: "my" as const, ownerMemberId: ANA.id, parentId: "" };
    expect(keys(tree.childrenOf(root))).toEqual([`item:${a.id}`]);
    expect(keys(tree.childrenOf({ ...root, parentId: a.id }))).toEqual([`item:${b.id}`]);
    expect(tree.pathOf(tree.byKey.get(`item:${c.id}`)!).map((f) => f.id)).toEqual([a.id, b.id]);
    expect(keys(tree.descendantsOf(tree.folders.get(a.id)!))).toEqual(keys([tree.byKey.get(`item:${b.id}`)!, tree.byKey.get(`item:${c.id}`)!, tree.byKey.get(`doc:${d.id}`)!]));
    expect(tree.hasTrashedAncestor(tree.byKey.get(`item:${c.id}`)!)).toBe(false);
    expect(tree.hasTrashedAncestor(tree.byKey.get(`item:${gone.id}`)!)).toBe(true);
  });

  test("a trashed folder's descendants are what went to the trash with it", () => {
    const t = folder({ trashed: true, trashedAt: new Date(1) });
    const tRow = { ...t, trashRootId: t.id };
    const inner = item({ parentId: t.id, trashed: true, trashRootId: t.id, trashedAt: new Date(1) });
    const tree = buildDriveTree(build({ items: [tRow, inner], actor: ANA }));
    expect(tree.descendantsOf(tree.folders.get(t.id)!).map((e) => e.id)).toEqual([inner.id]);
    expect(tree.hasTrashedAncestor(tree.byKey.get(`item:${inner.id}`)!)).toBe(true);
    expect(tree.childrenOf({ space: "my", ownerMemberId: ANA.id, parentId: t.id })).toEqual([]);
  });

  test("cycles in parent pointers don't hang pathOf or descendantsOf", () => {
    const x = folder();
    const y = folder({ parentId: x.id });
    const loopX = { ...x, parentId: y.id };
    const tree = buildDriveTree(build({ items: [loopX, y], actor: ANA }));
    const fx = tree.folders.get(x.id)!;
    expect(tree.pathOf(fx).map((f) => f.id)).toEqual([y.id]);
    expect(tree.descendantsOf(fx).map((e) => e.id)).toEqual([y.id]);
    // The loop sits nowhere reachable from the root.
    expect(tree.childrenOf({ space: "my", ownerMemberId: ANA.id, parentId: "" })).toEqual([]);
    // And the entries pass finished (the subtree check is cycle-safe too).
    expect(tree.folders.get(y.id)!.access.canTrash).toBe(true);
  });

  test("virtual entries are listed by key only", () => {
    const v = {
      key: "v:bugs:abc", id: "abc", name: "Shot", createdAt: 0, updatedAt: 0, ownerMemberId: "", ownerName: null, isMine: false,
      starred: false, trashedAt: null, openedAt: null, location: null,
      access: { canOpen: true, canDownload: true, canRename: false, canMove: false, canTrash: false, canRestore: false, canDeleteForever: false, canShare: false, canStar: false, canAddChildren: false },
      type: "virtual" as const, source: "bugs" as const, url: "https://x.test/a.png", fileKind: "image" as const, mimeType: "image/png",
      group: "", originRoute: "/manager/bugs",
    };
    const tree = buildDriveTree([v]);
    expect(tree.byKey.get(v.key)).toBe(v);
    expect(tree.childrenOf({ space: "store", ownerMemberId: "", parentId: "" })).toEqual([]);
  });
});
