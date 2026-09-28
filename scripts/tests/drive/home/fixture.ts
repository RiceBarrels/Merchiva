// Shared data for the Drive home fixtures (home-render.isolated.tsx, home/actions.isolated.tsx,
// home/editors.isolated.ts): one store's members, folders, uploaded files and documents, turned into
// the entry tree by the real model code (buildDriveEntries / buildDriveTree) with the real access
// rules, plus an English translator over messages/en.json and every Drive i18n fragment.
//
// Imported only by the isolated fixtures (child processes); it installs no mock itself.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDriveEntries, buildDriveTree, type DriveTree } from "@/components/drive/model/entries";
import type { DriveEntry } from "@/components/drive/model/types";
import { docAccessFromRole, docRoleFor } from "@/lib/docs/access";
import type { DocumentMeta } from "@/lib/docs/types";
import { resolveDriveItemAccess, type DriveClientActor } from "@/lib/drive/access";
import type { DriveItem, DriveUsageView } from "@/lib/drive/types";
import { flattenMessages, leavesOf, loadFragments } from "@/scripts/i18n/drive/fragment";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");

export const ORG = "0a0a0a0a-0000-4000-8000-000000000001";
/** The signed-in owner. */
export const ME = "1b1b1b1b-0000-4000-8000-000000000001";
export const PRIYA = "2c2c2c2c-0000-4000-8000-000000000002";
/** Owns files but has no org_member row any more (left the store). */
export const GONE = "3d3d3d3d-0000-4000-8000-000000000003";
export const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const MEMBERS = [
  { id: ME, name: "Ana Ruiz", role: "owner", active: true },
  { id: PRIYA, name: "Priya Patel", role: "staff", active: true },
];

const DAY = 86_400_000;
const NOW = Date.now();

export function makeItem(patch: Partial<DriveItem> & Pick<DriveItem, "id" | "name" | "kind">): DriveItem {
  const file = patch.kind === "file";
  return {
    organizationId: ORG,
    space: "my",
    parentId: "",
    mimeType: file ? "application/pdf" : "",
    sizeBytes: file ? 2048 : 0,
    blobKey: file ? `org/${ORG}/${patch.id}/${uuid(999)}/file.bin` : "",
    thumbKey: "",
    thumbBytes: 0,
    etag: "",
    ownerMemberId: ME,
    createdByMemberId: ME,
    uploaderIdentityHex: "",
    status: "ready",
    uploadExpiresAt: new Date(NOW),
    uploadAttempts: 0,
    trashed: false,
    trashRootId: "",
    trashedAt: null,
    trashedByMemberId: "",
    createdAt: new Date(NOW - 3 * DAY),
    updatedAt: new Date(NOW - 2 * DAY),
    lastEditorMemberId: ME,
    ...patch,
  };
}

export function makeDoc(patch: Partial<DocumentMeta> & { id: string }): DocumentMeta {
  return {
    organizationId: ORG,
    ownerMemberId: ME,
    title: "",
    excerpt: "",
    icon: null,
    visibility: "private",
    templateId: null,
    pageSetup: null,
    wordCount: 0,
    createdAt: new Date(NOW - 3 * DAY),
    updatedAt: new Date(NOW - DAY),
    lastEditorMemberId: null,
    trashedAt: null,
    trashedByMemberId: null,
    fileType: "doc",
    folderId: "",
    ...patch,
  };
}

export interface FixtureOptions {
  items?: DriveItem[];
  docs?: DocumentMeta[];
  trashedDocs?: DocumentMeta[];
  status?: "checking" | "ready" | "not_published";
  isReady?: boolean;
  usage?: DriveUsageView | null;
  starredItemIds?: string[];
}

export const CLIENT_ACTOR: DriveClientActor = { organizationId: ORG, memberId: ME, role: "owner", gate: true, canViewAll: true, canEditAll: true };

/** The owner acting for themself on /manager (components/drive/drive-actor.tsx DriveActor). */
export const MANAGER_ACTOR = {
  memberId: ME,
  actingMemberId: "",
  acting: false,
  role: "owner" as const,
  surface: "manager" as const,
  canViewAll: true,
  canEditAll: true,
  ceiling: null,
  ready: true,
};

/** What useDriveData returns for these rows (the real entry model over the real access rules). */
export function driveData(opts: FixtureOptions = {}) {
  const items = opts.items ?? [];
  const docs = opts.docs ?? [];
  const trashedDocuments = opts.trashedDocs ?? [];
  const status = opts.status ?? "ready";
  const accessForDocument = (doc: DocumentMeta) =>
    docAccessFromRole(
      docRoleFor({ doc, memberId: ME, orgRole: "owner", permissions: null, grants: [] }),
      doc.trashedAt !== null,
    );
  const drive = {
    status,
    isReady: opts.isReady ?? status !== "checking",
    actor: CLIENT_ACTOR,
    admin: { view: true, edit: true },
    storeOnly: false,
    items,
    itemsById: new Map(items.map((item) => [item.id, item])),
    documents: docs,
    trashedDocuments,
    grants: [],
    starredItemIds: new Set(opts.starredItemIds ?? []),
    starredDocumentIds: new Set<string>(),
    usage: opts.usage ?? { usedBytes: 4096, reservedBytes: 0, quotaBytes: 10 * 1024 ** 3, fileCount: 2, sheetBytes: 0 },
    accessForItem: (item: DriveItem) => resolveDriveItemAccess(item, CLIENT_ACTOR),
    accessForDocument,
  };
  const memberNames = new Map(MEMBERS.map((m) => [m.id, m.name]));
  const entries = buildDriveEntries({
    drive,
    ceiling: null,
    actor: { memberId: ME, surface: "manager", acting: false },
    memberNames,
    openedMap: new Map(),
    localUploadIds: new Set(),
  });
  const tree: DriveTree = buildDriveTree(entries);
  return {
    actor: MANAGER_ACTOR,
    drive,
    tree,
    members: MEMBERS,
    memberNames,
    listingActor: { memberId: ME, canViewAll: true, canEditAll: true },
    isReady: drive.isReady,
  };
}

/** The entry of an item or document id in a tree (throws when it is missing, so a fixture typo fails loudly). */
export function entryOf(tree: DriveTree, key: string): DriveEntry {
  const entry = tree.byKey.get(key);
  if (!entry) throw new Error(`no entry ${key}`);
  return entry;
}

/** English copy: messages/en.json overlaid with every Drive fragment's en leaves; an unknown key reads "!key". */
export function translator(): (key: string) => string {
  const en = flattenMessages(JSON.parse(readFileSync(join(ROOT, "messages", "en.json"), "utf8")));
  for (const fragment of loadFragments()) for (const [key, value] of leavesOf(fragment, "en")) en.set(key, value);
  return (key: string) => en.get(key) ?? `!${key}`;
}

/** Server markup with the entities the assertions care about decoded. */
export function decode(html: string): string {
  return html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}
