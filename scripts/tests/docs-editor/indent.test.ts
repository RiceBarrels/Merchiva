// Block indents: the three Word indents on paragraphs and headings, the ruler's snapping, and Tab's tab stops.

import { describe, expect, test } from "bun:test";
import { Editor, type JSONContent } from "@tiptap/core";

import { buildDocExtensions } from "@/lib/docs/editor-extensions";
import { clampIndent, INDENT_STEP_IN } from "@/lib/docs/extensions/indent";

function makeEditor(content: JSONContent): Editor {
  return new Editor({
    element: null,
    editable: true,
    extensions: buildDocExtensions({ mode: "preview", canEdit: true, coarsePointer: false }),
    content,
  });
}

const para = (text: string, attrs?: Record<string, unknown>): JSONContent => ({
  type: "paragraph",
  ...(attrs ? { attrs } : {}),
  content: [{ type: "text", text }],
});

function firstAttrs(editor: Editor): Record<string, unknown> {
  return editor.state.doc.child(0).attrs;
}

describe("clampIndent", () => {
  test("snaps to the ruler's eighth-inch grid", () => {
    expect(INDENT_STEP_IN).toBe(0.5);
    expect(clampIndent(0.3, 8, "left")).toBe(0.25);
    expect(clampIndent(0.4, 8, "left")).toBe(0.5);
    expect(clampIndent(1.13, 8, "left")).toBe(1.25);
  });

  test("left and right indents cannot go negative, a first line can hang", () => {
    expect(clampIndent(-2, 8, "left")).toBe(0);
    expect(clampIndent(-2, 8, "right")).toBe(0);
    expect(clampIndent(-2, 8, "first")).toBe(-2);
  });

  test("everything is clamped to the maximum", () => {
    expect(clampIndent(99, 8, "left")).toBe(8);
    expect(clampIndent(-99, 8, "first")).toBe(-8);
  });

  test("nonsense becomes zero", () => {
    expect(clampIndent("x", 8, "left")).toBe(0);
    expect(clampIndent(Number.NaN, 8, "left")).toBe(0);
    expect(clampIndent(undefined, 8, "first")).toBe(0);
  });
});

describe("indent commands", () => {
  test("Tab moves to the next whole stop, even from a dragged indent", () => {
    const editor = makeEditor({ type: "doc", content: [para("Hello", { indent: 1.25 })] });
    editor.commands.indent();
    expect(firstAttrs(editor).indent).toBe(2);
    editor.destroy();
  });

  test("Shift-Tab drops back to the previous whole stop", () => {
    const editor = makeEditor({ type: "doc", content: [para("Hello", { indent: 1.25 })] });
    editor.commands.outdent();
    expect(firstAttrs(editor).indent).toBe(1);
    editor.destroy();
  });

  test("outdent stops at the left margin", () => {
    const editor = makeEditor({ type: "doc", content: [para("Hello")] });
    expect(editor.commands.outdent()).toBe(false);
    expect(firstAttrs(editor).indent).toBe(0);
    editor.destroy();
  });

  test("the ruler sets each side independently", () => {
    const editor = makeEditor({ type: "doc", content: [para("Hello")] });
    editor.commands.setBlockIndent("left", 1.5);
    editor.commands.setBlockIndent("right", 0.5);
    editor.commands.setBlockIndent("first", -1);
    expect(firstAttrs(editor)).toMatchObject({ indent: 1.5, indentRight: 0.5, indentFirst: -1 });
    editor.destroy();
  });

  test("a hanging first line is allowed, a hanging left margin is not", () => {
    const editor = makeEditor({ type: "doc", content: [para("Hello")] });
    editor.commands.setBlockIndent("left", -3);
    editor.commands.setBlockIndent("first", -3);
    expect(firstAttrs(editor)).toMatchObject({ indent: 0, indentFirst: -3 });
    editor.destroy();
  });

  test("headings indent too", () => {
    const editor = makeEditor({ type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "H" }] }] });
    editor.commands.indent();
    expect(firstAttrs(editor).indent).toBe(1);
    editor.destroy();
  });

  test("inside a list, indent sinks the item instead of moving the paragraph", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [para("one")] },
            { type: "listItem", content: [para("two")] },
          ],
        },
      ],
    });
    editor.commands.setTextSelection(editor.state.doc.content.size - 4);
    editor.commands.indent();
    const list = editor.state.doc.child(0);
    expect(list.childCount).toBe(1);
    expect(list.child(0).lastChild?.type.name).toBe("bulletList");
    editor.destroy();
  });
});
