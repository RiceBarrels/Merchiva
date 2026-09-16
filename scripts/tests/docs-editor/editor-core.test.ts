// Docs editor core: headless checks of the editor commands and helpers behind the toolbar, menus and mobile sheets.
// Tiptap runs without a view here (`element: null`), so node views and DOM listeners are covered through the
// functions they call.

import { describe, expect, test } from "bun:test";
import { Editor, type JSONContent } from "@tiptap/core";
import type { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { CLIPBOARD_FORBID_ATTR } from "@/components/docs/editor/clipboard";
import { buildDocExtensions } from "@/lib/docs/editor-extensions";
import { commentPluginKey, dropMovesWithinView } from "@/lib/docs/extensions/comment-mark";
import { PRESERVED_ON_CLEAR_FORMATTING } from "@/lib/docs/extensions/doc-keymap";
import { clipboardHtmlHasContent } from "@/lib/docs/extensions/image-upload-plugin";
import { getBlockStyle } from "@/lib/docs/extensions/paragraph-style";
import { setTaskItemChecked } from "@/lib/docs/extensions/task-item";
import { isAltGraphChord } from "@/lib/docs/shortcut-label";

function makeEditor(content: JSONContent, editable = true): Editor {
  return new Editor({
    element: null,
    editable,
    extensions: buildDocExtensions({ mode: "preview", canEdit: true, coarsePointer: false }),
    content,
  });
}

const text = (value: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const para = (value: string, attrs?: Record<string, unknown>): JSONContent => ({ type: "paragraph", ...(attrs ? { attrs } : {}), content: [text(value)] });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const bullet = (...items: JSONContent[][]): JSONContent => ({ type: "bulletList", content: items.map((content) => ({ type: "listItem", content })) });

describe("setBlockStyle keeps list and quote wrappers", () => {
  test("Normal text on a paragraph already in a bullet item changes nothing", () => {
    const editor = makeEditor(doc(bullet([para("item one")])));
    const before = editor.state.doc;
    editor.commands.setTextSelection(3);
    expect(editor.commands.setBlockStyle("normal")).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(editor.getJSON().content?.[0]?.type).toBe("bulletList");
    editor.destroy();
  });

  test("Title and Subtitle inside a bullet item style the paragraph in place", () => {
    const editor = makeEditor(doc(bullet([para("item one")])));
    editor.commands.setTextSelection(3);
    editor.commands.setBlockStyle("title");
    expect(editor.getJSON().content?.[0]?.type).toBe("bulletList");
    expect(getBlockStyle(editor)).toBe("title");
    editor.commands.setBlockStyle("subtitle");
    expect(getBlockStyle(editor)).toBe("subtitle");
    editor.commands.setBlockStyle("normal");
    expect(getBlockStyle(editor)).toBe("normal");
    expect(editor.getJSON().content?.[0]?.type).toBe("bulletList");
    editor.destroy();
  });

  test("Normal text inside a blockquote and checklist keeps the wrapper", () => {
    const editor = makeEditor(
      doc(
        { type: "blockquote", content: [para("quote", { docStyle: "title" })] },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [para("task")] }] },
      ),
    );
    editor.commands.setTextSelection(3);
    editor.commands.setBlockStyle("normal");
    const json = editor.getJSON();
    expect(json.content?.[0]?.type).toBe("blockquote");
    expect(json.content?.[0]?.content?.[0]?.attrs?.docStyle).toBeNull();

    const taskTextPos = editor.state.doc.child(0).nodeSize + 3;
    editor.commands.setTextSelection(taskTextPos);
    editor.commands.setBlockStyle("normal");
    expect(editor.getJSON().content?.[1]?.type).toBe("taskList");
    editor.destroy();
  });

  test("the same heading level inside a blockquote keeps the blockquote", () => {
    const editor = makeEditor(doc({ type: "blockquote", content: [{ type: "heading", attrs: { level: 2 }, content: [text("head")] }] }));
    editor.commands.setTextSelection(3);
    editor.commands.setBlockStyle("h2");
    expect(editor.getJSON().content?.[0]?.type).toBe("blockquote");
    editor.commands.setBlockStyle("h3");
    expect(editor.getJSON().content?.[0]?.type).toBe("blockquote");
    expect(getBlockStyle(editor)).toBe("h3");
    editor.destroy();
  });

  test("converting between headings and paragraphs still works", () => {
    const editor = makeEditor(doc(para("one"), { type: "heading", attrs: { level: 1 }, content: [text("two")] }));
    editor.commands.setTextSelection(2);
    editor.commands.setBlockStyle("h1");
    expect(getBlockStyle(editor)).toBe("h1");
    editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 2);
    editor.commands.setBlockStyle("title");
    expect(getBlockStyle(editor)).toBe("title");
    expect(editor.getJSON().content?.[1]?.type).toBe("paragraph");
    editor.destroy();
  });

  test("a range across paragraphs styles every block", () => {
    const editor = makeEditor(doc(para("one"), para("two")));
    editor.commands.selectAll();
    editor.commands.setBlockStyle("subtitle");
    const json = editor.getJSON();
    expect(json.content?.map((node) => node.attrs?.docStyle)).toEqual(["subtitle", "subtitle"]);
    editor.destroy();
  });
});

describe("clear formatting", () => {
  test("keeps comment anchors and links, removes the rest", () => {
    const editor = makeEditor(
      doc({
        type: "paragraph",
        content: [
          text("commented", [{ type: "comment", attrs: { threadId: "t1" } }, { type: "bold" }]),
          text(" link", [{ type: "link", attrs: { href: "https://a.example" } }, { type: "italic" }]),
          text(" red", [{ type: "textStyle", attrs: { color: "#ff0000" } }]),
        ],
      }),
    );
    editor.commands.selectAll();
    expect(editor.chain().clearDocFormatting().run()).toBe(true);
    const nodes = editor.getJSON().content?.[0]?.content ?? [];
    const marksOf = (value: string) => nodes.find((node) => node.text === value)?.marks?.map((mark) => mark.type) ?? [];
    expect(marksOf("commented")).toEqual(["comment"]);
    expect(marksOf(" link")).toEqual(["link"]);
    expect(marksOf(" red")).toEqual([]);
    expect([...PRESERVED_ON_CLEAR_FORMATTING].sort()).toEqual(["comment", "link"]);
    editor.destroy();
  });

  test("unsetAllMarks no longer strips comment anchors either", () => {
    const editor = makeEditor(doc({ type: "paragraph", content: [text("c", [{ type: "comment", attrs: { threadId: "t1" } }, { type: "bold" }])] }));
    editor.commands.selectAll();
    editor.commands.unsetAllMarks();
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks?.map((mark) => mark.type)).toEqual(["comment"]);
    editor.destroy();
  });
});

describe("checklist ticks while not editable", () => {
  test("setTaskItemChecked writes through a transaction on a read-only editor", () => {
    const editor = makeEditor(doc({ type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [para("count till")] }] }), false);
    expect(editor.isEditable).toBe(false);
    expect(setTaskItemChecked(editor.view, 1, true)).toBe(true);
    expect(editor.getJSON().content?.[0]?.content?.[0]?.attrs?.checked).toBe(true);
    expect(setTaskItemChecked(editor.view, 1, false)).toBe(true);
    expect(editor.getJSON().content?.[0]?.content?.[0]?.attrs?.checked).toBe(false);
    // Not a task item, or no position.
    expect(setTaskItemChecked(editor.view, 2, true)).toBe(false);
    expect(setTaskItemChecked(editor.view, undefined, true)).toBe(false);
    // A destroyed view dispatches nothing.
    let dispatched = false;
    const gone = { state: editor.state, isDestroyed: true, dispatch: () => { dispatched = true; } };
    expect(setTaskItemChecked(gone, 1, true)).toBe(false);
    expect(dispatched).toBe(false);
    editor.destroy();
  });

  test("only the live editor of a member who can edit writes read-only ticks", () => {
    const taskItemOptions = (mode: "live" | "preview" | "schema", canEdit: boolean) => {
      const ext = buildDocExtensions({ mode, canEdit, coarsePointer: false }).find((e) => e.name === "taskItem");
      expect(ext).toBeDefined();
      return ext?.options as { checkWhileReadOnly: boolean; onReadOnlyChecked?: unknown; nested: boolean };
    };
    const live = taskItemOptions("live", true);
    expect(live.checkWhileReadOnly).toBe(true);
    expect(typeof live.onReadOnlyChecked).toBe("function");
    expect(live.nested).toBe(true);
    for (const [mode, canEdit] of [["live", false], ["preview", true], ["schema", true]] as const) {
      const options = taskItemOptions(mode, canEdit);
      expect(options.checkWhileReadOnly).toBe(false);
      expect(options.onReadOnlyChecked).toBeUndefined();
    }
  });
});

describe("comment marks on paste and drag", () => {
  const commented = doc({ type: "paragraph", content: [text("anchor", [{ type: "comment", attrs: { threadId: "t1" } }])] }, para("target"));

  function setup() {
    const editor = makeEditor(commented);
    // Headless editors keep extension plugins on the extension manager (the state gets them once a view mounts).
    const plugin = editor.extensionManager.plugins.find((p) => p.spec.key === commentPluginKey) as Plugin;
    expect(plugin).toBeDefined();
    const slice = editor.state.doc.slice(1, 7);
    const view = (dragging: unknown) => ({ state: editor.state, dragging }) as unknown as EditorView;
    const transform = (v: EditorView) => plugin.props.transformPasted!.call(plugin, slice, v, false);
    const drop = (v: EditorView, event: Partial<DragEvent>) => plugin.props.handleDOMEvents!.drop!.call(plugin, v, event as DragEvent);
    const hasComment = (result: ReturnType<typeof transform>) => {
      let found = false;
      result.content.descendants((node) => {
        if (node.marks.some((mark) => mark.type.name === "comment")) found = true;
      });
      return found;
    };
    return { editor, slice, view, transform, drop, hasComment };
  }

  test("a paste strips comment marks", () => {
    const { editor, view, transform, hasComment } = setup();
    expect(hasComment(transform(view(null)))).toBe(false);
    editor.destroy();
  });

  test("a move inside the editor keeps them; a copy-drag or external drop strips them", () => {
    const { editor, slice, view, transform, drop, hasComment } = setup();
    const internal = view({ slice, move: true });
    drop(internal, { altKey: false, ctrlKey: false });
    expect(hasComment(transform(internal))).toBe(true);

    drop(internal, { altKey: true, ctrlKey: true });
    expect(hasComment(transform(internal))).toBe(false);

    const external = view(null);
    drop(external, { altKey: false, ctrlKey: false });
    expect(hasComment(transform(external))).toBe(false);
    editor.destroy();
  });

  test("a drop flag never leaks into a later paste", () => {
    const { editor, slice, view, transform, drop, hasComment } = setup();
    drop(view({ slice, move: true }), { altKey: false, ctrlKey: false });
    expect(hasComment(transform(view(null)))).toBe(false);
    editor.destroy();
  });

  test("dropMovesWithinView follows the platform copy modifier", () => {
    expect(dropMovesWithinView({}, { altKey: false, ctrlKey: false }, false)).toBe(true);
    expect(dropMovesWithinView({}, { altKey: false, ctrlKey: true }, false)).toBe(false);
    expect(dropMovesWithinView({}, { altKey: true, ctrlKey: false }, false)).toBe(true);
    expect(dropMovesWithinView({}, { altKey: true, ctrlKey: false }, true)).toBe(false);
    expect(dropMovesWithinView(null, { altKey: false, ctrlKey: false }, true)).toBe(false);
  });

  // DOMPurify checks FORBID_ATTR before its data-* allowance, so the attribute CommentMark parses never survives.
  test("Edit ▸ Paste sanitizer drops the comment attribute the schema would anchor", () => {
    expect(CLIPBOARD_FORBID_ATTR).toContain("data-comment-thread");
  });
});

describe("image paste next to HTML", () => {
  test("Office HTML with text or tables is pasted as content", () => {
    const excel = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><style>td{mso-number-format:General}</style></head><body><!--StartFragment--><table><tr><td>Qty</td><td>12</td></tr></table><!--EndFragment--></body></html>`;
    const word = `<html><head><!--[if gte mso 9]><xml><w:WordDocument><w:View>Normal</w:View></w:WordDocument></xml><![endif]--></head><body><p class=MsoNormal>Shift handover<o:p></o:p></p></body></html>`;
    expect(clipboardHtmlHasContent(excel)).toBe(true);
    expect(clipboardHtmlHasContent(word)).toBe(true);
    expect(clipboardHtmlHasContent("<table><tr><td></td></tr></table>")).toBe(true);
  });

  test("image-only HTML still uploads the file", () => {
    expect(clipboardHtmlHasContent("")).toBe(false);
    expect(clipboardHtmlHasContent(`<meta charset='utf-8'><img src="https://example.com/a.png" alt="Logo">`)).toBe(false);
    expect(
      clipboardHtmlHasContent(
        `<html><head><style>p{margin:0}</style></head><body><!--StartFragment--><p class=MsoNormal><img src="file:///C:/clip_image001.png"><o:p>&nbsp;</o:p></p><!--EndFragment--></body></html>`,
      ),
    ).toBe(false);
  });
});

describe("AltGr is not a document shortcut", () => {
  const key = (init: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; altGraph?: boolean }) => ({
    key: init.key,
    ctrlKey: init.ctrlKey ?? false,
    altKey: init.altKey ?? false,
    metaKey: init.metaKey ?? false,
    getModifierState: (name: string) => name === "AltGraph" && !!init.altGraph,
  });

  test("AltGr characters on Windows layouts", () => {
    expect(isAltGraphChord(key({ key: "[", ctrlKey: true, altKey: true }), false)).toBe(true);
    expect(isAltGraphChord(key({ key: "^", ctrlKey: true, altKey: true }), false)).toBe(true);
    expect(isAltGraphChord(key({ key: "f", ctrlKey: true, altKey: true, altGraph: true }), false)).toBe(true);
  });

  test("real Ctrl+Alt shortcuts still match", () => {
    expect(isAltGraphChord(key({ key: "f", ctrlKey: true, altKey: true }), false)).toBe(false);
    expect(isAltGraphChord(key({ key: "H", ctrlKey: true, altKey: true }), false)).toBe(false);
    expect(isAltGraphChord(key({ key: "а", ctrlKey: true, altKey: true }), false)).toBe(false);
    expect(isAltGraphChord(key({ key: "Dead", ctrlKey: true, altKey: true }), false)).toBe(false);
    expect(isAltGraphChord(key({ key: "[", ctrlKey: true }), false)).toBe(false);
    expect(isAltGraphChord(key({ key: "ƒ", metaKey: true, altKey: true }), true)).toBe(false);
  });
});
