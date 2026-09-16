/**
 * Seeding (docs-editor-ui spec §3.4, backend spec §7.4): ProseMirror JSON → Yjs initial state, plus the snapshot's
 * HTML, plain text and word count. Seeding happens once at creation (never when the editor first opens), so two
 * clients can't both insert starting content.
 *
 * Page setup and header/footer boxes are seeded into the same Y.Doc, which is how an imported `.docx` keeps its
 * paper size, margins and running heads.
 *
 * Loads Tiptap and y-tiptap; import it dynamically (`await import("@/lib/docs/seed")`).
 */
import { getHTMLFromFragment, getSchema, getText, getTextSerializersFromSchema, type JSONContent } from "@tiptap/core";
import { Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import * as Y from "yjs";

import { buildDocExtensions } from "@/lib/docs/editor-extensions";
import { HEADER_FOOTER_ZONES, type HeaderFooterVariant } from "@/lib/docs/header-footer";
import { seedHeaderFooter } from "@/lib/docs/header-footer-content";
import { writePageSetup } from "@/lib/docs/page-setup-store";
import type { DocPageSetup } from "@/lib/docs/page-setup";
import { docWordCount } from "@/lib/docs/text";
import type { DocTemplateNode } from "@/lib/docs/templates";

export interface DocSeed {
  /** `Y.encodeStateAsUpdate` of a doc whose "default" fragment holds the content. */
  initialState: Uint8Array;
  /** Tiptap HTML (empty outside a DOM). */
  html: string;
  /** `editor.getText()`-equivalent plain text (blocks separated by blank lines). */
  plainText: string;
  wordCount: number;
}

let cachedSchema: Schema | null = null;

/** The editor schema (identical in every extension mode). */
export function docSchema(): Schema {
  if (!cachedSchema) {
    cachedSchema = getSchema(buildDocExtensions({ mode: "schema", canEdit: true, coarsePointer: false }));
  }
  return cachedSchema;
}

export interface BuildSeedExtras {
  /** Written to the page-setup map; omit to leave the document on the locale default. */
  pageSetup?: DocPageSetup | null;
  headers?: Partial<Record<HeaderFooterVariant, JSONContent>>;
  footers?: Partial<Record<HeaderFooterVariant, JSONContent>>;
}

/** Validates `json` against the editor schema and encodes it as the document's initial Yjs state. */
export function buildSeed(json: JSONContent | DocTemplateNode, extras: BuildSeedExtras = {}): DocSeed {
  const schema = docSchema();
  const node = ProseMirrorNode.fromJSON(schema, json);
  node.check();
  const ydoc = prosemirrorJSONToYDoc(schema, node.toJSON(), "default");
  let initialState: Uint8Array;
  try {
    if (extras.pageSetup) writePageSetup(ydoc, extras.pageSetup);
    for (const zone of HEADER_FOOTER_ZONES) {
      const source = zone === "header" ? extras.headers : extras.footers;
      for (const [variant, content] of Object.entries(source ?? {})) {
        // One bad box must not lose the document it came with.
        try {
          seedHeaderFooter(ydoc, zone, variant as HeaderFooterVariant, content);
        } catch {
          continue;
        }
      }
    }
    initialState = Y.encodeStateAsUpdate(ydoc);
  } finally {
    ydoc.destroy();
  }
  const plainText = getText(node, { blockSeparator: "\n\n", textSerializers: getTextSerializersFromSchema(schema) });
  const html = typeof document === "undefined" ? "" : getHTMLFromFragment(node.content, schema);
  return { initialState, html, plainText, wordCount: docWordCount(plainText) };
}
