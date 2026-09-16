// Initial Yjs state for a blank document, built with yjs only (no Tiptap).
//
// Why: y-tiptap writes nothing to Yjs until the content differs from the
// schema's empty doc, and then writes the WHOLE paragraph. If a blank document
// starts with an empty "default" fragment, two people typing into it at the
// same time each create their own paragraph and the doc ends up with two lines.
// Seeding the paragraph at creation makes both edit the same Yjs element.
//
// The structure must equal what `prosemirrorJSONToYDoc(schema, { type: "doc",
// content: [{ type: "paragraph" }] }, "default")` produces for the editor
// schema (lib/docs/editor-extensions.ts): y-tiptap's createTypeFromElementNode
// stores every non-null attribute, which for a paragraph means Indent's three
// zeroes (textAlign, docStyle and lineSpacing default to null).
// scripts/tests/docs/provider-blank-state.test.ts checks parity with lib/docs/seed.ts.

import * as Y from "yjs";

/** Y.Doc field the editor binds (Collaboration.configure({ field })). */
export const DOC_YJS_FIELD = "default";

/** Non-null default attributes of an empty paragraph in the editor schema. */
export const BLANK_PARAGRAPH_ATTRS: Readonly<Record<string, number | string>> = Object.freeze({
  indent: 0,
  indentRight: 0,
  indentFirst: 0,
});

/** `Y.encodeStateAsUpdate` of a doc whose "default" fragment holds one empty paragraph. */
export function buildBlankDocState(): Uint8Array {
  const doc = new Y.Doc();
  try {
    doc.transact(() => {
      // Same order as y-tiptap's createTypeFromElementNode: attributes on the prelim element, then insert.
      const paragraph = new Y.XmlElement("paragraph");
      for (const [key, value] of Object.entries(BLANK_PARAGRAPH_ATTRS)) paragraph.setAttribute(key, value as never);
      doc.getXmlFragment(DOC_YJS_FIELD).insert(0, [paragraph]);
    });
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}

/** `createDocument` input for a blank document (lib/spacetimedb/actions). */
export function blankDocumentInput(): { templateId: "blank"; initialState: Uint8Array; html: string; plainText: string; wordCount: number } {
  return { templateId: "blank", initialState: buildBlankDocState(), html: "<p></p>", plainText: "", wordCount: 0 };
}
