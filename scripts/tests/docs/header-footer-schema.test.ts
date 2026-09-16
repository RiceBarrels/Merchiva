// The header/footer schema is deliberately smaller than the document's: running heads hold a line of text and a
// page number, not a document. These checks pin that down, because the importer and the DOCX exporter both assume it.

import { describe, expect, test } from "bun:test";
import { getText, getTextSerializersFromSchema } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { headerFooterSchema } from "@/lib/docs/header-footer-extensions";

const schema = headerFooterSchema();

describe("header/footer schema", () => {
  test("holds paragraphs, text, breaks and page fields", () => {
    for (const name of ["doc", "paragraph", "text", "hardBreak", "pageField"]) {
      expect(schema.nodes[name]).toBeDefined();
    }
  });

  test("leaves out everything that would not fit in a margin", () => {
    for (const name of ["heading", "bulletList", "orderedList", "listItem", "table", "image", "blockquote", "codeBlock", "horizontalRule"]) {
      expect(schema.nodes[name]).toBeUndefined();
    }
  });

  test("keeps the inline marks a running head needs", () => {
    for (const name of ["bold", "italic", "underline", "strike", "textStyle", "link"]) {
      expect(schema.marks[name]).toBeDefined();
    }
  });

  test("a paragraph can be aligned", () => {
    const node = ProseMirrorNode.fromJSON(schema, {
      type: "doc",
      content: [{ type: "paragraph", attrs: { textAlign: "right" }, content: [{ type: "text", text: "Q3" }] }],
    });
    node.check();
    expect(node.firstChild?.attrs.textAlign).toBe("right");
  });

  test("a page field is an inline atom with a kind", () => {
    const node = ProseMirrorNode.fromJSON(schema, {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Page " },
            { type: "pageField", attrs: { kind: "page" } },
            { type: "text", text: " of " },
            { type: "pageField", attrs: { kind: "pages" } },
          ],
        },
      ],
    });
    node.check();
    const field = node.firstChild?.child(1);
    expect(field?.type.isAtom).toBe(true);
    expect(field?.isInline).toBe(true);
    expect(field?.attrs.kind).toBe("page");
    // The field renders a literal `#`; each page substitutes its own number into the serialized HTML.
    expect(getText(node, { textSerializers: getTextSerializersFromSchema(schema) })).toBe("Page # of #");
  });

  test("an unknown kind falls back to the current page", () => {
    const node = ProseMirrorNode.fromJSON(schema, {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "pageField", attrs: {} }] }],
    });
    expect(node.firstChild?.firstChild?.attrs.kind).toBe("page");
  });
});
