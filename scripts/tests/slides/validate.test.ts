// The validator is the one choke point for untrusted slide content: URLs, colours, fonts, numbers, element
// structure and text JSON.
import { afterEach, describe, expect, test } from "bun:test";

import { SLIDES_COORD_LIMIT, SLIDES_MAX_TEXT_CHARS, SLIDES_MAX_TEXT_NODES } from "@/lib/slides/constants";
import { sanitizeFill, sanitizeStroke, sanitizeTheme } from "@/lib/slides/model/sanitize-parts";
import {
  clampCoord, safeColor, safeFontCss, safeHref, safeImageSrc, sanitizeElement, sanitizeTextJson,
} from "@/lib/slides/model/validate";
import { slideTextSchema } from "@/lib/slides/text/extensions";
import { textJsonToPlain } from "@/lib/slides/text/fragment";
import { STARTER_THEMES } from "@/lib/slides/themes/themes";
import { sampleElements } from "./helpers/fixtures";

const ENV = process.env as Record<string, string | undefined>;
const originalNodeEnv = ENV.NODE_ENV;
afterEach(() => {
  ENV.NODE_ENV = originalNodeEnv;
});

describe("safeHref", () => {
  test("allows http, https and mailto", () => {
    expect(safeHref("https://example.com/menu")).toBe("https://example.com/menu");
    expect(safeHref("  http://example.com  ")).toBe("http://example.com/");
    expect(safeHref("mailto:owner@example.com")).toBe("mailto:owner@example.com");
  });

  test("rejects scripts, data, relative links, credentials and whitespace tricks", () => {
    for (const bad of [
      "javascript:alert(1)", "JAVASCRIPT:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "java\nscript:alert(1)",
      "jav\u0000ascript:alert(1)", "‮javascript:alert(1)", "data:text/html,<b>x</b>", "vbscript:msgbox(1)",
      "/relative/path", "example.com", "ftp://example.com", "https://user:pass@example.com/", "", `https://e.com/${"a".repeat(2100)}`,
    ]) {
      expect(safeHref(bad)).toBe("");
    }
  });
});

describe("safeImageSrc", () => {
  test("https only outside development", () => {
    ENV.NODE_ENV = "production";
    expect(safeImageSrc("https://utfs.io/f/abc.png")).toBe("https://utfs.io/f/abc.png");
    expect(safeImageSrc("http://example.com/x.png")).toBe("");
    expect(safeImageSrc("http://localhost:3000/x.png")).toBe("");
  });

  test("http on localhost / 127.0.0.1 only in development, never another host", () => {
    ENV.NODE_ENV = "development";
    expect(safeImageSrc("http://localhost:3000/x.png")).toBe("http://localhost:3000/x.png");
    expect(safeImageSrc("http://127.0.0.1/x.png")).toBe("http://127.0.0.1/x.png");
    expect(safeImageSrc("http://example.com/x.png")).toBe("");
  });

  test("no data:, blob:, javascript:, drive:, relative URLs or credentials", () => {
    for (const bad of [
      "data:image/png;base64,iVBORw0KGgo=", "blob:https://example.com/uuid", "javascript:alert(1)", "drive:abc", "/img.png",
      "img.png", "https://user:pw@example.com/x.png", "https://@example.com:pw@x/x.png",
    ]) {
      expect(safeImageSrc(bad)).toBe("");
    }
  });
});

describe("colours, fonts and numbers", () => {
  test("safeColor: hex (normalized), rgb(), theme slots; nothing else", () => {
    expect(safeColor("#ABC")).toBe("#aabbcc");
    expect(safeColor("#FF0000")).toBe("#ff0000");
    expect(safeColor("rgb(255, 0, 16)")).toBe("#ff0010");
    expect(safeColor("theme:accent3")).toBe("theme:accent3");
    for (const bad of ["theme:accent9", "theme:", "red", "#ff00zz", "url(x)", "#fff;background:red", 5, null]) expect(safeColor(bad)).toBeNull();
  });

  test("safeFontCss: names, quotes, commas and spaces only", () => {
    expect(safeFontCss('"Trebuchet MS", Roboto, sans-serif')).toBe('"Trebuchet MS", Roboto, sans-serif');
    expect(safeFontCss("微软雅黑, sans-serif")).toBe("微软雅黑, sans-serif");
    for (const bad of ["Arial; color: red", "url(x)", "a:b", "x(y)", "", "a".repeat(201), 3]) expect(safeFontCss(bad)).toBeNull();
  });

  test("clampCoord: finite and within the limit, else the fallback", () => {
    expect(clampCoord(12.5, 0)).toBe(12.5);
    expect(clampCoord(1e9, 0)).toBe(SLIDES_COORD_LIMIT);
    expect(clampCoord(-1e9, 0)).toBe(-SLIDES_COORD_LIMIT);
    expect(clampCoord(Number.NaN, 7)).toBe(7);
    expect(clampCoord(Number.POSITIVE_INFINITY, 7)).toBe(7);
    expect(clampCoord("12", 7)).toBe(7);
  });

  test("compound values: invalid fills and strokes are rejected, themes fall back per field", () => {
    expect(sanitizeFill({ t: "solid", color: "nope" })).toBeNull();
    expect(sanitizeFill({ t: "image", src: "http://example.com/x.png", mode: "cover" })).toBeNull();
    expect(sanitizeFill({ t: "linear", angle: 450, stops: [{ pos: 2, color: "#000" }, { pos: -1, color: "#fff" }] }))
      .toEqual({ t: "linear", angle: 90, stops: [{ pos: 0, color: "#ffffff" }, { pos: 1, color: "#000000" }] });
    expect(sanitizeStroke({ color: "#000", width: 9999, dash: "wiggly", head: "rocket" })).toEqual({ color: "#000000", width: 200, dash: "solid" });
    const theme = sanitizeTheme({ id: "paper", colors: { bg: "#123456", text: "javascript:" }, fonts: { heading: "x;y" }, decor: "sparkles" }, STARTER_THEMES["simple-light"]);
    expect(theme.id).toBe("paper");
    expect(theme.colors.bg).toBe("#123456");
    expect(theme.colors.text).toBe(STARTER_THEMES["simple-light"].colors.text);
    expect(theme.fonts.heading).toBe(STARTER_THEMES["simple-light"].fonts.heading);
    expect(theme.decor).toBe("none");
  });
});

describe("sanitizeElement", () => {
  test("rejects garbage: non-objects, bad ids, unknown types, tables without rows", () => {
    for (const bad of [null, 5, "text", [], {}, { id: "a b", type: "text" }, { id: "ok", type: "hologram" }, { id: 'a"b', type: "line" },
      { id: "t", type: "table", rows: [], cols: [{ id: "c", order: "V", w: 10 }] }]) {
      expect(sanitizeElement(bad)).toBeNull();
    }
  });

  test("clamps numbers, strips unsafe URLs and fills defaults", () => {
    const el = sanitizeElement({
      id: "e1", type: "text", x: 1e9, y: Number.NaN, w: -5, h: 40, rot: 725, link: "javascript:alert(1)", name: "a\u0000b",
      fill: { t: "solid", color: "expression(alert(1))" }, stroke: { color: "#000" }, textStyle: { font: "x;y", size: 9999 },
      text: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] },
    });
    expect(el).toMatchObject({
      x: SLIDES_COORD_LIMIT, y: 0, w: 0, h: 40, rot: 5, link: "", name: "ab", fill: { t: "none" },
      stroke: { color: "#000000", width: 2, dash: "solid" }, textStyle: { font: "theme:body", size: 400 },
      geom: { kind: "preset", preset: "rect" }, placeholder: "", locked: false,
    });
  });

  test("an invalid custom path falls back to a rectangle; a valid one is kept", () => {
    const base = { id: "p", type: "shape", text: {} };
    expect(sanitizeElement({ ...base, geom: { kind: "path", d: "M0 0 L10 10 Z", vw: 10, vh: 10, srcPreset: "cloud" } })?.type).toBe("shape");
    const kept = sanitizeElement({ ...base, geom: { kind: "path", d: "M0 0 L10 10 Z", vw: 10, vh: 10, srcPreset: "cloud" } });
    expect(kept && "geom" in kept ? kept.geom : null).toEqual({ kind: "path", d: "M0 0 L10 10 Z", vw: 10, vh: 10, srcPreset: "cloud" });
    for (const geom of [
      { kind: "path", d: "M0 0 url(x)", vw: 10, vh: 10 }, { kind: "path", d: "M0 0 L10 10 e L20 0 Z", vw: 10, vh: 10 },
      { kind: "path", d: "M0 0 L1 1", vw: 0, vh: 10 }, { kind: "preset", preset: "cloud" },
    ]) {
      const el = sanitizeElement({ ...base, geom });
      expect(el && "geom" in el ? el.geom : null).toEqual({ kind: "preset", preset: "rect" });
    }
  });

  test("table cells must sit in the grid; spans stay inside it", () => {
    const el = sanitizeElement({
      id: "t", type: "table", rows: [{ id: "r1", order: "V", h: 10 }], cols: [{ id: "c1", order: "V", w: 10 }, { id: "c2", order: "W", w: 10 }],
      cells: [
        { rowId: "r1", colId: "c1", colSpan: 9, rowSpan: 9, text: {} },
        { rowId: "r1", colId: "c1", fill: "#fff" },
        { rowId: "zz", colId: "c1" },
      ],
    });
    expect(el?.type === "table" ? el.cells.map((c) => [c.rowId, c.colId, c.rowSpan, c.colSpan, c.fill]) : null).toEqual([["r1", "c1", 1, 2, null]]);
  });

  test("sanitizing is idempotent on every element type", () => {
    for (const el of sampleElements()) expect(sanitizeElement(sanitizeElement(el))).toEqual(el);
  });
});

describe("sanitizeTextJson", () => {
  const schema = slideTextSchema();

  test("unknown nodes keep their text, unknown marks and attrs are dropped", () => {
    const out = sanitizeTextJson({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title", marks: [{ type: "comment", attrs: { id: 1 } }, { type: "bold" }] }] },
        { type: "image", attrs: { src: "https://x/y.png" } },
        { type: "paragraph", attrs: { indent: 3, dir: "sideways", textAlign: "center" }, content: [{ type: "mention", text: "@sam" }] },
        { type: "text", text: "loose" },
      ],
    });
    expect(() => schema.nodeFromJSON(out).check()).not.toThrow();
    expect(out.content?.[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Title", marks: [{ type: "bold", attrs: {} }] }] });
    expect(out.content?.[1]).toEqual({ type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "@sam" }] });
    expect(textJsonToPlain(out)).toBe("Title\n@sam\nloose");
  });

  test("unsafe link marks are removed; subscript and superscript exclude each other", () => {
    const out = sanitizeTextJson({
      type: "doc",
      content: [{ type: "paragraph", content: [
        { type: "text", text: "a", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
        { type: "text", text: "b", marks: [{ type: "subscript" }, { type: "superscript" }] },
        { type: "text", text: "c", marks: [{ type: "textStyle", attrs: { color: "red;x", fontFamily: "url(x)", fontSize: "99999" } }] },
      ] }],
    });
    const para = out.content?.[0];
    expect(para?.content?.[0]).toEqual({ type: "text", text: "a" });
    expect(para?.content?.[1].marks?.map((m) => m.type)).toEqual(["superscript"]);
    expect(para?.content?.[2]).toEqual({ type: "text", text: "c" });
  });

  test("CDATA-born markup stays text; garbage becomes one empty paragraph", () => {
    const out = sanitizeTextJson({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "<img src=x onerror=alert(1)>" }] }] });
    expect(out.content?.[0].content?.[0].text).toBe("<img src=x onerror=alert(1)>");
    for (const garbage of [null, 5, "text", [], { type: "doc" }, { type: "doc", content: "x" }]) {
      expect(sanitizeTextJson(garbage)).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    }
  });

  test("caps the text at SLIDES_MAX_TEXT_CHARS", () => {
    const long = "x".repeat(SLIDES_MAX_TEXT_CHARS);
    const out = sanitizeTextJson({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: long }] }, { type: "paragraph", content: [{ type: "text", text: "more" }] }] });
    expect(textJsonToPlain(out).replace(/\n/g, "").length).toBe(SLIDES_MAX_TEXT_CHARS);
  });

  test("lists are repaired: an item always starts with a paragraph, too-deep nesting is flattened", () => {
    const out = sanitizeTextJson({ type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "deep" }] }] }] }] }] }] });
    expect(() => schema.nodeFromJSON(out).check()).not.toThrow();
    let deep: unknown = { type: "paragraph", content: [{ type: "text", text: "x" }] };
    for (let i = 0; i < 20; i++) deep = { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }, deep] }] };
    const flat = sanitizeTextJson({ type: "doc", content: [deep] });
    expect(() => schema.nodeFromJSON(flat).check()).not.toThrow();
    expect(textJsonToPlain(flat)).toContain("x");
  });

  test("any nesting depth: never throws, and what lies past SLIDES_MAX_TEXT_DEPTH keeps its text", () => {
    const wrap = (inner: unknown, n: number, type: string, item = false) => {
      let node = inner;
      for (let i = 0; i < n; i++) node = item ? { type, content: [{ type: "listItem", content: [node] }] } : { type, content: [node] };
      return node;
    };
    const text = { type: "text", text: "x" };
    const cases: Array<[unknown, boolean]> = [
      [{ type: "doc", content: [wrap(text, 5_000, "weird")] }, true],
      [{ type: "doc", content: [{ type: "paragraph", content: [wrap(text, 5_000, "mention")] }] }, true],
      [{ type: "doc", content: [wrap({ type: "paragraph", content: [text] }, 3_000, "bulletList", true)] }, true],
      // Chains longer than the node budget stop at the budget; the result is still a valid doc.
      [{ type: "doc", content: [wrap(text, 20_000, "weird")] }, false],
      [{ type: "doc", content: [wrap(text, 100_000, "weird")] }, false],
      [{ type: "doc", content: [wrap({ type: "paragraph", content: [text] }, 20_000, "orderedList", true)] }, false],
    ];
    for (const [json, keepsText] of cases) {
      const out = sanitizeTextJson(json);
      expect(() => schema.nodeFromJSON(out).check()).not.toThrow();
      if (keepsText) expect(textJsonToPlain(out)).toContain("x");
    }
  });

  test("structure is capped too: empty paragraphs, hard breaks, shared subtrees and huge strings", () => {
    const count = (json: ReturnType<typeof sanitizeTextJson>): number =>
      1 + (json.content ?? []).reduce((sum, child) => sum + count(child), 0);
    const paragraphs = sanitizeTextJson({ type: "doc", content: Array.from({ length: 200_000 }, () => ({ type: "paragraph" })) });
    expect(paragraphs.content?.length).toBeLessThanOrEqual(SLIDES_MAX_TEXT_NODES);
    const breaks = sanitizeTextJson({ type: "doc", content: [{ type: "paragraph", content: Array.from({ length: 200_000 }, () => ({ type: "hardBreak" })) }] });
    expect(breaks.content?.[0].content?.length).toBeLessThanOrEqual(SLIDES_MAX_TEXT_NODES);
    // A DAG with 2^60 paths (a caller's object graph, not JSON) is walked at most SLIDES_MAX_TEXT_NODES times.
    let shared: unknown = { type: "text", text: "x" };
    for (let i = 0; i < 60; i++) shared = { type: "weird", content: [shared, shared] };
    const dag = sanitizeTextJson({ type: "doc", content: [shared] });
    expect(count(dag)).toBeLessThanOrEqual(SLIDES_MAX_TEXT_NODES + 1);
    expect(() => schema.nodeFromJSON(dag).check()).not.toThrow();
    const huge = sanitizeTextJson({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "😀".repeat(5_000_000) }] }] });
    expect(Array.from(huge.content?.[0].content?.[0].text ?? "")).toHaveLength(SLIDES_MAX_TEXT_CHARS);
    expect(huge.content?.[0].content?.[0].text?.endsWith("😀")).toBe(true);
  });
});
