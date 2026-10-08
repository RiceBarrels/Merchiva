// Drive UI model types: sections, the one entry union every list, menu and preview renders,
// locations and move targets. Pure types and constants (no React), shared by the model files
// in this folder and the Drive components.
//
// Access, roles and placement come from lib/drive (types, access, model); this file only
// shapes them for the UI (drive-ui §5.1).

import type { DocAccess, DocFileType, DocumentMeta } from "@/lib/docs/types";
import type { DriveFileKind } from "@/lib/drive/file-kinds";
import type { DriveItem, DriveItemAccess, DriveSpace } from "@/lib/drive/types";
import type { DriveUrlParams } from "./url-state";

/** A document kind Drive creates and opens (= lib/drive/editors.ts DriveDocKind). */
export type DriveDocKind = Exclude<DocFileType, "unknown">;

export type DriveSection = "my" | "store" | "shared" | "recent" | "starred" | "trash" | "apps" | "members";
export const DRIVE_SECTIONS: readonly DriveSection[] = ["my", "store", "shared", "recent", "starred", "trash", "apps", "members"];

/** Apps whose stored file links (and, for forms, records) Drive lists read-only under "Stored in apps". */
export type VirtualSourceId = "chat" | "tasks" | "inventory" | "training" | "products" | "bugs" | "profile" | "forms";
export const VIRTUAL_SOURCE_IDS: readonly VirtualSourceId[] = ["chat", "tasks", "inventory", "training", "products", "bugs", "profile", "forms"];

export type DriveTypeFilter = "all" | "folder" | "doc" | "sheet" | "slides" | "image" | "pdf" | "video" | "audio" | "other";
export const DRIVE_TYPE_FILTERS: readonly DriveTypeFilter[] = ["all", "folder", "doc", "sheet", "slides", "image", "pdf", "video", "audio", "other"];

export type DriveSort = "name" | "modified" | "created" | "size";
export const DRIVE_SORTS: readonly DriveSort[] = ["name", "modified", "created", "size"];

export type DriveView = "grid" | "list";
export const DRIVE_VIEWS: readonly DriveView[] = ["grid", "list"];

/** Where an entry lives. ownerMemberId is '' for the store space. */
export interface DriveLocation { space: DriveSpace; ownerMemberId: string; parentId: string }

export interface DriveEntryAccess {
  canOpen: boolean;
  canDownload: boolean;
  canRename: boolean;
  canMove: boolean;
  canTrash: boolean;
  canRestore: boolean;
  canDeleteForever: boolean;
  canShare: boolean;
  canStar: boolean;
  /** Folders only: may upload / create inside. */
  canAddChildren: boolean;
}

/** Second rights check on a non-admin store tablet (the server's min(sender, operator) intersection). */
export interface AccessCeiling {
  item(item: DriveItem): DriveItemAccess;
  doc(doc: DocumentMeta): DocAccess;
}

interface EntryBase {
  /** "item:<uuid>" | "doc:<uuid>" | "v:<source>:<rowId>[:<n>]" — stable, used in ?preview= and selection. */
  readonly key: string;
  readonly id: string;
  /** Display name ('' allowed for documents → the untitled label at render). */
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** '' unknown / store-level. */
  readonly ownerMemberId: string;
  /** null = former member or unknown. */
  readonly ownerName: string | null;
  readonly isMine: boolean;
  readonly starred: boolean;
  readonly trashedAt: number | null;
  readonly openedAt: number | null;
  /** null for virtual entries. */
  readonly location: DriveLocation | null;
  readonly access: DriveEntryAccess;
}

export interface FolderEntry extends EntryBase {
  readonly type: "folder";
  readonly item: DriveItem;
}

export interface FileEntry extends EntryBase {
  readonly type: "file";
  readonly item: DriveItem;
  readonly fileKind: DriveFileKind;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** "local": this tab is uploading it (progress known); "elsewhere": pending, started by the actor on another tab/device. */
  readonly uploading: "local" | "elsewhere" | null;
}

export interface DocEntry extends EntryBase {
  readonly type: DriveDocKind;
  readonly doc: DocumentMeta;
  readonly docAccess: DocAccess;
  readonly sharedWithMe: boolean;
  readonly hasGrants: boolean;
  /** Stored bytes, content plus kept versions (`document_size`); null when unknown. */
  readonly sizeBytes: number | null;
}

export interface VirtualEntry extends EntryBase {
  readonly type: "virtual";
  readonly source: VirtualSourceId;
  readonly url: string;
  readonly fileKind: DriveFileKind;
  readonly mimeType: string;
  readonly group: string;
  readonly originRoute: string | null;
  /** The app file's size (`app_file`, by appFileKeyHash(url)); null for a link Merchiva does not store or one not recorded. */
  readonly sizeBytes: number | null;
  /**
   * Set for a record another app keeps rather than a file (a form and its responses): the /manager page it opens
   * instead of a preview. `url` is '' then and nothing downloads. Absent for a file link.
   */
  readonly href?: string;
  /** A record's one-line summary (a form's response count). */
  readonly note?: string;
}

/** A record entry ("Stored in apps → Forms"): opens its /manager page, never previews or downloads. */
export function isRecordEntry(entry: DriveEntry): entry is VirtualEntry & { readonly href: string } {
  return entry.type === "virtual" && typeof entry.href === "string" && entry.href !== "";
}

export type DriveEntry = FolderEntry | FileEntry | DocEntry | VirtualEntry;

export interface DriveMoveTarget { space: DriveSpace; parentId: string; ownerMemberId: string }

export interface DriveCrumb {
  readonly key: string;
  readonly label: string | null;
  readonly labelKey: string | null;
  readonly labelVars?: Record<string, string>;
  readonly params: Partial<DriveUrlParams>;
  readonly dropTarget: DriveMoveTarget | null;
}
