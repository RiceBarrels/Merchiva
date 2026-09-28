// pptxtojson HTML → slide text (lib/slides/import/{html-tokens,html-blocks,html-to-text,fonts}.ts; slides.md §10.1
// steps 4–5). The inputs are the shapes pptxtojson really writes (src/text.js, src/pptxtojson.js getNote), plus the
// hostile ones a crafted file can produce (F14): CDATA-born markup and raw link targets.
import { describe, expect, test } from "bun:test";
import type { JSONContent } from "@tiptap/core";

import { mapFontFamily } from "@/lib/slides/import/fonts";
import { readPptxHtml } from "@/lib/slides/import/html-blocks";
import { decodeEntities, tokenizeHtml } from "@/lib/slides/import/html-tokens";
import { dominantTextDefaults, importHref, parsePptxHtml, type HtmlPurifier } from "@/lib/slides/import/html-to-text";
import { createImportReportBuilder, type ImportReportBuilder } from "@/lib/slides/import/report";
import { DEFAULT_TEXT_DEFAULTS } from "@/lib/slides/model/defaults";
import { safeFontCss } from "@/lib/slides/model/safe-values";
import type { TextDefaults } from "@/lib/slides/model/types";
import { sanitizeTextJson } from "@/lib/slides/model/validate";

import crafted from "./fixtures/pptx-crafted.json";

const D: TextDefaults = { ...DEFAULT_TEXT_DEFAULTS, font: "Calibri, Carlito, \"Segoe UI\", Arial, Roboto, sans-serif", size: 18, color: "#000000" };

function parse(html: string, defaults: TextDefaults = D, report: ImportReportBuilder = createImportReportBuilder(), purify: HtmlPurifier | null = null): JSONContent {
  return parsePptxHtml(html, { report, defaults, purify });
}

/** The text of every text node, in order. */
function texts(json: JSONContent): string[] {
  const out: string[] = [];
  const walk = (node: JSONContent) => {
    if (typeof node.text === "string") out.push(node.text);
    for (const child of node.content ?? []) walk(child);
  };
  walk(json);
  return out;
}

function marksOf(json: JSONContent, text: string): Array<{ type: string; attrs?: Record<string, unknown> }> {
  let found: JSONContent | null = null;
  const walk = (node: JSONContent) => {
    if (node.text === text) found = node;
    for (const child of node.content ?? []) walk(child);
  };
  walk(json);
  if (!found) throw new Error(`no text "${text}"`);
  return ((found as JSONContent).marks ?? []) as Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/** Mark type → its attributes (canonical marks carry every attribute of the schema). */
function marksByType(json: JSONContent, text: string): Record<string, Record<string, unknown>> {
  return Object.fromEntries(marksOf(json, text).map((m) => [m.type, m.attrs ?? {}]));
}

describe("tokenizer", () => {
  test("decodes entities; &nbsp; becomes a plain space", () => {
    expect(decodeEntities("Speaker &lt;notes&gt; &amp; more&nbsp;&#65;&#x42;&unknown;")).toBe("Speaker <notes> & more AB&unknown;");
    expect(decodeEntities("&#0;&#xD800;&#1114112;")).toBe("���");
  });

  test("script and style are dropped with their content; comments and declarations are skipped", () => {
    const tokens = tokenizeHtml(`a<script type="x">alert("</p>")</script>b<style>p{}</style>c<!-- <p>x</p> --><!DOCTYPE html>d<?xml?>e`);
    expect(tokens.filter((t) => t.t === "text").map((t) => (t.t === "text" ? t.text : "")).join("")).toBe("abcde");
    expect(tokens.some((t) => t.t !== "text")).toBe(false);
  });

  test("a lone < is text; an unterminated tag swallows the rest; attributes are decoded", () => {
    expect(tokenizeHtml("1 < 2")).toEqual([{ t: "text", text: "1 < 2" }]);
    expect(tokenizeHtml("x<span style='a")).toEqual([{ t: "text", text: "x" }]);
    expect(tokenizeHtml(`<a HREF="https://e.com/?a=1&amp;b=2">k</a>`)[0]).toEqual({ t: "open", name: "a", attrs: { href: "https://e.com/?a=1&b=2" }, selfClosing: false });
  });
});

describe("parsePptxHtml", () => {
  test("a real pptxtojson paragraph: marks only where a run differs from the element's defaults", () => {
    const html = `<p style="text-align: center;margin-left: 0pt;"><span style="color: #FF0000;font-size: 32pt;font-family: Calibri;font-weight: bold;">Hello&nbsp;</span><span style="color: #000000;font-size: 18pt;font-family: Calibri;font-style: italic;text-decoration: underline;"><a href="https://example.com/a" target="_blank">world</a></span></p>`;
    const json = parse(html);
    expect(json.content?.[0]).toMatchObject({ type: "paragraph", attrs: { textAlign: "center" } });
    const hello = marksByType(json, "Hello ");
    expect(Object.keys(hello).sort()).toEqual(["bold", "textStyle"]);
    expect(hello.textStyle).toEqual({ color: "#ff0000", fontFamily: null, fontSize: 32 });
    const world = marksByType(json, "world");
    expect(Object.keys(world).sort()).toEqual(["italic", "link", "underline"]);
    expect(world.link.href).toBe("https://example.com/a");
  });

  test("the result is canonical slide text (sanitizeTextJson is a no-op on it)", () => {
    const json = parse(`<ul><li><p style="text-align: left;"><span style="color: #123456;">one</span></p></li></ul><p>two</p>`);
    expect(sanitizeTextJson(json)).toEqual(json);
  });

  test("CDATA-born <script> and <img onerror> are dropped; the surrounding text stays", () => {
    const report = createImportReportBuilder();
    const html = String(crafted.slides[0].elements[0].content);
    expect(html).toContain("<script>alert(1)</script>");
    const json = parse(html, D, report);
    const all = texts(json).join("");
    expect(all).toBe("Hi world");
    expect(all).not.toContain("alert");
    expect(JSON.stringify(json)).not.toMatch(/script|onerror|javascript/i);
    expect(report.count("linkRemoved")).toBe(1);
  });

  test("only http(s) links survive; every removed link is counted", () => {
    const report = createImportReportBuilder();
    const links = ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "vbscript:x", "data:text/html,<b>", "mailto:a@b.c", "/relative", "https://ok.example/p", "http://ok.example/q"];
    const json = parse(links.map((href, i) => `<p><a href="${href}">l${i}</a></p>`).join(""), D, report);
    expect(report.count("linkRemoved")).toBe(6);
    expect(marksByType(json, "l6").link.href).toBe("https://ok.example/p");
    expect(marksByType(json, "l7").link.href).toBe("http://ok.example/q");
    for (const i of [0, 1, 2, 3, 4, 5]) expect(marksOf(json, `l${i}`)).toEqual([]);
    expect(importHref("https://user:pw@evil.example/")).toBe("");
  });

  test("pptxtojson's list shape (a nested list after the closed item) nests inside that item", () => {
    const html = `<ul><li><p style="text-align: left;"><span>one</span></p></li><ul><li><p><span>two</span></p></li></ul></ul><ol><li><p><span>three</span></p></li></ol></undefined>`;
    const json = parse(html);
    expect(json.content?.map((n) => n.type)).toEqual(["bulletList", "orderedList"]);
    const first = json.content?.[0].content?.[0];
    expect(first?.content?.map((n) => n.type)).toEqual(["paragraph", "bulletList"]);
    expect(texts(first ?? {})).toEqual(["one", "two"]);
    expect(json.content?.[1]).toMatchObject({ type: "orderedList", attrs: { start: 1 } });
  });

  test("speaker notes (getNote): entities decoded, one paragraph", () => {
    const json = parse(`<p style="text-align:left;">Speaker &lt;notes&gt; &amp; more</p>`);
    expect(json).toEqual({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Speaker <notes> & more" }] }] });
  });

  test("styles → marks: strike, super/sub, gradient text takes its first stop, transparent colour ignored", () => {
    const json = parse(
      `<p><span style="text-decoration-line: line-through;">s</span><span style="vertical-align: super;">2</span><span style="vertical-align: sub;">i</span>`
      + `<span style="background: linear-gradient(90deg, #00ff00 0%, #0000ff 100%); background-clip: text; color: transparent;">g</span></p>`,
    );
    expect(Object.keys(marksByType(json, "s"))).toEqual(["strike"]);
    expect(Object.keys(marksByType(json, "2"))).toEqual(["superscript"]);
    expect(Object.keys(marksByType(json, "i"))).toEqual(["subscript"]);
    expect(marksByType(json, "g")).toEqual({ textStyle: { color: "#00ff00", fontFamily: null, fontSize: null } });
  });

  test("paragraph spacing: pt lengths, pptxtojson's 100×-too-large em, line height as a multiple or in pt", () => {
    const json = parse(`<p style="margin-top: 12pt;margin-bottom: 50em;line-height: 1.5;"><span style="font-size: 20pt;">a</span></p><p style="line-height: 36pt;"><span style="font-size: 24pt;">b</span></p>`);
    expect(json.content?.[0].attrs).toEqual({ spaceBefore: 12, spaceAfter: 10, lineHeight: 1.5 });
    expect(json.content?.[1].attrs).toEqual({ lineHeight: 1.5 });
  });

  test("an empty line (pptxtojson writes one &nbsp;) is an empty paragraph; real spaces stay", () => {
    const json = parse(`<p><span style="font-size: 18pt;">&nbsp;</span></p><p><span>&nbsp;&nbsp;x</span></p>`);
    expect(json.content?.[0]).toEqual({ type: "paragraph" });
    expect(texts(json)).toEqual(["  x"]);
  });

  test("a purifier runs first and its removed links are counted", () => {
    const report = createImportReportBuilder();
    const seen: string[] = [];
    const purify: HtmlPurifier = (html) => {
      seen.push(html);
      return { html: html.replace(/ href="[^"]*"/, ""), removedLinks: 1 };
    };
    const json = parse(`<p><a href="javascript:x">k</a></p>`, D, report, purify);
    expect(seen).toEqual([`<p><a href="javascript:x">k</a></p>`]);
    expect(report.count("linkRemoved")).toBe(1);
    expect(marksOf(json, "k")).toEqual([]);
  });

  test("garbage and empty input give one empty paragraph", () => {
    expect(parse("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(parse("<<<>>><//>")).toMatchObject({ type: "doc" });
  });
});

describe("dominantTextDefaults", () => {
  test("font, size and colour most of the text uses; bold only when all of it is", () => {
    const paragraphs = readPptxHtml(
      `<p style="text-align: center;"><span style="font-size: 28pt;color: #333333;font-family: Arial;font-weight: bold;">A long heading</span><span style="font-size: 12pt;color: #ff0000;">x</span></p>`,
    );
    const d = dominantTextDefaults(paragraphs, DEFAULT_TEXT_DEFAULTS, {});
    expect(d).toMatchObject({ size: 28, color: "#333333", align: "center", bold: false });
    expect(d.font).toStartWith("Arial, ");
    const allBold = dominantTextDefaults(readPptxHtml(`<p><span style="font-weight: 700;">a</span><span style="font-weight: bold;">b</span></p>`), DEFAULT_TEXT_DEFAULTS, {});
    expect(allBold.bold).toBe(true);
    expect(dominantTextDefaults([], DEFAULT_TEXT_DEFAULTS, {})).toEqual({ ...DEFAULT_TEXT_DEFAULTS, bold: false });
  });
});

describe("mapFontFamily", () => {
  test("known families keep their name first and end in Android-available fallbacks", () => {
    expect(mapFontFamily("Calibri").stack).toBe('Calibri, Carlito, "Segoe UI", Arial, Roboto, sans-serif');
    expect(mapFontFamily("Cambria").stack).toBe('Cambria, Caladea, Georgia, "Noto Serif", serif');
    expect(mapFontFamily("Times New Roman").stack).toBe('"Times New Roman", "Liberation Serif", Times, "Noto Serif", serif');
    expect(mapFontFamily("微软雅黑").stack).toBe('微软雅黑, "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Noto Sans CJK SC", sans-serif');
    expect(mapFontFamily("Microsoft YaHei").substituted).toBeNull();
    expect(mapFontFamily("Traditional Arabic").stack).toContain('"Noto Naskh Arabic"');
  });

  test("unknown families keep their name with a generic fallback and are reported", () => {
    expect(mapFontFamily("Mystery Sans")).toEqual({ stack: '"Mystery Sans", sans-serif', substituted: "Mystery Sans" });
  });

  test("hostile names are cleaned to a safe stack; theme codes and empties name no family", () => {
    const hostile = mapFontFamily("Evil;} body{background:url(x)");
    expect(safeFontCss(hostile.stack)).toBe(hostile.stack);
    expect(hostile.stack).not.toMatch(/[;:(){}]/);
    expect(mapFontFamily("mn-cs")).toEqual({ stack: "", substituted: null });
    expect(mapFontFamily("  ")).toEqual({ stack: "", substituted: null });
    expect(mapFontFamily("sans-serif")).toEqual({ stack: "sans-serif", substituted: null });
    for (const name of ["Calibri", "宋体", "Mangal", "3D Font", "O'Neil"]) expect(safeFontCss(mapFontFamily(name).stack)).not.toBeNull();
  });
});
