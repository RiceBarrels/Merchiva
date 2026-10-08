// The Drive type and folder of a document, kept in `document_file` BESIDE its
// `document` row instead of as two more `document` columns.
//
// Why a side table: the SpacetimeDB TS SDK decodes a subscription's rows one
// after another with the CLIENT's compiled row type. A trailing column that an
// older client does not know shifts every row after the first, and the client
// throws "RangeError: Out of bounds access". Web tabs opened before a publish
// and the installed Capacitor apps (until users update) subscribe to
// `document`, so its columns never change
// (scripts/tests/drive/client-compat-schema.test.ts).
//
// No row = a document from before Drive: a text document at the root of its
// space. Server code reads through documentFileOf / docFileTypeOf /
// docFolderIdOf, which apply that default, and writes through setDocumentFile /
// dropDocumentFile. purgeDocumentRows drops the row with the document.
//
// KNOWN LIMITATION of that choice: a client built before Drive never reads
// this table, so it lists every sheet and deck as a text document and may open
// one in its text editor. The sheet guards in ../index.ts refuse its Yjs writes
// to a sheet. Nothing can refuse them on a deck: the Slides editor calls the
// same pushDocumentUpdate / compactDocument / updateDocumentMeta reducers. An
// old bundle can therefore add junk to a deck's text fragment and blank its
// excerpt and snapshot text until the next edit in the Slides editor rewrites
// them (its self-heal). The slide maps survive the Yjs merge. It lasts until
// old web tabs reload and native users update.
//
// No runtime imports, so Bun tests and the server-source harness load it.

import type { DriveCtx } from './types';

export type DocFileKind = 'doc' | 'sheet' | 'slides';

/** What a stored file type means: 'sheet' and 'slides' as such; '' (before Drive) and anything unknown is a text document. */
export function docFileKind(value: string | null | undefined): DocFileKind {
  const kind = String(value ?? '');
  return kind === 'sheet' || kind === 'slides' ? kind : 'doc';
}

/** The stored type and folder of a document; a document with no row reads as { fileType: '', folderId: '' }. */
export function documentFileOf(ctx: DriveCtx, documentId: string): { fileType: string; folderId: string } {
  const row = ctx.db.documentFile.documentId.find(documentId);
  return row ? { fileType: row.fileType, folderId: row.folderId } : { fileType: '', folderId: '' };
}

/** What a document holds (docFileKind of its stored type). */
export function docFileTypeOf(ctx: DriveCtx, documentId: string): DocFileKind {
  return docFileKind(documentFileOf(ctx, documentId).fileType);
}

/** The drive_item folder a document sits in; '' = the root of its space. */
export function docFolderIdOf(ctx: DriveCtx, documentId: string): string {
  return documentFileOf(ctx, documentId).folderId;
}

/**
 * Write a document's type and/or folder; a field left out keeps its current
 * value (no row: a 'doc' at the root). Writes nothing when nothing changes, and
 * inserts no row for a folder-only change that leaves a row-less document at
 * the root. An explicit fileType always leaves a row (createDriveDocument,
 * duplicateDocument).
 */
export function setDocumentFile(
  ctx: DriveCtx, doc: { id: string; organizationId: string }, patch: { fileType?: string; folderId?: string },
): void {
  const row = ctx.db.documentFile.documentId.find(doc.id);
  const fileType = patch.fileType ?? row?.fileType ?? 'doc';
  const folderId = patch.folderId ?? row?.folderId ?? '';
  if (row) {
    if (row.fileType === fileType && row.folderId === folderId) return;
    ctx.db.documentFile.documentId.update({ ...row, fileType, folderId, updatedAt: ctx.timestamp });
  } else if (patch.fileType !== undefined || folderId !== '') {
    ctx.db.documentFile.insert({
      documentId: doc.id, organizationId: doc.organizationId, fileType, folderId, updatedAt: ctx.timestamp,
    });
  }
}

/** The document is going away: drop its row (if any). */
export function dropDocumentFile(ctx: DriveCtx, documentId: string): void {
  const row = ctx.db.documentFile.documentId.find(documentId);
  if (row) ctx.db.documentFile.delete(row);
}
