// Whole-element formatting on text JSON (used when elements are selected but none is being edited). Results are
// written through the sanitizer, so each case also checks that the output sanitizes to a schema-valid text.
import { describe, expect, test } from "bun:test";
import type { JSONContent } from "@tiptap/core";

import { sanitizeTextJson } from "@/lib/slides/model/validate";
import { slideTextSchema } from "@/lib/slides/text/extensions";
import {
  applyMarkToAll, clearFormattingAll, hasMarkEverywhere, setAlignAll, setFontSizeAll, setParagraphAttrAll, stepFontSizeAll, toggleListAll,
} from "@/lib/slides/text/format-json";

const para = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const text = (value: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

function valid(json: JSONContent): JSONContent {
  const clean = sanitizeTextJson(json);
  expect(() => slideTextSchema().nodeFromJSON(clean).check()).not.toThrow();
  return clean;
}

describe("marks", () => {
  test("simple marks toggle: added unless every run has them", () => {
    const partial = doc(para(text("a", [{ type: "bold" }]), text("b")));
    const bolded = applyMarkToAll(partial, "bold");
    expect(hasMarkEverywhere(bolded, "bold")).toBe(true);
    expect(hasMarkEverywhere(applyMarkToAll(bolded, "bold"), "bold")).toBe(false);
    expect(hasMarkEverywhere(applyMarkToAll(partial, "bold", undefined, true), "bold")).toBe(true);
    valid(bolded);
  });

  test("subscript and superscript exclude each other", () => {
    const sup = applyMarkToAll(doc(para(text("x", [{ type: "subscript" }]))), "superscript", undefined, true);
    expect(sup.content?.[0].content?.[0].marks).toEqual([{ type: "superscript" }]);
  });

  test("textStyle merges attrs; highlight and link replace or remove", () => {
    const styled = applyMarkToAll(doc(para(text("x", [{ type: "textStyle", attrs: { color: "#ff0000" } }]))), "textStyle", { fontFamily: "theme:body" });
    expect(styled.content?.[0].content?.[0].marks).toEqual([{ type: "textStyle", attrs: { color: "#ff0000", fontFamily: "theme:body" } }]);
    const cleared = applyMarkToAll(styled, "textStyle", { color: null, fontFamily: null });
    expect(cleared.content?.[0].content?.[0].marks).toBeUndefined();
    const linked = applyMarkToAll(doc(para(text("x"))), "link", { href: "https://example.com/" });
    expect(valid(linked).content?.[0].content?.[0].marks?.[0]).toMatchObject({ type: "link", attrs: { href: "https://example.com/" } });
    expect(applyMarkToAll(linked, "link", null).content?.[0].content?.[0].marks).toBeUndefined();
    expect(hasMarkEverywhere(doc(para()), "bold")).toBe(false);
  });

  test("font sizes: set everywhere, clear, and step through a list", () => {
    const sized = setFontSizeAll(doc(para(text("a"), text("b", [{ type: "bold" }]))), 24);
    expect(valid(sized).content?.[0].content?.map((n) => n.marks?.find((m) => m.type === "textStyle")?.attrs?.fontSize)).toEqual([24, 24]);
    expect(setFontSizeAll(sized, null).content?.[0].content?.[0].marks).toBeUndefined();
    const steps = [12, 14, 18, 24, 32];
    const up = stepFontSizeAll(doc(para(text("a"), text("b", [{ type: "textStyle", attrs: { fontSize: 24 } }]))), 1, 14, steps);
    expect(up.content?.[0].content?.map((n) => n.marks?.[0]?.attrs?.fontSize)).toEqual([18, 32]);
    const down = stepFontSizeAll(up, -1, 14, steps);
    expect(down.content?.[0].content?.map((n) => n.marks?.[0]?.attrs?.fontSize)).toEqual([14, 24]);
  });
});

describe("paragraphs and lists", () => {
  test("alignment and paragraph attributes on every paragraph, lists included", () => {
    const aligned = setAlignAll(doc(para(text("a")), { type: "bulletList", content: [{ type: "listItem", content: [para(text("b"))] }] }), "center");
    expect(JSON.stringify(valid(aligned)).match(/"textAlign":"center"/g)).toHaveLength(2);
    const rtl = setParagraphAttrAll(doc(para(text("a"))), "dir", "rtl");
    expect(valid(rtl).content?.[0].attrs).toEqual({ dir: "rtl" });
  });

  test("clear formatting drops marks and paragraph attrs but keeps the direction", () => {
    const messy = doc({ type: "paragraph", attrs: { dir: "rtl", textAlign: "right", lineHeight: 2 }, content: [text("a", [{ type: "bold" }])] });
    expect(clearFormattingAll(messy)).toEqual(doc({ type: "paragraph", attrs: { dir: "rtl" }, content: [text("a")] }));
  });

  test("lists: wrap every paragraph, switch kind, toggle off, flatten nesting", () => {
    const plain = doc(para(text("one")), para(text("two")));
    const bullets = toggleListAll(plain, "bullet");
    expect(bullets.content?.map((b) => b.type)).toEqual(["bulletList"]);
    expect(bullets.content?.[0].content).toHaveLength(2);
    valid(bullets);
    const numbered = toggleListAll(bullets, "ordered");
    expect(numbered.content?.map((b) => b.type)).toEqual(["orderedList"]);
    expect(toggleListAll(numbered, "ordered")).toEqual(plain);
    expect(toggleListAll(numbered, "none")).toEqual(plain);
    expect(toggleListAll(doc(), "bullet")).toEqual(doc({ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] }));
  });
});
