/**
 * Create a document from a template (plan §B7.3). Called from the docs home template row, File ▸ New in the editor,
 * and the New Tab page.
 *
 * Contract:
 * - `createDocumentFromTemplate(templateId, deps)` resolves to the new document id. The caller navigates with
 *   `documentHref(id, { isNew: true })` and reports failures (`toast.error(t("docs.home.createFailed"))`); this
 *   function only rejects.
 * - `"blank"` needs no Tiptap: it calls `createDocument({ templateId: "blank" })` from `lib/spacetimedb/actions`
 *   (default visibility `org_edit`, D40; the empty title shows as "Untitled document"). `createBlankDocument` is the
 *   same step on its own (File ▸ New).
 * - Every other template is seeded at creation time (not when the editor first opens) so two clients opening a new
 *   doc can't both insert template content: `await import("./seed")` (Tiptap + y-tiptap load only here),
 *   `buildDocTemplate(id, t, ctx)`, then `createDocument({ templateId, title, initialState, html, plainText, wordCount })`.
 * - `deps.placement` (a device panel on /store, `useDocCreatePlacement()`): the document is created with
 *   `createDriveDocument({ fileType: "doc", … })` in that Drive container instead, owned by and attributed to the
 *   PIN operator rather than the tablet account. Without it, `createDocument` as before. That path fails with Drive
 *   errors, not `[doc.*]` ones: callers read them with `placedCreateErrorKey` first.
 * - `renameDocumentFor(documentId, title, placement)`: a rename, placed the same way (`renameDriveDocument` for the
 *   operator on /store, `renameDocument` elsewhere), failing the same way.
 *
 * This module has no static Tiptap/Yjs imports, so the docs home and New Tab page can import it cheaply.
 */
import type { JSONContent } from "@tiptap/core";
import { DRIVE_ERROR_I18N_KEYS, DriveClientError, driveErrorCode } from "@/lib/drive/errors";
import type { DriveSpace } from "@/lib/drive/types";
import { createDocument, renameDocument } from "@/lib/spacetimedb/actions";
import { createDriveDocument, renameDriveDocument } from "@/lib/spacetimedb/actions/drive";
import type { BuildSeedExtras } from "./seed";
import { buildDocTemplate, type DocTemplateId, type DocTemplateNode } from "./templates";

/** = DOC_STATE_MAX_BYTES in spacetimedb/src/index.ts (DEFAULT_DOC_TUNING.stateMaxBytes); not imported, to keep yjs out of this module. */
const DOC_STATE_MAX_BYTES = 8_388_608;

/** A Drive container for a new document, and the operator it is created for (`useDocCreatePlacement()`). */
export interface DocPlacement {
  space: DriveSpace;
  /** '' = the root of the space. */
  folderId: string;
  /** The store tablet's PIN operator: owner of the new document and author of the write. */
  actingMemberId: string;
}

export interface CreateDocDeps {
  /** Creator's translator; template headings are resolved once in their language. */
  t: (key: string) => string;
  /** App locale (`useI18n().locale`); drives dates and weekday names. */
  locale: string;
  /** Active store name, or null. */
  storeName: string | null;
  /** Creator's display name, or null. */
  authorName: string | null;
  /** Set in a device panel on /store: where the document goes and who it is for. Absent → `createDocument`. */
  placement?: DocPlacement | null;
}

/** The documents row input both create paths share (createDocument's, minus organization, id and visibility). */
interface DocCreateInput {
  templateId: string;
  title?: string;
  initialState: Uint8Array;
  html: string;
  plainText: string;
  wordCount: number;
}

// `[drive.<code>]` at the start of a message, "SenderError: " allowed (the prefix lib/drive/errors.ts reads).
const DRIVE_FAILURE_RE = /^\s*(?:[A-Za-z]*Error:\s*)?\[drive\.[a-z_]+\]/;

/**
 * The `drive.errors.*` key of a failed placed create (or of a /store rename through renameDriveDocument, which fails
 * the same way): `createDriveDocument` rejects with `[drive.<code>]` (operator,
 * device_scope, forbidden, …) or a DriveClientError (not_connected, not_published). null for anything else — a docs
 * reducer failure, a failed conversion, a Drive code this client does not know — which keeps the caller's Docs
 * mapping. Only an explicit Drive failure counts: driveErrorCode's offline and membership guesses would relabel
 * ordinary Docs failures on /manager.
 */
export function placedCreateErrorKey(err: unknown): string | null {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!(err instanceof DriveClientError) && !DRIVE_FAILURE_RE.test(message)) return null;
  const code = driveErrorCode(err);
  return code && code !== "unknown" ? DRIVE_ERROR_I18N_KEYS[code] : null;
}

/** `createDocument`, or with a placement `createDriveDocument` (visibility '' = the space's own: org_edit in Store). */
function createPlaced(input: DocCreateInput, placement: DocPlacement | null | undefined): Promise<string> {
  if (!placement) return createDocument(input);
  return createDriveDocument({
    ...input,
    fileType: "doc",
    space: placement.space,
    folderId: placement.folderId,
    actingMemberId: placement.actingMemberId,
  });
}

/**
 * Renames a document: on /store (a placement) through Drive's `renameDriveDocument`, with the operator's rights and
 * attributed to them; elsewhere `renameDocument`. Both clean the title on the server.
 */
export async function renameDocumentFor(documentId: string, title: string, placement: DocPlacement | null | undefined): Promise<void> {
  if (placement) await renameDriveDocument(documentId, title, { actingMemberId: placement.actingMemberId });
  else await renameDocument(documentId, title);
}

/** A blank document (File ▸ New, the "Blank document" template), placed like `createDocumentFromTemplate`. */
export async function createBlankDocument(placement?: DocPlacement | null): Promise<string> {
  // Seeded with one empty paragraph so concurrent first edits share it (lib/docs/blank-state.ts: yjs only, no Tiptap).
  const { blankDocumentInput } = await import("./blank-state");
  return createPlaced(blankDocumentInput(), placement);
}

export async function createDocumentFromTemplate(templateId: DocTemplateId, deps: CreateDocDeps): Promise<string> {
  if (templateId === "blank") return createBlankDocument(deps.placement);
  const template = buildDocTemplate(templateId, deps.t, {
    locale: deps.locale,
    storeName: deps.storeName,
    authorName: deps.authorName,
  });
  return createDocumentFromContent({ title: template.title, content: template.content, templateId, placement: deps.placement });
}

export interface CreateFromContentInput extends BuildSeedExtras {
  /** Initial title (`""` shows as "Untitled document"). */
  title: string;
  /** Root `doc` node in the editor schema (template output or sanitized import JSON). */
  content: JSONContent | DocTemplateNode;
  /** Stored on the row; `"blank"` for imports. */
  templateId: string;
  /** See `CreateDocDeps.placement`. */
  placement?: DocPlacement | null;
}

/**
 * Seeds `content` into a Yjs state and creates the document with it (visibility `org_edit`, D40; with a placement,
 * the container's own). Shared by templates and file imports; rejects on invalid content or reducer failure.
 */
export async function createDocumentFromContent(input: CreateFromContentInput): Promise<string> {
  const { buildSeed } = await import("./seed");
  const seed = buildSeed(input.content, { pageSetup: input.pageSetup, headers: input.headers, footers: input.footers });
  // Fail fast rather than send more than the server accepts; importErrorMessageKey maps the code to docs.errors.tooLarge.
  if (seed.initialState.byteLength > DOC_STATE_MAX_BYTES) throw new Error("[doc.too_large] Document is too large");
  return createPlaced(
    {
      templateId: input.templateId,
      title: input.title,
      initialState: seed.initialState,
      html: seed.html,
      plainText: seed.plainText,
      wordCount: seed.wordCount,
    },
    input.placement,
  );
}
