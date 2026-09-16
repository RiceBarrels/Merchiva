/**
 * Create a document from a template (plan §B7.3). Called from the docs home template row, File ▸ New in the editor,
 * and the New Tab page.
 *
 * Contract:
 * - `createDocumentFromTemplate(templateId, deps)` resolves to the new document id. The caller navigates with
 *   `documentHref(id, { isNew: true })` and reports failures (`toast.error(t("docs.home.createFailed"))`); this
 *   function only rejects.
 * - `"blank"` needs no Tiptap: it calls `createDocument({ templateId: "blank" })` from `lib/spacetimedb/actions`
 *   (default visibility `org_edit`, D40; the empty title shows as "Untitled document").
 * - Every other template is seeded at creation time (not when the editor first opens) so two clients opening a new
 *   doc can't both insert template content: `await import("./seed")` (Tiptap + y-tiptap load only here),
 *   `buildDocTemplate(id, t, ctx)`, then `createDocument({ templateId, title, initialState, html, plainText, wordCount })`.
 *
 * This module has no static Tiptap/Yjs imports, so the docs home and New Tab page can import it cheaply.
 */
import type { JSONContent } from "@tiptap/core";
import { createDocument } from "@/lib/spacetimedb/actions";
import type { BuildSeedExtras } from "./seed";
import { buildDocTemplate, type DocTemplateId, type DocTemplateNode } from "./templates";

/** = DOC_STATE_MAX_BYTES in spacetimedb/src/index.ts (DEFAULT_DOC_TUNING.stateMaxBytes); not imported, to keep yjs out of this module. */
const DOC_STATE_MAX_BYTES = 8_388_608;

export interface CreateDocDeps {
  /** Creator's translator; template headings are resolved once in their language. */
  t: (key: string) => string;
  /** App locale (`useI18n().locale`); drives dates and weekday names. */
  locale: string;
  /** Active store name, or null. */
  storeName: string | null;
  /** Creator's display name, or null. */
  authorName: string | null;
}

export async function createDocumentFromTemplate(templateId: DocTemplateId, deps: CreateDocDeps): Promise<string> {
  if (templateId === "blank") {
    // Seeded with one empty paragraph so concurrent first edits share it (lib/docs/blank-state.ts: yjs only, no Tiptap).
    const { blankDocumentInput } = await import("./blank-state");
    return createDocument(blankDocumentInput());
  }
  const template = buildDocTemplate(templateId, deps.t, {
    locale: deps.locale,
    storeName: deps.storeName,
    authorName: deps.authorName,
  });
  return createDocumentFromContent({ title: template.title, content: template.content, templateId });
}

export interface CreateFromContentInput extends BuildSeedExtras {
  /** Initial title (`""` shows as "Untitled document"). */
  title: string;
  /** Root `doc` node in the editor schema (template output or sanitized import JSON). */
  content: JSONContent | DocTemplateNode;
  /** Stored on the row; `"blank"` for imports. */
  templateId: string;
}

/**
 * Seeds `content` into a Yjs state and creates the document with it (visibility `org_edit`, D40).
 * Shared by templates and file imports; rejects on invalid content or reducer failure.
 */
export async function createDocumentFromContent(input: CreateFromContentInput): Promise<string> {
  const { buildSeed } = await import("./seed");
  const seed = buildSeed(input.content, { pageSetup: input.pageSetup, headers: input.headers, footers: input.footers });
  // Fail fast rather than send more than the server accepts; importErrorMessageKey maps the code to docs.errors.tooLarge.
  if (seed.initialState.byteLength > DOC_STATE_MAX_BYTES) throw new Error("[doc.too_large] Document is too large");
  return createDocument({
    templateId: input.templateId,
    title: input.title,
    initialState: seed.initialState,
    html: seed.html,
    plainText: seed.plainText,
    wordCount: seed.wordCount,
  });
}
