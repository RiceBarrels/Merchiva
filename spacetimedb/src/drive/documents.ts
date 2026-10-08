// createDriveDocument: a new Doc, Sheet or Slides deck placed straight into a
// Drive container (DS §6.3 "Documents"); renameDriveDocument: the acting-aware
// form of the Docs renameDocument. index.ts wires them:
// `export const { createDriveDocument, renameDriveDocument } = defineDriveDocumentReducers(spacetimedb, driveDeps)`.
//
// Documents are `document` rows, not drive items. Their space is derived from
// visibility (private = the owner's My files, org_view / org_edit = Store), so
// the visibility must match the container. The row is inserted exactly as the
// Docs createDocument reducer does; its type and folder go into its
// document_file row, in the same transaction (./document-file.ts). A Doc or Slides
// seed is opaque here; a Sheet seed must be a gzipped workbook (sheets.md §3.9),
// its html is always empty, wordCount holds its cell count, and its bytes are
// charged to the org's sheet budget (drive_usage.sheetBytes). Every new document
// counts toward the store's one storage quota (./storage.ts) and gets its
// document_size row.

import type { DriveSchema } from './types';
import {
  addDriveUsage, assertDriveDocRole, driveError, driveNewRowOwner, resolveContainer, resolveDriveActor, type DriveDeps,
} from './context';
import { setDocumentFile } from './document-file';
import { DRIVE_DOC_ROLE_RANK } from './logic';
import { isGzipBytes } from './sheet-logic';
import { assertSheetBytesFitIn, sheetError } from './sheets';
import { assertOrgStorageRoom, documentInitialBytes, refreshDocumentSize } from './storage';

/** document_file.fileType values a new document may take (no row = a text document from before Drive). */
const DRIVE_DOCUMENT_FILE_TYPES: readonly string[] = ['doc', 'sheet', 'slides'];

/** '' → the space's default (private in My files, org_edit in Store); otherwise it must fit the space. */
function driveDocumentVisibility(deps: DriveDeps, space: 'my' | 'store', requested: string): string {
  const visibility = String(requested ?? '');
  if (visibility === '') return space === 'my' ? 'private' : 'org_edit';
  const fits = space === 'my' ? visibility === 'private' : visibility === 'org_edit' || visibility === 'org_view';
  if (!fits) throw driveError(deps, 'invalid', 'That visibility does not fit this space');
  return visibility;
}

export function defineDriveDocumentReducers(spacetimedb: DriveSchema, deps: DriveDeps) {
  const { t } = deps;

  /** The client generates the id (reducers can't return values). */
  const createDriveDocument = spacetimedb.reducer(
    {
      organizationId: t.string(), documentId: t.string(), fileType: t.string(), space: t.string(), folderId: t.string(),
      ownerMemberId: t.string(), visibility: t.string(), title: t.string(), templateId: t.string(),
      initialState: t.option(t.byteArray()), html: t.option(t.string()), plainText: t.option(t.string()),
      wordCount: t.option(t.u32()), actingMemberId: t.string(),
    },
    (ctx, args) => {
      const actor = resolveDriveActor(ctx, deps, args.organizationId, args.actingMemberId);
      const organizationId = actor.organizationId;
      if (!DRIVE_DOCUMENT_FILE_TYPES.includes(args.fileType)) throw driveError(deps, 'invalid', 'Unknown file type');
      const id = String(args.documentId ?? '').toLowerCase();
      if (!deps.docLimits.uuidRe.test(id)) throw driveError(deps, 'invalid', 'Invalid document id');
      if (ctx.db.document.id.find(id)) throw driveError(deps, 'invalid', 'Document id already exists');
      const container = resolveContainer(ctx, deps, actor, args.space, args.folderId, args.ownerMemberId);
      const visibility = driveDocumentVisibility(deps, container.space, args.visibility);
      const init = args.initialState;
      if (init && init.length > deps.docLimits.stateMaxBytes) throw new deps.SenderError('[doc.too_large] Document is too large');
      const sheet = args.fileType === 'sheet';
      if (sheet) {
        if (!init || !isGzipBytes(init)) throw sheetError(deps, 'invalid', 'A new spreadsheet needs its content');
        assertSheetBytesFitIn(ctx, deps, organizationId, BigInt(init.length));
      }

      const plainText = deps.clampChars(args.plainText ?? '', deps.docLimits.textMaxChars);
      const html = sheet ? '' : deps.clampChars(args.html ?? '', deps.docLimits.htmlMaxChars);
      // A new document counts toward the store's one storage quota (editing one never is refused).
      assertOrgStorageRoom(ctx, deps, organizationId, init && init.length > 0 ? documentInitialBytes(init.length, html, plainText) : 0n);
      const templateId = deps.clampChars(String(args.templateId ?? '').trim(), deps.docLimits.templateIdMax);
      const doc = ctx.db.document.insert({
        id,
        organizationId,
        ownerMemberId: driveNewRowOwner(container, actor),
        title: deps.cleanDocTitle(args.title),
        excerpt: deps.docExcerpt(plainText),
        icon: undefined,
        visibility,
        templateId: templateId || undefined,
        pageSetup: undefined,
        wordCount: args.wordCount ?? 0,
        createdAt: ctx.timestamp,
        updatedAt: ctx.timestamp,
        lastEditorMemberId: actor.memberId,
        trashedAt: undefined,
        trashedByMemberId: undefined,
      });
      setDocumentFile(ctx, doc, { fileType: args.fileType, folderId: container.parentId });
      if (init && init.length > 0) {
        ctx.db.documentSnapshot.insert({
          documentId: id,
          organizationId,
          state: init,
          throughUpdateId: 0n,
          byteLength: init.length,
          html,
          plainText,
          compactedAt: ctx.timestamp,
          compactedByMemberId: actor.memberId,
        });
        if (sheet) addDriveUsage(ctx, organizationId, { sheetBytes: BigInt(init.length) });
      }
      refreshDocumentSize(ctx, doc);
      deps.refreshDocReaders(ctx, doc);
    }
  );

  /**
   * renameDocument, by the Drive actor. The store tablet acting for its PIN
   * operator gets the lower of both members' roles on the document (docRoleOf),
   * so it needs editor for the operator AND for the tablet account, and the
   * rename is attributed to the operator. Resolved in the document's own
   * organization: an id from another store is not_found. The title is cleaned
   * as renameDocument cleans it; an unchanged title writes nothing.
   */
  const renameDriveDocument = spacetimedb.reducer(
    { documentId: t.string(), title: t.string(), actingMemberId: t.string() },
    (ctx, args) => {
      const doc = ctx.db.document.id.find(String(args.documentId ?? '').toLowerCase());
      if (!doc) throw driveError(deps, 'not_found', 'Document not found');
      const actor = resolveDriveActor(ctx, deps, doc.organizationId, args.actingMemberId, { outsider: 'not_found' });
      assertDriveDocRole(ctx, deps, actor, doc, (role) => DRIVE_DOC_ROLE_RANK[role] >= DRIVE_DOC_ROLE_RANK.editor);
      if (doc.trashedAt) throw driveError(deps, 'trashed', 'Document is in the trash');
      const title = deps.cleanDocTitle(String(args.title ?? ''));
      if (title === doc.title) return;
      // The row is rewritten anyway, so the rename also counts as a touch.
      ctx.db.document.id.update({ ...doc, title, updatedAt: ctx.timestamp, lastEditorMemberId: actor.memberId });
    }
  );

  return { createDriveDocument, renameDriveDocument };
}
