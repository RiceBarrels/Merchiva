// A small Drive world built with the real model (buildDriveEntries), for the manager list, nav and
// toolbar tests of this folder.

import { buildDriveEntries, buildDriveTree, type BuildDriveEntriesInput, type DriveTree } from "@/components/drive/model/entries";
import { resolveDocAccess, type DocsGatePermissions } from "@/lib/docs/access";
import type { DocumentMeta } from "@/lib/docs/types";
import { driveAdminAccess, resolveDriveItemAccess, type DriveClientActor } from "@/lib/drive/access";
import type { DriveItem } from "@/lib/drive/types";
import type { OrgRole } from "@/lib/types";

export const ORG = "org-1";
let seq = 0;
export const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

export interface Member {
  id: string;
  role: OrgRole;
  permissions?: DocsGatePermissions;
}

const GATE: DocsGatePermissions = { dashboard: { view: true } };
export const OWNER: Member = { id: uuid(), role: "owner" };
export const ANA: Member = { id: uuid(), role: "staff", permissions: GATE };
export const BEN: Member = { id: uuid(), role: "staff", permissions: GATE };
/** A member who left: no name in memberNames. */
export const GONE: Member = { id: uuid(), role: "staff", permissions: GATE };

export const MEMBER_NAMES: ReadonlyMap<string, string> = new Map([
  [OWNER.id, "Olivia Owner"],
  [ANA.id, "Ana Ruiz"],
  [BEN.id, "Ben Lee"],
]);

export function item(patch: Partial<DriveItem> = {}): DriveItem {
  return {
    id: uuid(), organizationId: ORG, space: "my", parentId: "", kind: "file", name: "a.pdf", mimeType: "application/pdf",
    sizeBytes: 2048, blobKey: "", thumbKey: "", thumbBytes: 0, etag: "e", ownerMemberId: ANA.id, createdByMemberId: ANA.id,
    uploaderIdentityHex: "aa", status: "ready", uploadExpiresAt: new Date(0), uploadAttempts: 1, trashed: false,
    trashRootId: "", trashedAt: null, trashedByMemberId: "", createdAt: new Date("2026-09-01T10:00:00Z"),
    updatedAt: new Date("2026-09-20T10:00:00Z"), lastEditorMemberId: ANA.id, ...patch,
  };
}

export const folder = (patch: Partial<DriveItem> = {}) => item({ kind: "folder", name: "F", mimeType: "", sizeBytes: 0, ...patch });

export function doc(patch: Partial<DocumentMeta> = {}): DocumentMeta {
  return {
    id: uuid(), organizationId: ORG, ownerMemberId: ANA.id, title: "Doc", excerpt: "", icon: null, visibility: "private",
    templateId: null, pageSetup: null, wordCount: 0, createdAt: new Date("2026-09-01T10:00:00Z"),
    updatedAt: new Date("2026-09-21T10:00:00Z"), lastEditorMemberId: null, trashedAt: null, trashedByMemberId: null,
    fileType: "doc", folderId: "", ...patch,
  };
}

function clientActor(m: Member): DriveClientActor {
  const admin = driveAdminAccess(m.role, m.permissions);
  return {
    organizationId: ORG, memberId: m.id, role: m.role, gate: m.role === "owner" || m.permissions?.dashboard?.view === true,
    canViewAll: admin.view, canEditAll: admin.edit,
  };
}

/** The entries `actor` sees on the manager page. */
export function world(
  actor: Member,
  items: DriveItem[],
  docs: DocumentMeta[] = [],
  opts: { local?: string[]; starredItems?: string[] } = {},
): DriveTree {
  const access = (d: DocumentMeta) => resolveDocAccess({ doc: d, memberId: actor.id, orgRole: actor.role, permissions: actor.permissions, grants: [] });
  const input: BuildDriveEntriesInput = {
    drive: {
      items,
      itemsById: new Map(items.map((i) => [i.id, i])),
      documents: docs.filter((d) => !d.trashedAt && access(d).canView),
      trashedDocuments: docs.filter((d) => d.trashedAt && access(d).canManage),
      grants: [],
      starredItemIds: new Set(opts.starredItems ?? []),
      starredDocumentIds: new Set(),
      accessForItem: (i) => resolveDriveItemAccess(i, clientActor(actor)),
      accessForDocument: access,
      admin: driveAdminAccess(actor.role, actor.permissions),
    },
    ceiling: null,
    actor: { memberId: actor.id, surface: "manager", acting: false },
    memberNames: MEMBER_NAMES,
    openedMap: new Map(),
    localUploadIds: new Set(opts.local ?? []),
  };
  return buildDriveTree(buildDriveEntries(input));
}
