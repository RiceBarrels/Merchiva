// Shared data for the Drive lite fixtures (scripts/tests/drive/lite-render.isolated.tsx): one store with an owner
// (Ana, whose account is signed in on the store tablet), a staff operator (Priya) and another staff member (Ben),
// their folders, files and documents, and what useDriveData returns for each person on each device — built by the
// real entry model (buildDriveEntries) over the real access rules, with the tablet account's ceiling on a
// staff-account tablet. Row objects for the provider's other tables feed the real "From other apps" hook.
//
// Imported only by the isolated fixture (a child process); it installs no mock itself.

import { buildDriveEntries, buildDriveTree } from "@/components/drive/model/entries";
import type { AccessCeiling } from "@/components/drive/model/types";
import { docAccessFromRole, docRoleFor, resolveDocAccess } from "@/lib/docs/access";
import type { DocumentMeta } from "@/lib/docs/types";
import { resolveDriveItemAccess, type DriveClientActor } from "@/lib/drive/access";
import type { DriveItem, DriveUsageView } from "@/lib/drive/types";
import type { OrgRole } from "@/lib/types";
import { makeDoc, makeItem, ME, ORG, PRIYA, uuid } from "../home/fixture";

export { decode, makeDoc, makeItem, ORG, translator, uuid } from "../home/fixture";

/** The owner; her account is the one signed in on the store tablet. */
export const ANA = ME;
export const PRIYA_ID = PRIYA;
export const BEN = "4e4e4e4e-0000-4000-8000-000000000004";
export const ANA_HEX = "aa".repeat(32);
export const PRIYA_HEX = "bb".repeat(32);
export const BEN_HEX = "cc".repeat(32);

export const STAFF_PERMISSIONS = { dashboard: { view: true } };

export interface Person {
  id: string;
  name: string;
  role: OrgRole;
  permissions: { dashboard?: { view?: boolean }; drive?: { view?: boolean; edit?: boolean } } | null;
  hex: string;
}

export const PEOPLE: Readonly<Record<"ana" | "priya" | "ben", Person>> = {
  ana: { id: ANA, name: "Ana Ruiz", role: "owner", permissions: null, hex: ANA_HEX },
  priya: { id: PRIYA_ID, name: "Priya Patel", role: "staff", permissions: STAFF_PERMISSIONS, hex: PRIYA_HEX },
  ben: { id: BEN, name: "Ben Ito", role: "staff", permissions: STAFF_PERMISSIONS, hex: BEN_HEX },
};

export const MEMBERS = Object.values(PEOPLE).map((p) => ({ id: p.id, name: p.name, role: p.role, active: true }));

// ── Rows ─────────────────────────────────────────────────────────────────────

export const ID = {
  anaFile: uuid(11),
  priyaFolder: uuid(12),
  priyaFile: uuid(13),
  storeMenu: uuid(14),
  storePhoto: uuid(15),
  priyaTrashed: uuid(16),
  anaTrashed: uuid(17),
  anaDoc: uuid(21),
  anaTrashedDoc: uuid(22),
  priyaSheet: uuid(23),
  storeDeck: uuid(24),
  benFile: uuid(25),
} as const;

const HOUR = 3_600_000;
const trashedAt = new Date(Date.now() - HOUR);

export function storeItems(): DriveItem[] {
  return [
    makeItem({ id: ID.anaFile, name: "ana-private.pdf", kind: "file", ownerMemberId: ANA, createdByMemberId: ANA }),
    makeItem({ id: ID.priyaFolder, name: "Receipts", kind: "folder", ownerMemberId: PRIYA_ID, createdByMemberId: PRIYA_ID }),
    makeItem({ id: ID.priyaFile, name: "priya-notes.pdf", kind: "file", ownerMemberId: PRIYA_ID, createdByMemberId: PRIYA_ID }),
    makeItem({ id: ID.storeMenu, name: "menu.pdf", kind: "file", space: "store", ownerMemberId: ANA, createdByMemberId: ANA }),
    makeItem({ id: ID.storePhoto, name: "shelf.jpg", kind: "file", space: "store", mimeType: "image/jpeg", ownerMemberId: PRIYA_ID, createdByMemberId: PRIYA_ID }),
    makeItem({ id: ID.benFile, name: "ben-shift.pdf", kind: "file", ownerMemberId: BEN, createdByMemberId: BEN }),
    makeItem({
      id: ID.priyaTrashed, name: "old-receipt.pdf", kind: "file", ownerMemberId: PRIYA_ID, createdByMemberId: PRIYA_ID,
      trashed: true, trashRootId: ID.priyaTrashed, trashedAt, trashedByMemberId: PRIYA_ID,
    }),
    makeItem({
      id: ID.anaTrashed, name: "ana-trash.pdf", kind: "file", ownerMemberId: ANA, createdByMemberId: ANA,
      trashed: true, trashRootId: ID.anaTrashed, trashedAt, trashedByMemberId: ANA,
    }),
  ];
}

export function storeDocs(): DocumentMeta[] {
  return [
    makeDoc({ id: ID.anaDoc, title: "Ana plan", ownerMemberId: ANA }),
    makeDoc({ id: ID.priyaSheet, title: "Priya budget", fileType: "sheet", ownerMemberId: PRIYA_ID }),
    makeDoc({ id: ID.storeDeck, title: "Store pitch", fileType: "slides", visibility: "org_edit", ownerMemberId: ANA }),
  ];
}

export function storeTrashedDocs(): DocumentMeta[] {
  return [makeDoc({ id: ID.anaTrashedDoc, title: "Ana old doc", ownerMemberId: ANA, trashedAt, trashedByMemberId: ANA })];
}

// ── What useDriveData returns ────────────────────────────────────────────────

function clientActor(person: Person): DriveClientActor {
  const admin = person.role === "owner" || person.role === "manager";
  return {
    organizationId: ORG,
    memberId: person.id,
    role: person.role,
    gate: admin || person.permissions?.dashboard?.view === true,
    canViewAll: admin || person.permissions?.drive?.view === true || person.permissions?.drive?.edit === true,
    canEditAll: admin || person.permissions?.drive?.edit === true,
  };
}

function ceilingOf(account: Person): AccessCeiling {
  const actor = clientActor(account);
  return {
    item: (item) => resolveDriveItemAccess(item, actor),
    doc: (doc) => resolveDocAccess({ doc, memberId: account.id, orgRole: account.role, permissions: account.permissions, grants: [] }),
  };
}

export interface LiteDataOptions {
  /** Who uses Drive: the PIN operator on /store, the member on /personal. */
  person: Person;
  surface: "store" | "personal";
  /** The account signed in on the store tablet, when it is a staff account other than the person: the ceiling. */
  staffTablet?: Person | null;
  items?: DriveItem[];
  docs?: DocumentMeta[];
  trashedDocs?: DocumentMeta[];
  status?: "checking" | "ready" | "not_published";
  isReady?: boolean;
  usage?: DriveUsageView | null;
}

/** useDriveData's result for these rows, evaluated for `person` (and capped by the staff tablet's account). */
export function liteData(opts: LiteDataOptions) {
  const { person, surface } = opts;
  const actor = clientActor(person);
  const items = opts.items ?? [];
  const docs = opts.docs ?? [];
  const status = opts.status ?? "ready";
  const acting = surface === "store";
  const ceiling = opts.staffTablet ? ceilingOf(opts.staffTablet) : null;
  const drive = {
    status,
    isReady: opts.isReady ?? status !== "checking",
    actor,
    admin: { view: actor.canViewAll, edit: actor.canEditAll },
    storeOnly: !!opts.staffTablet,
    items,
    itemsById: new Map(items.map((item) => [item.id, item])),
    documents: docs,
    trashedDocuments: opts.trashedDocs ?? [],
    grants: [],
    starredItemIds: new Set<string>(),
    starredDocumentIds: new Set<string>(),
    usage: opts.usage === undefined ? { usedBytes: 4096, reservedBytes: 0, quotaBytes: 10 * 1024 ** 3, fileCount: 3, sheetBytes: 0 } : opts.usage,
    accessForItem: (item: DriveItem) => resolveDriveItemAccess(item, actor),
    accessForDocument: (doc: DocumentMeta) =>
      docAccessFromRole(docRoleFor({ doc, memberId: person.id, orgRole: person.role, permissions: person.permissions, grants: [] }), doc.trashedAt !== null),
  };
  const memberNames = new Map(MEMBERS.map((m) => [m.id, m.name]));
  const entries = buildDriveEntries({
    drive,
    ceiling,
    actor: { memberId: person.id, surface, acting },
    memberNames,
    openedMap: new Map(),
    localUploadIds: new Set(),
  });
  const driveActor = {
    memberId: person.id,
    actingMemberId: acting ? person.id : "",
    acting,
    role: person.role,
    surface,
    canViewAll: actor.canViewAll && !ceiling,
    canEditAll: actor.canEditAll && !ceiling,
    ceiling,
    ready: true,
  };
  return {
    actor: driveActor,
    drive,
    tree: buildDriveTree(entries),
    members: MEMBERS,
    memberNames,
    listingActor: { memberId: person.id, canViewAll: driveActor.canViewAll, canEditAll: driveActor.canEditAll },
    isReady: drive.isReady,
  };
}

// ── Rows of the provider's other tables (the real useVirtualSources reads them) ──

const identity = (hex: string) => ({ __identity__: true, toHexString: () => hex });

export function memberRows() {
  return Object.values(PEOPLE).map((p) => ({
    id: p.id,
    organizationId: ORG,
    userId: identity(p.hex),
    status: "active",
    role: p.role,
    permissions: JSON.stringify(p.permissions ?? {}),
    displayName: p.name,
    email: `${p.name.split(" ")[0].toLowerCase()}@example.test`,
  }));
}

export const CONVERSATION = uuid(31);

export function virtualRows() {
  const createdAt = new Date(Date.now() - 2 * HOUR);
  return {
    chatConversations: [{ id: CONVERSATION, organizationId: ORG, name: "Front of house" }],
    chatMessages: [{
      id: uuid(32), conversationId: CONVERSATION, senderId: identity(ANA_HEX), attachmentUrl: "https://files.example.test/till.jpg",
      attachmentName: "till.jpg", attachmentType: "image/jpeg", createdAt,
    }],
    organizations: [{ id: ORG, logoUrl: "https://files.example.test/logo.png", createdAt }],
    users: [{ identity: identity(ANA_HEX), avatarUrl: "https://files.example.test/ana.png", createdAt }],
  };
}

// ── Test doubles ─────────────────────────────────────────────────────────────

export interface RecordedToast { kind: string; message: string; opts?: { action?: { label: string; onClick: () => void } } }

/** A sonner `toast` that records what it was asked to show. */
export function toastRecorder() {
  const toasts: RecordedToast[] = [];
  const push = (kind: string) => (message: string, opts?: RecordedToast["opts"]) => void toasts.push({ kind, message, opts });
  const toast = Object.assign(push("info"), {
    success: push("success"),
    error: push("error"),
    warning: push("warning"),
    loading: (message: string) => {
      toasts.push({ kind: "loading", message });
      return "loading-1";
    },
    dismiss: () => {},
  });
  return { toasts, toast };
}

/**
 * What the camera input hands over: bytes with a file's name. A Blob carrying the name, not a File: Bun gives a File
 * built from another File the same backing store, name included, so the picker's rename would read back wrong in
 * this runtime (browsers copy it).
 */
export function cameraShot(name: string, type: string, size: number): Blob {
  return Object.defineProperties(new Blob([new Uint8Array(size)], { type }), {
    name: { value: name },
    lastModified: { value: Date.now() },
  });
}
