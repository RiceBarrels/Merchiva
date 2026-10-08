// Slide text schema and fragments: the yjs-only blank seed equals y-tiptap's own seed, text JSON round-trips
// through a fragment with every mark and attribute, writes diff in place and join the caller's transaction, and
// the schema renders pt sizes as stage px and theme references as CSS variables.
import { describe, expect, test } from "bun:test";
import { Editor, getAttributesFromExtensions, getRenderedAttributes, resolveExtensions, type JSONContent } from "@tiptap/core";
import { prosemirrorJSONToYXmlFragment, ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";

import { SLIDES_ORIGIN } from "@/lib/slides/constants";
import { slideTextExtensions, slideTextSchema } from "@/lib/slides/text/extensions";
import {
  blankTextJson, fragmentToJson, isEmptyText, prelimTextFragment, seedBlankParagraph, textJsonToPlain, writeTextJson,
} from "@/lib/slides/text/fragment";
import { canonicalText, RICH_TEXT } from "./helpers/fixtures";

type TreeNode = { name: string; attrs: Record<string, unknown>; children: TreeNode[] } | { text: unknown };

function walk(type: unknown): TreeNode {
  if (type instanceof Y.XmlElement) return { name: type.nodeName, attrs: type.getAttributes(), children: type.toArray().map(walk) };
  if (type instanceof Y.XmlText) return { text: type.toDelta() };
  throw new Error("unexpected Yjs type");
}

function describeFragment(build: (fragment: Y.XmlFragment) => void) {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("t");
  build(fragment);
  const state = Y.encodeStateAsUpdate(doc);
  const decoded = Y.decodeUpdate(state);
  const out = { nodes: fragment.toArray().map(walk), structs: decoded.structs.map((s) => s.constructor.name) };
  doc.destroy();
  return out;
}

describe("slide text schema", () => {
  test("builds headlessly with the expected nodes and marks", () => {
    const schema = slideTextSchema();
    expect(Object.keys(schema.nodes).sort()).toEqual(["bulletList", "doc", "hardBreak", "listItem", "orderedList", "paragraph", "text"]);
    expect(Object.keys(schema.marks).sort()).toEqual(
      ["bold", "highlight", "italic", "link", "strike", "subscript", "superscript", "textStyle", "underline"],
    );
    expect(Object.keys(schema.nodes.paragraph.spec.attrs ?? {}).sort()).toEqual(["dir", "lineHeight", "spaceAfter", "spaceBefore", "textAlign"]);
    // Every paragraph attribute defaults to null, so a blank paragraph stores no attributes (F11).
    expect(Object.values(schema.nodes.paragraph.spec.attrs ?? {}).map((a) => (a as { default?: unknown }).default)).toEqual([null, null, null, null, null]);
    expect(slideTextSchema()).toBe(schema);
  });

  test("the headless extension set adds no sync plugin; a bound one does", () => {
    const headless = new Editor({ element: null, extensions: slideTextExtensions(), content: blankTextJson() });
    expect(headless.extensionManager.plugins.some((p) => p.spec.key === ySyncPluginKey)).toBe(false);
    headless.destroy();
    const doc = new Y.Doc();
    const bound = new Editor({ element: null, extensions: slideTextExtensions({ fragment: doc.getXmlFragment("t") }), content: blankTextJson() });
    expect(bound.extensionManager.plugins.some((p) => p.spec.key === ySyncPluginKey)).toBe(true);
    bound.destroy();
    doc.destroy();
  });

  test("renders pt sizes as stage px, theme refs as CSS variables and a null dir as auto", () => {
    const schema = slideTextSchema();
    const attrs = getAttributesFromExtensions(resolveExtensions(slideTextExtensions()));
    const style = schema.marks.textStyle.create({ fontSize: 24, color: "theme:accent1", fontFamily: "theme:body" });
    expect(getRenderedAttributes(style, attrs).style).toBe("color: var(--slide-color-accent1); font-family: var(--slide-font-body); font-size: 24px");
    const hex = schema.marks.textStyle.create({ color: "#ff0000", fontFamily: "Georgia, serif" });
    expect(getRenderedAttributes(hex, attrs).style).toBe("color: #ff0000; font-family: Georgia, serif");
    const highlight = schema.marks.highlight.create({ color: "theme:accent2" });
    expect(getRenderedAttributes(highlight, attrs)).toMatchObject({ "data-color": "theme:accent2", style: "background-color: var(--slide-color-accent2); color: inherit" });
    // A value that is not a safe colour/font never reaches the style attribute.
    const hostile = schema.marks.textStyle.create({ color: "red;background:url(x)", fontFamily: "x;y" });
    expect(getRenderedAttributes(hostile, attrs).style ?? "").toBe("");
    expect(getRenderedAttributes(schema.nodes.paragraph.create(), attrs).dir).toBe("auto");
    const spaced = schema.nodes.paragraph.create({ dir: "rtl", spaceBefore: 6, lineHeight: 1.5 });
    expect(getRenderedAttributes(spaced, attrs)).toMatchObject({ dir: "rtl", style: "margin-top: 6px; line-height: 1.5" });
  });
});

describe("blank seed", () => {
  test("seedBlankParagraph equals y-tiptap's seed of an empty slide text", () => {
    const seeded = describeFragment((f) => seedBlankParagraph(f));
    const ytiptap = describeFragment((f) => prosemirrorJSONToYXmlFragment(slideTextSchema(), { type: "doc", content: [{ type: "paragraph" }] }, f));
    expect(seeded).toEqual(ytiptap);
    expect(seeded.nodes).toEqual([{ name: "paragraph", attrs: {}, children: [] }]);
  });

  test("seeding an attached fragment that has content is a no-op", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("t");
    writeTextJson(fragment, canonicalText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] }));
    seedBlankParagraph(fragment);
    expect(fragment.length).toBe(1);
    doc.destroy();
  });

  test("blankTextJson is empty; hard breaks and text are not", () => {
    expect(isEmptyText(blankTextJson())).toBe(true);
    expect(isEmptyText({ type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] }] })).toBe(true);
    expect(isEmptyText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "hardBreak" }] }] })).toBe(false);
    expect(isEmptyText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: " " }] }] })).toBe(false);
  });
});

describe("writeTextJson / fragmentToJson", () => {
  test("round trip keeps every mark and attribute", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("t");
    writeTextJson(fragment, RICH_TEXT);
    expect(fragmentToJson(fragment)).toEqual(canonicalText(RICH_TEXT));
    const text = JSON.stringify(fragmentToJson(fragment));
    for (const needle of ['"dir":"rtl"', '"spaceBefore":6', '"lineHeight":1.5', '"fontSize":24', '"color":"theme:accent1"', '"href":"https://example.com/a"', '"start":3', '"hardBreak"']) {
      expect(text).toContain(needle);
    }
    doc.destroy();
  });

  test("a rewrite diffs in place: unchanged paragraphs keep their Y items", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("t");
    const para = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
    writeTextJson(fragment, { type: "doc", content: [para("keep"), para("old")] });
    const first = fragment.get(0);
    writeTextJson(fragment, { type: "doc", content: [para("keep"), para("new"), para("more")] });
    expect(fragment.get(0)).toBe(first);
    expect(textJsonToPlain(fragmentToJson(fragment))).toBe("keep\nnew\nmore");
    doc.destroy();
  });

  test("writes are sanitized and join the caller's transaction", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("t");
    const origins: unknown[] = [];
    doc.on("update", (_update: Uint8Array, origin: unknown) => origins.push(origin));
    doc.transact(() => {
      writeTextJson(fragment, {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }],
      });
    }, SLIDES_ORIGIN);
    expect(origins).toEqual([SLIDES_ORIGIN]);
    expect(JSON.stringify(fragmentToJson(fragment))).not.toContain("javascript");
    doc.destroy();
  });

  test("a prelim fragment carries its content into the doc it joins", () => {
    const doc = new Y.Doc();
    const map = doc.getMap<Y.XmlFragment>("m");
    doc.transact(() => map.set("text", prelimTextFragment(RICH_TEXT)));
    expect(fragmentToJson(map.get("text") as Y.XmlFragment)).toEqual(canonicalText(RICH_TEXT));
    doc.destroy();
  });

  test("textJsonToPlain: paragraphs, bullets, numbers, breaks", () => {
    expect(textJsonToPlain(canonicalText(RICH_TEXT))).toBe("Bold colour\nlink2\n• one\n• two\n  3. nested\n");
  });
});
