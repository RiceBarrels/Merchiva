// Merchiva Docs — client-side domain types.
//
// Mirrors the `document*` SpacetimeDB tables (spacetimedb/src/index.ts) after
// row mapping (lib/docs/mappers.ts): ids are strings, timestamps are Dates,
// u64 ids stay bigint, byte columns are Uint8Array.

export type DocVisibility = "org_edit" | "org_view" | "private";
export type DocGrantRole = "viewer" | "commenter" | "editor";
export type DocRole = "none" | DocGrantRole | "manager";
export type DocVersionKind = "auto" | "named" | "restore";
export type DocErrorCode = "not_found" | "forbidden" | "trashed" | "too_large" | "invalid" | "not_published";
/**
 * What a document is (`document_file.fileType`; no row, or '', is a text document from before Drive). "unknown" was
 * written by a newer client: it is never opened, and `documentFileHref` sends it to the Drive home.
 */
export type DocFileType = "doc" | "sheet" | "slides" | "unknown";

export interface DocPageSetup {
  size: "letter" | "a4";
  orientation: "portrait" | "landscape";
  marginsIn: { top: number; right: number; bottom: number; left: number };
}
export interface DocumentMeta {
  id: string; organizationId: string; ownerMemberId: string; title: string; excerpt: string;
  icon: string | null; visibility: DocVisibility; templateId: string | null; pageSetup: DocPageSetup | null;
  wordCount: number; createdAt: Date; updatedAt: Date; lastEditorMemberId: string | null;
  trashedAt: Date | null; trashedByMemberId: string | null;
  /** From the document's `document_file` row; "doc" when it has none. */
  fileType: DocFileType;
  /** Drive folder (`drive_item` id, lowercase) from its `document_file` row; '' = the root of the document's space. */
  folderId: string;
}
/**
 * A document's `document_file` row: its Drive type and folder. The `document` table keeps the columns older clients
 * decode, so these live beside it, one row per document, written in the same transaction as the document.
 */
export interface DocFileRow { documentId: string; organizationId: string; fileType: DocFileType; folderId: string; updatedAt: Date }
export interface DocUpdateRow {
  id: bigint; documentId: string; organizationId: string; payload: Uint8Array;
  byteLength: number; sessionId: string; memberId: string; createdAt: Date;
}
export interface DocSnapshotRow {
  documentId: string; organizationId: string; state: Uint8Array; throughUpdateId: bigint;
  byteLength: number; html: string; plainText: string; compactedAt: Date; compactedByMemberId: string;
}
export interface DocPresenceRow {
  id: string; documentId: string; organizationId: string; connectionId: string; memberId: string;
  yClientId: number; name: string; color: string; canEdit: boolean; awareness: Uint8Array; updatedAt: Date;
}
export interface DocComment {
  id: string; documentId: string; organizationId: string; threadId: string; parentId: string | null;
  authorMemberId: string; body: string; quotedText: string | null; mentions: string[];
  status: "open" | "resolved"; resolvedAt: Date | null; resolvedByMemberId: string | null;
  createdAt: Date; editedAt: Date | null;
  /** Root only: encoded Yjs relative-position pair (`lib/docs/comment-anchors.ts`); null when the thread has none. */
  anchor: Uint8Array | null;
}
export interface DocCommentThread { threadId: string; root: DocComment; replies: DocComment[] }
export interface DocVersion {
  id: string; documentId: string; kind: DocVersionKind; name: string | null; state: Uint8Array;
  throughUpdateId: bigint; byteLength: number; wordCount: number; createdAt: Date; createdByMemberId: string;
}
export interface DocStar { id: string; documentId: string; organizationId: string; memberId: string; createdAt: Date }
export interface DocAccessGrant {
  id: string; documentId: string; organizationId: string; memberId: string; role: DocGrantRole;
  grantedByMemberId: string; createdAt: Date; updatedAt: Date;
}
export interface DocAccess { role: DocRole; canView: boolean; canComment: boolean; canEdit: boolean; canManage: boolean }
export interface DocSerialized { html: string; plainText: string; wordCount: number }

/** One entry of the "Recent documents" lists (New Tab page, desktop omnibox, mobile launcher). */
export interface RecentDocumentItem {
  id: string; title: string; href: string; updatedAt: Date; lastOpenedAt: number | null; ownerMemberId: string;
  fileType: DocFileType;
}
/** Word-count dialog / status bar figures. */
export interface DocTextStats { words: number; characters: number; charactersNoSpaces: number }
