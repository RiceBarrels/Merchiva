// Unit tests for the OOXML (.docx) reader in lib/docs/import/docx/.
//
// Bun has no DOM, so nothing here goes near `DOMParser` or a zip. The reader is written against `XmlElement` — a
// structural subset of the DOM `Element` — precisely so the parsed-XML half can be driven by the plain records the
// `el` helper below builds. `lib/docs/import/docx/index.ts` (which needs both a real DOM and fflate) is the only
// module left out; everything it orchestrates is covered here.
import { describe, expect, test } from "bun:test";

import { renderBlocks } from "@/lib/docs/import/docx/blocks";
import { createTally, type RenderContext, type RenderZone } from "@/lib/docs/import/docx/context";
import { cssFontFamily, escapeAttr, escapeText, imageToken, replaceImageTokens, stripTags } from "@/lib/docs/import/docx/emit";
import { isEmptyHeaderFooter } from "@/lib/docs/import/docx/header-footer";
import { buildListHtml, type ListEntry } from "@/lib/docs/import/docx/list";
import { levelFormat, numberingLevel, readNumbering } from "@/lib/docs/import/docx/numbering";
import { renderParagraph } from "@/lib/docs/import/docx/paragraph";
import { mimeForPath, readContentTypes, readRels, relsPathFor, relTarget, resolveTarget } from "@/lib/docs/import/docx/parts";
import {
  EMPTY_RUN_PROPS,
  hexColor,
  indentSteps,
  normalizeLineSpacing,
  paragraphStyleString,
  readParaProps,
  readRunProps,
  runStyleString,
} from "@/lib/docs/import/docx/props";
import { inlineText, pageFieldKind, renderInline, symbolChar, wrapRun } from "@/lib/docs/import/docx/run";
import { lastSectionProperties, readEvenAndOddHeaders, readSection } from "@/lib/docs/import/docx/section";
import { blockKindForStyle, readStyles, resolveStyle } from "@/lib/docs/import/docx/styles";
import { columnWidths, planRows, renderTable } from "@/lib/docs/import/docx/table";
import { EMPTY_THEME, readTheme, resolveThemeColor, resolveThemeFont } from "@/lib/docs/import/docx/theme";
import { cssLengthToPx, emuToPx, halfPointsToPt, twipsToPx, vmlStyleValue } from "@/lib/docs/import/docx/units";
import { attr, child, children, descendant, intAttr, localName, toggle, type XmlElement } from "@/lib/docs/import/docx/xml";

/* ------------------------------------------------------------- fixtures */

/** A parsed XML element, without a DOM. `textContent` is self text plus every descendant's, as the DOM defines it. */
function el(tagName: string, attrs: Readonly<Record<string, string>> = {}, kids: XmlElement[] = [], text = ""): XmlElement {
  return {
    tagName,
    children: kids,
    get textContent(): string {
      return text + kids.map((kid) => kid.textContent ?? "").join("");
    },
    getAttribute: (name: string) => (Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null),
  };
}

/** A leaf element with text, e.g. `<w:t xml:space="preserve"> hi </w:t>`. */
function leaf(tagName: string, text: string, attrs: Readonly<Record<string, string>> = {}): XmlElement {
  return el(tagName, attrs, [], text);
}

/** Word stores symbol-font glyphs in the Private Use Area: Wingdings `A8` is written as U+F0A8. */
function wingdings(code: number): string {
  return String.fromCharCode(0xf000 + code);
}

const EMPTY_ZIP = { paths: [] as string[], has: () => false, bytes: () => null, text: () => null };

function context(zone: RenderZone = "body", overrides: Partial<RenderContext["pkg"]> = {}): RenderContext {
  return {
    pkg: {
      zip: EMPTY_ZIP,
      contentTypes: new Map<string, string>(),
      styles: readStyles(null),
      numbering: readNumbering(null),
      theme: EMPTY_THEME,
      ...overrides,
    },
    rels: { byId: new Map() },
    partPath: zone === "body" ? "word/document.xml" : "word/header1.xml",
    zone,
    tally: createTally(),
  };
}

function run(children_: XmlElement[], rPr?: XmlElement): XmlElement {
  return el("w:r", {}, rPr ? [rPr, ...children_] : children_);
}

function textRun(text: string, rPr?: XmlElement): XmlElement {
  return run([leaf("w:t", text)], rPr);
}

/* ------------------------------------------------------------------ xml */

describe("xml accessors", () => {
  const pPr = el("w:pPr", {}, [el("w:jc", { "w:val": "center" }), el("w:b")]);
  const p = el("w:p", {}, [pPr, textRun("hello"), textRun(" world")]);

  test("child / children / attr", () => {
    expect(child(p, "w:pPr")).toBe(pPr);
    expect(children(p, "w:r")).toHaveLength(2);
    expect(children(p)).toHaveLength(3);
    expect(attr(child(pPr, "w:jc"), "w:val")).toBe("center");
    expect(attr(pPr, "w:missing")).toBeNull();
    expect(child(p, "w:tbl")).toBeNull();
  });

  test("lookups fall back to the local name for an unexpected prefix", () => {
    const odd = el("root", {}, [el("wx:pPr", { val: "x" })]);
    expect(child(odd, "w:pPr")).not.toBeNull();
    expect(attr(child(odd, "w:pPr"), "w:val")).toBe("x");
    expect(localName("w:pPr")).toBe("pPr");
    expect(localName("Relationship")).toBe("Relationship");
  });

  test("toggle follows Word's on/off semantics", () => {
    expect(toggle(el("x", {}, [el("w:b")]), "w:b")).toBe(true);
    expect(toggle(el("x", {}, [el("w:b", { "w:val": "1" })]), "w:b")).toBe(true);
    expect(toggle(el("x", {}, [el("w:b", { "w:val": "0" })]), "w:b")).toBe(false);
    expect(toggle(el("x", {}, [el("w:b", { "w:val": "false" })]), "w:b")).toBe(false);
    // Absent means "inherit", not "off" — merging depends on the difference.
    expect(toggle(el("x"), "w:b")).toBeNull();
  });

  test("intAttr keeps signs and rejects junk", () => {
    expect(intAttr(el("x", { "w:top": "-1440" }), "w:top")).toBe(-1440);
    expect(intAttr(el("x", { "w:top": "abc" }), "w:top")).toBeNull();
    expect(intAttr(el("x"), "w:top")).toBeNull();
  });

  test("descendant searches depth-first and never matches the root", () => {
    const tree = el("a:theme", {}, [el("a:themeElements", {}, [el("a:clrScheme", {}, [el("a:dk1")])])]);
    expect(descendant(tree, "a:clrScheme")).not.toBeNull();
    expect(descendant(tree, "a:theme")).toBeNull();
  });
});

/* ---------------------------------------------------------------- units */

describe("unit conversions", () => {
  test("twips → px at 96dpi", () => {
    expect(twipsToPx(1440)).toBe(96);
    expect(twipsToPx(720)).toBe(48);
    expect(twipsToPx(2880)).toBe(192);
    expect(twipsToPx(0)).toBe(0);
    expect(twipsToPx(Number.NaN)).toBe(0);
  });

  test("EMU → px at 96dpi", () => {
    expect(emuToPx(914400)).toBe(96);
    expect(emuToPx(914400 * 2)).toBe(192);
    expect(emuToPx(457200)).toBe(48);
    // 5715000 EMU is the 600px image Word writes for a full-width picture.
    expect(emuToPx(5715000)).toBe(600);
  });

  test("half-points → points", () => {
    expect(halfPointsToPt(22)).toBe(11);
    expect(halfPointsToPt(24)).toBe(12);
    expect(halfPointsToPt(21)).toBe(10.5);
  });

  test("VML style lengths", () => {
    expect(vmlStyleValue("width:120pt;height:90pt", "width")).toBe("120pt");
    expect(vmlStyleValue("width:120pt;height:90pt", "height")).toBe("90pt");
    expect(vmlStyleValue("width:120pt", "left")).toBeNull();
    expect(cssLengthToPx("120pt")).toBe(160);
    expect(cssLengthToPx("96px")).toBe(96);
    expect(cssLengthToPx("1in")).toBe(96);
    expect(cssLengthToPx("junk")).toBeNull();
  });
});

/* ----------------------------------------------------------------- emit */

describe("escaping", () => {
  test("text escapes markup and drops control characters", () => {
    expect(escapeText('<script>alert("x")</script> & more')).toBe("&lt;script&gt;alert(\"x\")&lt;/script&gt; &amp; more");
    expect(escapeText("a\x00b\x08c")).toBe("abc");
    // Tabs and newlines are content, not control noise.
    expect(escapeText("a\tb\nc")).toBe("a\tb\nc");
  });

  test("attribute values also escape quotes", () => {
    expect(escapeAttr('x" onload="alert(1)')).toBe("x&quot; onload=&quot;alert(1)");
    expect(escapeAttr("it's")).toBe("it&#39;s");
  });

  test("a document cannot forge an image placeholder", () => {
    const forged = escapeText(imageToken(0));
    expect(forged).not.toContain("\x00");
    expect(replaceImageTokens(forged, () => "<img>")).toBe(forged);
    expect(replaceImageTokens(`a${imageToken(2)}b`, (i) => `<img data-i="${i}">`)).toBe('a<img data-i="2">b');
  });

  test("font family names cannot escape the style attribute", () => {
    expect(cssFontFamily("Times New Roman")).toBe("'Times New Roman'");
    // Quotes, semicolons, colons and brackets are removed rather than escaped: a mangled name beats a broken rule.
    expect(cssFontFamily('Arial"; background:url(x)')).toBe("'Arial backgroundurlx'");
    expect(cssFontFamily("   ")).toBeNull();
  });

  test("stripTags", () => {
    expect(stripTags("<p>a<strong>b</strong></p>")).toBe("ab");
  });
});

/* ---------------------------------------------------------- run properties */

describe("run properties → style string", () => {
  test("reads colour, size, font and highlight", () => {
    const rPr = el("w:rPr", {}, [
      el("w:b"),
      el("w:i"),
      el("w:u", { "w:val": "single" }),
      el("w:strike"),
      el("w:color", { "w:val": "FF0000" }),
      el("w:sz", { "w:val": "22" }),
      el("w:rFonts", { "w:ascii": "Times New Roman", "w:hAnsi": "Times New Roman" }),
      el("w:highlight", { "w:val": "yellow" }),
    ]);
    const props = readRunProps(rPr, EMPTY_THEME);
    expect(props.bold).toBe(true);
    expect(props.italic).toBe(true);
    expect(props.underline).toBe(true);
    expect(props.strike).toBe(true);
    expect(props.color).toBe("#ff0000");
    expect(props.fontSizePt).toBe(11);
    expect(props.fontFamily).toBe("Times New Roman");
    expect(props.highlight).toBe("#ffff00");
    expect(runStyleString(props)).toBe("color:#ff0000;font-size:11pt;font-family:'Times New Roman'");
  });

  test("`w:u w:val=none` is an explicit off, and `w:color auto` is not a colour", () => {
    const props = readRunProps(el("w:rPr", {}, [el("w:u", { "w:val": "none" }), el("w:color", { "w:val": "auto" })]), EMPTY_THEME);
    expect(props.underline).toBe(false);
    expect(props.color).toBeNull();
    expect(runStyleString(props)).toBe("");
  });

  test("a run-level `w:shd` fill is a highlight", () => {
    const props = readRunProps(el("w:rPr", {}, [el("w:shd", { "w:val": "clear", "w:fill": "C0FFEE" })]), EMPTY_THEME);
    expect(props.highlight).toBe("#c0ffee");
  });

  test("vertical alignment and hidden text", () => {
    expect(readRunProps(el("w:rPr", {}, [el("w:vertAlign", { "w:val": "superscript" })]), EMPTY_THEME).vertAlign).toBe("superscript");
    expect(readRunProps(el("w:rPr", {}, [el("w:vertAlign", { "w:val": "subscript" })]), EMPTY_THEME).vertAlign).toBe("subscript");
    expect(readRunProps(el("w:rPr", {}, [el("w:vanish")]), EMPTY_THEME).vanish).toBe(true);
  });

  test("theme colours and theme fonts resolve through theme1.xml", () => {
    const theme = readTheme(
      el("a:theme", {}, [
        el("a:themeElements", {}, [
          el("a:clrScheme", {}, [
            el("a:dk1", {}, [el("a:sysClr", { val: "windowText", lastClr: "000000" })]),
            el("a:accent1", {}, [el("a:srgbClr", { val: "4472C4" })]),
          ]),
          el("a:fontScheme", {}, [
            el("a:majorFont", {}, [el("a:latin", { typeface: "Calibri Light" })]),
            el("a:minorFont", {}, [el("a:latin", { typeface: "Calibri" })]),
          ]),
        ]),
      ]),
    );
    expect(resolveThemeColor(theme, "accent1", null, null)).toBe("4472c4");
    expect(resolveThemeColor(theme, "text1", null, null)).toBe("000000");
    expect(resolveThemeColor(theme, "nope", null, null)).toBeNull();
    // Lighter 40%: a tint blends toward white.
    expect(resolveThemeColor(theme, "accent1", "99", null)).not.toBe("4472c4");
    expect(resolveThemeFont(theme, "minorHAnsi")).toBe("Calibri");
    expect(resolveThemeFont(theme, "majorHAnsi")).toBe("Calibri Light");

    const props = readRunProps(
      el("w:rPr", {}, [el("w:color", { "w:themeColor": "accent1" }), el("w:rFonts", { "w:asciiTheme": "minorHAnsi" })]),
      theme,
    );
    expect(props.color).toBe("#4472c4");
    expect(props.fontFamily).toBe("Calibri");
  });

  test("wrapRun nests the semantic tags inside the span and the mark", () => {
    const props = { ...EMPTY_RUN_PROPS, bold: true, italic: true, color: "#ff0000", highlight: "#ffff00" };
    expect(wrapRun("x", props)).toBe('<mark data-color="#ffff00"><span style="color:#ff0000"><strong><em>x</em></strong></span></mark>');
    expect(wrapRun("", props)).toBe("");
    expect(wrapRun("x", { ...EMPTY_RUN_PROPS, vertAlign: "superscript" })).toBe("<sup>x</sup>");
    expect(wrapRun("x", { ...EMPTY_RUN_PROPS, strike: true, underline: true })).toBe("<u><s>x</s></u>");
  });

  test("hexColor", () => {
    expect(hexColor("FF0000")).toBe("#ff0000");
    expect(hexColor("#00ff00")).toBe("#00ff00");
    expect(hexColor("auto")).toBeNull();
    expect(hexColor("fff")).toBeNull();
    expect(hexColor(null)).toBeNull();
  });
});

/* --------------------------------------------------- paragraph properties */

describe("paragraph properties → style string", () => {
  test("alignment, indent, line spacing and shading", () => {
    const pPr = el("w:pPr", {}, [
      el("w:jc", { "w:val": "both" }),
      el("w:ind", { "w:left": "1440", "w:firstLine": "720" }),
      el("w:spacing", { "w:line": "360", "w:lineRule": "auto" }),
      el("w:shd", { "w:val": "clear", "w:fill": "EEEEEE" }),
      el("w:pageBreakBefore"),
    ]);
    const props = readParaProps(pPr);
    expect(props.align).toBe("justify");
    expect(props.indentLeftTwips).toBe(1440);
    expect(props.firstLineTwips).toBe(720);
    expect(props.lineSpacing).toBe(1.5);
    expect(props.shading).toBe("#eeeeee");
    expect(props.pageBreakBefore).toBe(true);
    expect(paragraphStyleString(props)).toBe("text-align:justify;margin-left:1in;text-indent:0.5in;line-height:1.5;background-color:#eeeeee");
  });

  test("`w:start` is read as `w:left`, and a hanging indent is a negative first line", () => {
    const props = readParaProps(el("w:pPr", {}, [el("w:ind", { "w:start": "720", "w:hanging": "360" })]));
    expect(props.indentLeftTwips).toBe(720);
    expect(paragraphStyleString(props)).toBe("margin-left:0.5in;text-indent:-0.25in");
  });

  test("a list item's indent comes from the list markup, not the paragraph", () => {
    const props = readParaProps(el("w:pPr", {}, [el("w:ind", { "w:left": "720" }), el("w:jc", { "w:val": "center" })]));
    expect(paragraphStyleString(props, { skipIndent: true })).toBe("text-align:center");
  });

  test("indent steps are half inches, clamped to the editor's 0–8", () => {
    expect(indentSteps(0)).toBe(0);
    expect(indentSteps(720)).toBe(1);
    expect(indentSteps(1440)).toBe(2);
    expect(indentSteps(900)).toBe(1);
    expect(indentSteps(99999)).toBe(8);
    expect(indentSteps(-720)).toBe(0);
    expect(indentSteps(null)).toBe(0);
  });

  test("line spacing snaps to the values the editor accepts", () => {
    expect(normalizeLineSpacing(240, "auto")).toBe(1);
    expect(normalizeLineSpacing(276, "auto")).toBe(1.15);
    expect(normalizeLineSpacing(360, "auto")).toBe(1.5);
    expect(normalizeLineSpacing(480, "auto")).toBe(2);
    // Within tolerance of 1.15.
    expect(normalizeLineSpacing(278, "auto")).toBe(1.15);
    // Outside it: the raw multiplier survives.
    expect(normalizeLineSpacing(312, "auto")).toBe(1.3);
    // `exact` / `atLeast` are absolute heights the editor has no attribute for.
    expect(normalizeLineSpacing(360, "exact")).toBeNull();
    expect(normalizeLineSpacing(null, "auto")).toBeNull();
  });
});

/* --------------------------------------------------------------- styles */

describe("style table", () => {
  const stylesXml = el("w:styles", {}, [
    el("w:docDefaults", {}, [
      el("w:rPrDefault", {}, [el("w:rPr", {}, [el("w:rFonts", { "w:ascii": "Calibri" }), el("w:sz", { "w:val": "22" })])]),
      el("w:pPrDefault", {}, [el("w:pPr", {}, [el("w:spacing", { "w:line": "276", "w:lineRule": "auto" })])]),
    ]),
    el("w:style", { "w:type": "paragraph", "w:styleId": "Normal", "w:default": "1" }, [el("w:name", { "w:val": "Normal" })]),
    el("w:style", { "w:type": "paragraph", "w:styleId": "Heading1" }, [
      el("w:name", { "w:val": "heading 1" }),
      el("w:basedOn", { "w:val": "Normal" }),
      el("w:pPr", {}, [el("w:outlineLvl", { "w:val": "0" })]),
      el("w:rPr", {}, [el("w:color", { "w:val": "2F5496" }), el("w:sz", { "w:val": "32" })]),
    ]),
    el("w:style", { "w:type": "paragraph", "w:styleId": "Callout" }, [
      el("w:name", { "w:val": "Callout" }),
      el("w:basedOn", { "w:val": "Heading1" }),
      el("w:rPr", {}, [el("w:i")]),
    ]),
    el("w:style", { "w:type": "paragraph", "w:styleId": "TitleStyle" }, [el("w:name", { "w:val": "Title" })]),
    el("w:style", { "w:type": "paragraph", "w:styleId": "Heading7" }, [el("w:name", { "w:val": "heading 7" })]),
    el("w:style", { "w:type": "character", "w:styleId": "Emphatic" }, [
      el("w:name", { "w:val": "Emphatic" }),
      el("w:rPr", {}, [el("w:b"), el("w:color", { "w:val": "00AA00" })]),
    ]),
    // A cycle a hand-edited styles.xml can have; resolution must terminate.
    el("w:style", { "w:type": "paragraph", "w:styleId": "Loop" }, [el("w:basedOn", { "w:val": "Loop" })]),
  ]);
  const styles = readStyles(stylesXml, EMPTY_THEME);

  test("document defaults apply to every paragraph", () => {
    const base = resolveStyle(styles, null);
    expect(base.runProps.fontFamily).toBe("Calibri");
    expect(base.runProps.fontSizePt).toBe(11);
    expect(base.paraProps.lineSpacing).toBe(1.15);
  });

  test("a style's run properties are inherited through `w:basedOn`", () => {
    const heading = resolveStyle(styles, "Heading1");
    expect(heading.runProps.color).toBe("#2f5496");
    expect(heading.runProps.fontSizePt).toBe(16);
    // Not overridden anywhere in the chain, so the document default survives.
    expect(heading.runProps.fontFamily).toBe("Calibri");

    const callout = resolveStyle(styles, "Callout");
    expect(callout.runProps.italic).toBe(true);
    expect(callout.runProps.color).toBe("#2f5496");
  });

  test("block kinds honour both `w:styleId` and `w:name`, and follow `w:basedOn`", () => {
    expect(blockKindForStyle(styles, "Heading1")).toBe("h1");
    // Recognised by its name, not its id.
    expect(blockKindForStyle(styles, "TitleStyle")).toBe("title");
    // Headings past 3 clamp, so they stay headings instead of becoming paragraphs.
    expect(blockKindForStyle(styles, "Heading7")).toBe("h3");
    // A custom style based on a heading is one.
    expect(blockKindForStyle(styles, "Callout")).toBe("h1");
    expect(blockKindForStyle(styles, "Normal")).toBeNull();
    expect(blockKindForStyle(styles, "Nonexistent")).toBeNull();
    expect(blockKindForStyle(styles, null)).toBeNull();
  });

  test("a `w:basedOn` cycle terminates", () => {
    expect(() => resolveStyle(styles, "Loop")).not.toThrow();
    expect(blockKindForStyle(styles, "Loop")).toBeNull();
  });

  test("an absent styles.xml yields a usable empty table", () => {
    const empty = readStyles(null);
    expect(resolveStyle(empty, "Heading1").runProps).toEqual(EMPTY_RUN_PROPS);
    expect(blockKindForStyle(empty, "Heading1")).toBeNull();
  });
});

/* ------------------------------------------------------------ numbering */

describe("numbering level → list type", () => {
  test("numFmt decides bullet vs. ordered", () => {
    expect(levelFormat("bullet", "•")).toEqual({ format: "bullet", checked: false });
    expect(levelFormat("decimal", "%1.")).toEqual({ format: "ordered", checked: false });
    expect(levelFormat("lowerLetter", "%1)")).toEqual({ format: "ordered", checked: false });
    expect(levelFormat("upperRoman", "%1.")).toEqual({ format: "ordered", checked: false });
    // No marker at all is closer to a <ul> than to invented numbers.
    expect(levelFormat("none", "")).toEqual({ format: "bullet", checked: false });
    expect(levelFormat(null, null)).toEqual({ format: "bullet", checked: false });
  });

  test("a Wingdings ballot box makes it a task list", () => {
    // Word writes Wingdings A8 (empty box) and FE (ticked box) into the Private Use Area.
    expect(levelFormat("bullet", wingdings(0xa8))).toEqual({ format: "task", checked: false });
    expect(levelFormat("bullet", wingdings(0xfe))).toEqual({ format: "task", checked: true });
    expect(levelFormat("bullet", "☐")).toEqual({ format: "task", checked: false });
    expect(levelFormat("bullet", "☑")).toEqual({ format: "task", checked: true });
    // A plain bullet stays a bullet.
    expect(levelFormat("bullet", wingdings(0xb7))).toEqual({ format: "bullet", checked: false });
  });

  test("numId → abstractNumId → level, with start values and overrides", () => {
    const table = readNumbering(
      el("w:numbering", {}, [
        el("w:abstractNum", { "w:abstractNumId": "0" }, [
          el("w:lvl", { "w:ilvl": "0" }, [el("w:numFmt", { "w:val": "decimal" }), el("w:start", { "w:val": "3" }), el("w:lvlText", { "w:val": "%1." })]),
          el("w:lvl", { "w:ilvl": "1" }, [el("w:numFmt", { "w:val": "lowerLetter" }), el("w:start", { "w:val": "1" })]),
        ]),
        el("w:abstractNum", { "w:abstractNumId": "1" }, [
          el("w:lvl", { "w:ilvl": "0" }, [el("w:numFmt", { "w:val": "bullet" }), el("w:lvlText", { "w:val": wingdings(0xa8) })]),
        ]),
        el("w:num", { "w:numId": "5" }, [el("w:abstractNumId", { "w:val": "0" })]),
        el("w:num", { "w:numId": "6" }, [el("w:abstractNumId", { "w:val": "1" })]),
        el("w:num", { "w:numId": "7" }, [
          el("w:abstractNumId", { "w:val": "0" }),
          el("w:lvlOverride", { "w:ilvl": "0" }, [el("w:startOverride", { "w:val": "10" })]),
        ]),
      ]),
    );
    expect(numberingLevel(table, 5, 0)).toEqual({ format: "ordered", start: 3, checked: false });
    expect(numberingLevel(table, 5, 1)).toEqual({ format: "ordered", start: 1, checked: false });
    // Deeper than the definition falls back to its deepest level.
    expect(numberingLevel(table, 5, 4)).toEqual({ format: "ordered", start: 1, checked: false });
    expect(numberingLevel(table, 6, 0)).toEqual({ format: "task", start: 1, checked: false });
    // A `w:startOverride` replaces the start but keeps the format.
    expect(numberingLevel(table, 7, 0)).toEqual({ format: "ordered", start: 10, checked: false });
    expect(numberingLevel(table, 99, 0)).toBeNull();
    expect(numberingLevel(table, null, 0)).toBeNull();
  });

  test("`w:numStyleLink` borrows another abstract definition's levels", () => {
    const table = readNumbering(
      el("w:numbering", {}, [
        el("w:abstractNum", { "w:abstractNumId": "0" }, [
          el("w:styleLink", { "w:val": "ListBullet" }),
          el("w:lvl", { "w:ilvl": "0" }, [el("w:numFmt", { "w:val": "bullet" }), el("w:lvlText", { "w:val": "•" })]),
        ]),
        el("w:abstractNum", { "w:abstractNumId": "1" }, [el("w:numStyleLink", { "w:val": "ListBullet" })]),
        el("w:num", { "w:numId": "2" }, [el("w:abstractNumId", { "w:val": "1" })]),
      ]),
    );
    expect(numberingLevel(table, 2, 0)).toEqual({ format: "bullet", start: 1, checked: false });
  });
});

/* ----------------------------------------------------- list state machine */

describe("list nesting state machine", () => {
  const entry = (over: Partial<ListEntry> & Pick<ListEntry, "html">): ListEntry => ({
    kind: "bullet",
    level: 0,
    numId: 1,
    start: 1,
    checked: false,
    ...over,
  });

  test("a deeper level nests inside the previous item", () => {
    expect(
      buildListHtml([
        entry({ html: "<p>A</p>" }),
        entry({ level: 1, html: "<p>B</p>" }),
        entry({ html: "<p>C</p>" }),
      ]),
    ).toBe("<ul><li><p>A</p><ul><li><p>B</p></li></ul></li><li><p>C</p></li></ul>");
  });

  test("several levels deep, closing back out in order", () => {
    expect(
      buildListHtml([
        entry({ html: "A" }),
        entry({ level: 1, html: "B" }),
        entry({ level: 2, html: "C" }),
        entry({ html: "D" }),
      ]),
    ).toBe("<ul><li>A<ul><li>B<ul><li>C</li></ul></li></ul></li><li>D</li></ul>");
  });

  test("an ordered list carries its start only when it isn't 1", () => {
    expect(buildListHtml([entry({ kind: "ordered", html: "A" })])).toBe("<ol><li>A</li></ol>");
    expect(buildListHtml([entry({ kind: "ordered", start: 5, html: "A" })])).toBe('<ol start="5"><li>A</li></ol>');
  });

  test("task items get the editor's task-list attributes", () => {
    expect(
      buildListHtml([entry({ kind: "task", checked: true, html: "A" }), entry({ kind: "task", html: "B" })]),
    ).toBe(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">A</li>' +
        '<li data-type="taskItem" data-checked="false">B</li></ul>',
    );
  });

  test("a different kind at the same level starts a sibling list", () => {
    expect(buildListHtml([entry({ html: "A" }), entry({ kind: "ordered", html: "B" })])).toBe(
      "<ul><li>A</li></ul><ol><li>B</li></ol>",
    );
  });

  test("a different numId at the same level starts a new list, so numbering restarts", () => {
    expect(buildListHtml([entry({ kind: "ordered", html: "A" }), entry({ kind: "ordered", numId: 2, html: "B" })])).toBe(
      "<ol><li>A</li></ol><ol><li>B</li></ol>",
    );
  });

  test("a nested list of a different kind stays inside its parent item", () => {
    expect(buildListHtml([entry({ html: "A" }), entry({ kind: "ordered", level: 1, html: "B" }), entry({ html: "C" })])).toBe(
      "<ul><li>A<ol><li>B</li></ol></li><li>C</li></ul>",
    );
  });

  test("a level Word skipped still opens exactly one nested list", () => {
    expect(buildListHtml([entry({ html: "A" }), entry({ level: 3, html: "B" })])).toBe(
      "<ul><li>A<ul><li>B</li></ul></li></ul>",
    );
  });

  test("no entries, one entry", () => {
    expect(buildListHtml([])).toBe("");
    expect(buildListHtml([entry({ html: "A" })])).toBe("<ul><li>A</li></ul>");
  });
});

/* ---------------------------------------------------------------- parts */

describe("relationships", () => {
  test("rels paths and target resolution", () => {
    expect(relsPathFor("word/document.xml")).toBe("word/_rels/document.xml.rels");
    expect(relsPathFor("word/header2.xml")).toBe("word/_rels/header2.xml.rels");
    expect(relsPathFor("")).toBe("_rels/.rels");
    expect(resolveTarget("word/", "media/image1.png")).toBe("word/media/image1.png");
    expect(resolveTarget("word/", "../customXml/item1.xml")).toBe("customXml/item1.xml");
    expect(resolveTarget("word/", "/word/media/image1.png")).toBe("word/media/image1.png");
    expect(resolveTarget("word/", "./media/a.png")).toBe("word/media/a.png");
  });

  test("a part's own rels resolve relative to its folder", () => {
    const rels = readRels(
      el("Relationships", {}, [
        el("Relationship", { Id: "rId1", Type: ".../image", Target: "media/image1.png" }),
        el("Relationship", { Id: "rId2", Type: ".../hyperlink", Target: "https://example.com/a", TargetMode: "External" }),
        el("Relationship", { Id: "rId3", Type: ".../header", Target: "header1.xml" }),
      ]),
      "word/document.xml",
    );
    expect(relTarget(rels, "rId1")?.target).toBe("word/media/image1.png");
    expect(relTarget(rels, "rId2")).toEqual({ id: "rId2", type: ".../hyperlink", target: "https://example.com/a", external: true });
    expect(relTarget(rels, "rId3")?.target).toBe("word/header1.xml");
    expect(relTarget(rels, "rId9")).toBeNull();
    expect(relTarget(rels, null)).toBeNull();
  });

  test("media types come from [Content_Types].xml first", () => {
    const types = readContentTypes(
      el("Types", {}, [el("Default", { Extension: "png", ContentType: "image/png" }), el("Default", { Extension: "bin", ContentType: "image/jpeg" })]),
    );
    expect(mimeForPath(types, "word/media/a.png")).toBe("image/png");
    expect(mimeForPath(types, "word/media/a.bin")).toBe("image/jpeg");
    // Falls back to the static table for an extension the package didn't declare.
    expect(mimeForPath(types, "word/media/a.jpeg")).toBe("image/jpeg");
    expect(mimeForPath(types, "word/media/a.xyz")).toBe("application/octet-stream");
  });
});

/* -------------------------------------------------------------- sections */

describe("sectPr → page setup", () => {
  test("US Letter portrait with margins and header distances", () => {
    const sectPr = el("w:sectPr", {}, [
      el("w:headerReference", { "w:type": "default", "r:id": "rId7" }),
      el("w:footerReference", { "w:type": "first", "r:id": "rId9" }),
      el("w:pgSz", { "w:w": "12240", "w:h": "15840" }),
      el("w:pgMar", { "w:top": "1440", "w:right": "1080", "w:bottom": "1440", "w:left": "1080", "w:header": "720", "w:footer": "720" }),
      el("w:titlePg"),
    ]);
    const section = readSection(sectPr, false);
    expect(section.pageSetup).toEqual({
      paper: "letter",
      orientation: "portrait",
      margins: { top: 1, right: 0.75, bottom: 1, left: 0.75 },
      headerDistance: 0.5,
      footerDistance: 0.5,
      differentFirstPage: true,
      differentOddEven: false,
    });
    expect(section.headerRefs).toEqual({ default: "rId7" });
    expect(section.footerRefs).toEqual({ first: "rId9" });
  });

  test("A4 landscape is named, and custom dimensions are stored portrait-first", () => {
    const a4 = readSection(el("w:sectPr", {}, [el("w:pgSz", { "w:w": "16838", "w:h": "11906", "w:orient": "landscape" })]), false);
    expect(a4.pageSetup?.paper).toBe("a4");
    expect(a4.pageSetup?.orientation).toBe("landscape");

    const custom = readSection(el("w:sectPr", {}, [el("w:pgSz", { "w:w": "28800", "w:h": "14400" })]), false);
    expect(custom.pageSetup?.paper).toBe("custom");
    expect(custom.pageSetup?.orientation).toBe("landscape");
    expect(custom.pageSetup?.customWidth).toBe(10);
    expect(custom.pageSetup?.customHeight).toBe(20);
  });

  test("negative top/bottom margins keep their magnitude", () => {
    const section = readSection(el("w:sectPr", {}, [el("w:pgMar", { "w:top": "-720", "w:bottom": "1440", "w:left": "1440", "w:right": "1440" })]), false);
    expect(section.pageSetup?.margins?.top).toBe(0.5);
  });

  test("`w:evenAndOddHeaders` comes from settings.xml", () => {
    expect(readEvenAndOddHeaders(el("w:settings", {}, [el("w:evenAndOddHeaders")]))).toBe(true);
    expect(readEvenAndOddHeaders(el("w:settings"))).toBe(false);
    expect(readEvenAndOddHeaders(null)).toBe(false);
    expect(readSection(el("w:sectPr"), true).pageSetup?.differentOddEven).toBe(true);
  });

  test("the last sectPr in the body wins, and a body without one yields null", () => {
    const first = el("w:sectPr", { id: "first" });
    const last = el("w:sectPr", { id: "last" });
    expect(lastSectionProperties(el("w:body", {}, [first, el("w:p"), last]))).toBe(last);
    expect(lastSectionProperties(el("w:body", {}, [el("w:p")]))).toBeNull();
    expect(readSection(null, false).pageSetup).toBeNull();
  });
});

/* ----------------------------------------------------------------- runs */

describe("runs and fields", () => {
  test("a run keeps its text, breaks and tabs", () => {
    const p = el("w:p", {}, [run([leaf("w:t", "a"), el("w:br"), leaf("w:t", "b"), el("w:tab"), leaf("w:t", "c")])]);
    const ctx = context();
    expect(renderInline(p, ctx, { base: EMPTY_RUN_PROPS })).toEqual(["a<br>b&nbsp;&nbsp;c"]);
    // A lost tab stop is counted once, however many there are.
    expect(ctx.tally.warnings).toBe(1);
  });

  test("`xml:space=preserve` whitespace survives and text is escaped", () => {
    const p = el("w:p", {}, [run([leaf("w:t", " a < b ", { "xml:space": "preserve" })])]);
    expect(renderInline(p, context(), { base: EMPTY_RUN_PROPS })).toEqual([" a &lt; b "]);
  });

  test("a page break splits the paragraph into segments", () => {
    const p = el("w:p", {}, [run([leaf("w:t", "before"), el("w:br", { "w:type": "page" }), leaf("w:t", "after")])]);
    expect(renderInline(p, context(), { base: EMPTY_RUN_PROPS })).toEqual(["before", "after"]);
  });

  test("hidden runs are dropped", () => {
    const p = el("w:p", {}, [textRun("shown"), textRun("hidden", el("w:rPr", {}, [el("w:vanish")]))]);
    expect(renderInline(p, context(), { base: EMPTY_RUN_PROPS })).toEqual(["shown"]);
  });

  test("tracked deletions are not content; insertions are", () => {
    const p = el("w:p", {}, [el("w:ins", {}, [textRun("kept")]), el("w:del", {}, [run([leaf("w:delText", "gone")])])]);
    expect(renderInline(p, context(), { base: EMPTY_RUN_PROPS })).toEqual(["kept"]);
  });

  test("a hyperlink resolves through the part's rels; an anchor becomes a fragment", () => {
    const ctx = context();
    const rels = readRels(
      el("Relationships", {}, [el("Relationship", { Id: "rId4", Type: ".../hyperlink", Target: "https://example.com/", TargetMode: "External" })]),
      "word/document.xml",
    );
    const linked: RenderContext = { ...ctx, rels };
    const p = el("w:p", {}, [
      el("w:hyperlink", { "r:id": "rId4" }, [textRun("site")]),
      el("w:hyperlink", { "w:anchor": "top" }, [textRun("up")]),
    ]);
    expect(renderInline(p, linked, { base: EMPTY_RUN_PROPS })).toEqual(['<a href="https://example.com/">site</a><a href="#top">up</a>']);
  });

  test("a javascript: relationship target is not turned into a link", () => {
    const rels = readRels(
      el("Relationships", {}, [el("Relationship", { Id: "rId4", Type: ".../hyperlink", Target: "javascript:alert(1)", TargetMode: "External" })]),
      "word/document.xml",
    );
    const p = el("w:p", {}, [el("w:hyperlink", { "r:id": "rId4" }, [textRun("click")])]);
    expect(renderInline(p, { ...context(), rels }, { base: EMPTY_RUN_PROPS })).toEqual(["click"]);
  });

  test("symbols map to real characters, and unmapped ones warn once", () => {
    expect(symbolChar("Wingdings", "F0FC")).toBe("✔");
    expect(symbolChar("Wingdings", "F0A8")).toBe("☐");
    expect(symbolChar("Symbol", "F0B7")).toBe("•");
    expect(symbolChar("Wingdings", "F041")).toBeNull();
    expect(symbolChar("Wingdings", null)).toBeNull();

    const ctx = context();
    const p = el("w:p", {}, [run([el("w:sym", { "w:font": "Wingdings", "w:char": "F0FC" }), el("w:sym", { "w:font": "Wingdings", "w:char": "F041" })])]);
    expect(renderInline(p, ctx, { base: EMPTY_RUN_PROPS })).toEqual(["✔"]);
    expect(ctx.tally.warnings).toBe(1);
  });

  test("inlineText collects the plain text of a paragraph", () => {
    const p = el("w:p", {}, [el("w:pPr", {}, [el("w:pStyle", { "w:val": "Title" })]), textRun("Quarterly "), textRun("Report")]);
    expect(inlineText(p)).toBe("Quarterly Report");
  });
});

/* ------------------------------------------------------- shapes and text boxes */

describe("shapes", () => {
  const textBox = (...lines: string[]): XmlElement =>
    el("w:txbxContent", {}, lines.map((line) => el("w:p", {}, [textRun(line)])));

  const inlineOf = (node: XmlElement, ctx: RenderContext): string =>
    renderInline(el("w:p", {}, [run([node])]), ctx, { base: EMPTY_RUN_PROPS }).join("");

  test("a DrawingML text box gives up its prose, one line per paragraph", () => {
    const ctx = context();
    const drawing = el("w:drawing", {}, [
      el("wp:anchor", {}, [el("a:graphic", {}, [el("wps:wsp", {}, [el("wps:txbx", {}, [textBox("Draft only", "Do not circulate")])])])]),
    ]);
    expect(inlineOf(drawing, ctx)).toBe("Draft only<br>Do not circulate");
    // The shape is lost, the words are not — and a second text box in the same part doesn't warn again.
    expect(ctx.tally.warnings).toBe(1);
  });

  test("a legacy VML text box works the same way", () => {
    const ctx = context();
    const pict = el("w:pict", {}, [el("v:shape", {}, [el("v:textbox", {}, [textBox("Confidential")])])]);
    expect(inlineOf(pict, ctx)).toBe("Confidential");
    expect(ctx.tally.warnings).toBe(1);
  });

  test("text-box prose is escaped like any other document text", () => {
    const ctx = context();
    const drawing = el("w:drawing", {}, [el("wps:txbx", {}, [textBox("<b>Q3</b> & Q4")])]);
    expect(inlineOf(drawing, ctx)).toBe("&lt;b&gt;Q3&lt;/b&gt; &amp; Q4");
  });

  test("a chart or SmartArt has no prose to keep and is dropped", () => {
    const ctx = context();
    const chart = el("w:drawing", {}, [el("wp:inline", {}, [el("a:graphic", {}, [el("c:chart", { "r:id": "rId9" })])])]);
    expect(inlineOf(chart, ctx)).toBe("");
    expect(ctx.tally.warnings).toBe(1);
  });

  test("an empty text box is not content", () => {
    const ctx = context();
    expect(inlineOf(el("w:drawing", {}, [el("wps:txbx", {}, [el("w:txbxContent", {}, [el("w:p", {})])])]), ctx)).toBe("");
    expect(ctx.tally.warnings).toBe(1);
  });

  test("a header text box keeps its text too", () => {
    const ctx = context("header");
    const pict = el("w:pict", {}, [el("v:shape", {}, [el("v:textbox", {}, [textBox("Merchiva")])])]);
    expect(inlineOf(pict, ctx)).toBe("Merchiva");
  });
});

describe("field runs → page-field span", () => {
  const pageField = (instruction: string): XmlElement =>
    el("w:p", {}, [
      run([el("w:fldChar", { "w:fldCharType": "begin" })]),
      run([leaf("w:instrText", instruction, { "xml:space": "preserve" })]),
      run([el("w:fldChar", { "w:fldCharType": "separate" })]),
      textRun("3"),
      run([el("w:fldChar", { "w:fldCharType": "end" })]),
    ]);

  test("instruction keywords", () => {
    expect(pageFieldKind(" PAGE ")).toBe("page");
    expect(pageFieldKind(" PAGE  \\* MERGEFORMAT ")).toBe("page");
    expect(pageFieldKind(" NUMPAGES ")).toBe("pages");
    expect(pageFieldKind(" DATE \\@ \"d MMMM yyyy\" ")).toBeNull();
    expect(pageFieldKind("")).toBeNull();
  });

  test("PAGE and NUMPAGES become the editor's page-field atom inside a header or footer", () => {
    expect(renderInline(pageField(" PAGE "), context("header"), { base: EMPTY_RUN_PROPS })).toEqual([
      '<span data-page-field="page">#</span>',
    ]);
    expect(renderInline(pageField(" NUMPAGES "), context("footer"), { base: EMPTY_RUN_PROPS })).toEqual([
      '<span data-page-field="pages">#</span>',
    ]);
  });

  test("the same field in the body renders its cached result instead", () => {
    const ctx = context("body");
    expect(renderInline(pageField(" PAGE "), ctx, { base: EMPTY_RUN_PROPS })).toEqual(["3"]);
    expect(ctx.tally.warnings).toBe(0);
  });

  test("the `w:fldSimple` form works the same way", () => {
    const simple = el("w:p", {}, [el("w:fldSimple", { "w:instr": " PAGE " }, [textRun("7")])]);
    expect(renderInline(simple, context("footer"), { base: EMPTY_RUN_PROPS })).toEqual(['<span data-page-field="page">#</span>']);
    expect(renderInline(simple, context("body"), { base: EMPTY_RUN_PROPS })).toEqual(["7"]);
  });

  test("another field keeps its cached result, or is dropped with a warning when it has none", () => {
    const withResult = el("w:p", {}, [
      run([el("w:fldChar", { "w:fldCharType": "begin" })]),
      run([leaf("w:instrText", " DATE ")]),
      run([el("w:fldChar", { "w:fldCharType": "separate" })]),
      textRun("1 January 2026"),
      run([el("w:fldChar", { "w:fldCharType": "end" })]),
    ]);
    const ctx = context();
    expect(renderInline(withResult, ctx, { base: EMPTY_RUN_PROPS })).toEqual(["1 January 2026"]);
    expect(ctx.tally.warnings).toBe(0);

    const empty = el("w:p", {}, [
      run([el("w:fldChar", { "w:fldCharType": "begin" })]),
      run([leaf("w:instrText", " TOC \\o ")]),
      run([el("w:fldChar", { "w:fldCharType": "end" })]),
    ]);
    const emptyCtx = context();
    expect(renderInline(empty, emptyCtx, { base: EMPTY_RUN_PROPS })).toEqual([""]);
    expect(emptyCtx.tally.warnings).toBe(1);
  });

  test("an unterminated field still gives its cached result back", () => {
    const unterminated = el("w:p", {}, [
      run([el("w:fldChar", { "w:fldCharType": "begin" })]),
      run([leaf("w:instrText", " PAGE ")]),
      run([el("w:fldChar", { "w:fldCharType": "separate" })]),
      textRun("4"),
    ]);
    expect(renderInline(unterminated, context("header"), { base: EMPTY_RUN_PROPS })).toEqual([
      '<span data-page-field="page">#</span>',
    ]);
  });
});

/* ----------------------------------------------------------- paragraphs */

describe("paragraphs", () => {
  const styles = readStyles(
    el("w:styles", {}, [
      el("w:style", { "w:type": "paragraph", "w:styleId": "Title" }, [
        el("w:name", { "w:val": "Title" }),
        el("w:rPr", {}, [el("w:sz", { "w:val": "52" })]),
      ]),
      el("w:style", { "w:type": "paragraph", "w:styleId": "Heading2" }, [
        el("w:name", { "w:val": "heading 2" }),
        el("w:rPr", {}, [el("w:color", { "w:val": "2F5496" })]),
      ]),
    ]),
    EMPTY_THEME,
  );
  const ctx = (): RenderContext => context("body", { styles });

  test("an empty paragraph is kept — Word users space documents with them", () => {
    expect(renderParagraph(el("w:p"), ctx()).blocks).toEqual(["<p></p>"]);
  });

  test("a Title-styled paragraph carries the class the editor parses, and its style's run properties", () => {
    const p = el("w:p", {}, [el("w:pPr", {}, [el("w:pStyle", { "w:val": "Title" })]), textRun("Q3 Plan")]);
    expect(renderParagraph(p, ctx()).blocks).toEqual([
      '<p class="doc-title" data-doc-style="title"><span style="font-size:26pt">Q3 Plan</span></p>',
    ]);
  });

  test("a heading becomes hN and inherits its style's colour", () => {
    const p = el("w:p", {}, [
      el("w:pPr", {}, [el("w:pStyle", { "w:val": "Heading2" }), el("w:jc", { "w:val": "center" })]),
      textRun("Findings"),
    ]);
    expect(renderParagraph(p, ctx()).blocks).toEqual([
      '<h2 style="text-align:center"><span style="color:#2f5496">Findings</span></h2>',
    ]);
  });

  test("direct formatting beats the style it sits on", () => {
    const p = el("w:p", {}, [
      el("w:pPr", {}, [el("w:pStyle", { "w:val": "Heading2" })]),
      textRun("plain", el("w:rPr", {}, [el("w:color", { "w:val": "auto" }), el("w:b", { "w:val": "0" })])),
    ]);
    // `w:color auto` leaves no colour, so nothing overrides the style's; `w:b w:val=0` switches bold off.
    expect(renderParagraph(p, ctx()).blocks[0]).toBe('<h2><span style="color:#2f5496">plain</span></h2>');
  });

  test("indentation emits both the CSS and the data-indent the Indent extension parses", () => {
    const p = el("w:p", {}, [el("w:pPr", {}, [el("w:ind", { "w:left": "1440" })]), textRun("in")]);
    expect(renderParagraph(p, ctx()).blocks).toEqual(['<p style="margin-left:1in" data-indent="2">in</p>']);
  });

  test("`w:pageBreakBefore` puts the editor's page break in front", () => {
    const p = el("w:p", {}, [el("w:pPr", {}, [el("w:pageBreakBefore")]), textRun("next")]);
    expect(renderParagraph(p, ctx()).before).toBe('<div data-page-break=""></div>');
  });
});

/* --------------------------------------------------------------- blocks */

describe("block walker", () => {
  const numbering = readNumbering(
    el("w:numbering", {}, [
      el("w:abstractNum", { "w:abstractNumId": "0" }, [el("w:lvl", { "w:ilvl": "0" }, [el("w:numFmt", { "w:val": "bullet" }), el("w:lvlText", { "w:val": "•" })])]),
      el("w:abstractNum", { "w:abstractNumId": "1" }, [
        el("w:lvl", { "w:ilvl": "0" }, [el("w:numFmt", { "w:val": "decimal" }), el("w:start", { "w:val": "1" })]),
        el("w:lvl", { "w:ilvl": "1" }, [el("w:numFmt", { "w:val": "lowerLetter" })]),
      ]),
      el("w:num", { "w:numId": "1" }, [el("w:abstractNumId", { "w:val": "0" })]),
      el("w:num", { "w:numId": "2" }, [el("w:abstractNumId", { "w:val": "1" })]),
    ]),
  );
  const ctx = (zone: RenderZone = "body"): RenderContext => context(zone, { numbering });

  const listParagraph = (numId: number, ilvl: number, text: string): XmlElement =>
    el("w:p", {}, [
      el("w:pPr", {}, [el("w:numPr", {}, [el("w:ilvl", { "w:val": String(ilvl) }), el("w:numId", { "w:val": String(numId) })])]),
      textRun(text),
    ]);

  test("consecutive list paragraphs become one nested list, and a plain paragraph ends it", () => {
    const body = el("w:body", {}, [
      listParagraph(1, 0, "one"),
      listParagraph(1, 1, "one.a"),
      listParagraph(1, 0, "two"),
      el("w:p", {}, [textRun("after")]),
    ]);
    expect(renderBlocks(body, ctx())).toBe(
      "<ul><li><p>one</p><ul><li><p>one.a</p></li></ul></li><li><p>two</p></li></ul><p>after</p>",
    );
  });

  test("numbered lists render as ordered lists", () => {
    const body = el("w:body", {}, [listParagraph(2, 0, "first"), listParagraph(2, 1, "sub")]);
    expect(renderBlocks(body, ctx())).toBe("<ol><li><p>first</p><ol><li><p>sub</p></li></ol></li></ol>");
  });

  test("a checkbox content control makes a task item and swallows the box glyph", () => {
    const p = el("w:p", {}, [
      el("w:sdt", {}, [
        el("w:sdtPr", {}, [el("w14:checkbox", {}, [el("w14:checked", { "w14:val": "1" })])]),
        el("w:sdtContent", {}, [textRun("☒")]),
      ]),
      textRun("Ship it"),
    ]);
    expect(renderBlocks(el("w:body", {}, [p]), ctx())).toBe(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Ship it</p></li></ul>',
    );
  });

  test("an unchecked checkbox control", () => {
    const p = el("w:p", {}, [
      el("w:sdt", {}, [el("w:sdtPr", {}, [el("w14:checkbox", {}, [el("w14:checked", { "w14:val": "0" })])]), el("w:sdtContent", {}, [textRun("☐")])]),
      textRun("Todo"),
    ]);
    expect(renderBlocks(el("w:body", {}, [p]), ctx())).toContain('data-checked="false"');
  });

  test("a mid-paragraph page break becomes a block between two paragraphs", () => {
    const p = el("w:p", {}, [run([leaf("w:t", "a"), el("w:br", { "w:type": "page" }), leaf("w:t", "b")])]);
    expect(renderBlocks(el("w:body", {}, [p]), ctx())).toBe('<p>a</p><div data-page-break=""></div><p>b</p>');
  });

  test("block content controls are transparent and sectPr is not content", () => {
    const body = el("w:body", {}, [
      el("w:sdt", {}, [el("w:sdtContent", {}, [el("w:p", {}, [textRun("inside")])])]),
      el("w:sectPr", {}, [el("w:pgSz", { "w:w": "12240", "w:h": "15840" })]),
    ]);
    expect(renderBlocks(body, ctx())).toBe("<p>inside</p>");
  });

  test("a header keeps the list's text but not its markup", () => {
    const headerCtx = ctx("header");
    const body = el("w:hdr", {}, [listParagraph(1, 0, "running title")]);
    expect(renderBlocks(body, headerCtx)).toBe("<p>running title</p>");
    expect(headerCtx.tally.warnings).toBe(1);
  });

  test("a header table is flattened to its cells — that is how Word lays out a running head", () => {
    const headerCtx = ctx("header");
    const row = (...cells: string[]) =>
      el("w:tr", {}, cells.map((text) => el("w:tc", {}, [el("w:p", {}, [textRun(text)])])));
    const body = el("w:hdr", {}, [el("w:tbl", {}, [row("Merchiva", "Quarterly plan", "Draft")])]);
    expect(renderBlocks(body, headerCtx)).toBe("<p>Merchiva</p><p>Quarterly plan</p><p>Draft</p>");
    // The layout is lost, the text is not — and a second table in the same part doesn't warn again.
    expect(headerCtx.tally.warnings).toBe(1);
  });

  test("a nested header table flattens too, and the whole part warns once", () => {
    const headerCtx = ctx("header");
    const inner = el("w:tbl", {}, [el("w:tr", {}, [el("w:tc", {}, [el("w:p", {}, [textRun("inner")])])])]);
    const body = el("w:hdr", {}, [
      el("w:tbl", {}, [el("w:tr", {}, [el("w:tc", {}, [el("w:p", {}, [textRun("outer")]), inner])])]),
    ]);
    expect(renderBlocks(body, headerCtx)).toBe("<p>outer</p><p>inner</p>");
    expect(headerCtx.tally.warnings).toBe(1);
  });

  test("headings are body-only; a header paragraph stays a paragraph", () => {
    const styles = readStyles(
      el("w:styles", {}, [el("w:style", { "w:type": "paragraph", "w:styleId": "Heading1" }, [el("w:name", { "w:val": "heading 1" })])]),
      EMPTY_THEME,
    );
    const p = el("w:p", {}, [el("w:pPr", {}, [el("w:pStyle", { "w:val": "Heading1" })]), textRun("Big")]);
    expect(renderBlocks(el("w:hdr", {}, [p]), context("header", { styles }))).toBe("<p>Big</p>");
  });

  test("isEmptyHeaderFooter", () => {
    expect(isEmptyHeaderFooter("")).toBe(true);
    expect(isEmptyHeaderFooter("<p></p>")).toBe(true);
    expect(isEmptyHeaderFooter("<p>&nbsp;</p>")).toBe(true);
    expect(isEmptyHeaderFooter("<p>Report</p>")).toBe(false);
    expect(isEmptyHeaderFooter('<p><span data-page-field="page">#</span></p>')).toBe(false);
  });
});

/* --------------------------------------------------------------- tables */

describe("tables", () => {
  const cell = (text: string, tcPr?: XmlElement): XmlElement =>
    el("w:tc", {}, tcPr ? [tcPr, el("w:p", {}, [textRun(text)])] : [el("w:p", {}, [textRun(text)])]);

  test("a vertical merge becomes a rowspan and swallows its continuation cells", () => {
    const tbl = el("w:tbl", {}, [
      el("w:tr", {}, [cell("merged", el("w:tcPr", {}, [el("w:vMerge", { "w:val": "restart" })])), cell("r1c2")]),
      el("w:tr", {}, [cell("", el("w:tcPr", {}, [el("w:vMerge")])), cell("r2c2")]),
      el("w:tr", {}, [cell("", el("w:tcPr", {}, [el("w:vMerge", { "w:val": "continue" })])), cell("r3c2")]),
      el("w:tr", {}, [cell("r4c1"), cell("r4c2")]),
    ]);
    const rows = planRows(tbl);
    expect(rows.map((row) => row.cells.length)).toEqual([2, 1, 1, 2]);
    expect(rows[0].cells[0].rowspan).toBe(3);
    expect(rows[0].cells[1].rowspan).toBe(1);
  });

  test("`w:gridSpan` becomes a colspan and shifts the column a merge is tracked at", () => {
    const tbl = el("w:tbl", {}, [
      el("w:tr", {}, [cell("wide", el("w:tcPr", {}, [el("w:gridSpan", { "w:val": "2" })])), cell("tall", el("w:tcPr", {}, [el("w:vMerge", { "w:val": "restart" })]))]),
      el("w:tr", {}, [cell("a"), cell("b"), cell("", el("w:tcPr", {}, [el("w:vMerge")]))]),
    ]);
    const rows = planRows(tbl);
    expect(rows[0].cells[0].colspan).toBe(2);
    expect(rows[0].cells[1].rowspan).toBe(2);
    expect(rows[1].cells).toHaveLength(2);
  });

  test("a header row becomes th cells in a thead", () => {
    const tbl = el("w:tbl", {}, [
      el("w:tblGrid", {}, [el("w:gridCol", { "w:w": "2880" }), el("w:gridCol", { "w:w": "1440" })]),
      el("w:tr", {}, [el("w:trPr", {}, [el("w:tblHeader")]), cell("Name"), cell("Qty")]),
      el("w:tr", {}, [cell("Flour"), cell("2")]),
    ]);
    const html = renderTable(tbl, context(), renderBlocks);
    expect(html).toContain('<colgroup><col width="192" style="width:192px"><col width="96" style="width:96px"></colgroup>');
    expect(html).toContain("<thead><tr><th><p>Name</p></th><th><p>Qty</p></th></tr></thead>");
    expect(html).toContain("<tbody><tr><td><p>Flour</p></td><td><p>2</p></td></tr></tbody>");
  });

  test("cell shading, vertical alignment and borders become inline styles", () => {
    const tcPr = el("w:tcPr", {}, [
      el("w:shd", { "w:val": "clear", "w:fill": "F5F5F5" }),
      el("w:vAlign", { "w:val": "center" }),
      el("w:tcBorders", {}, [el("w:top", { "w:val": "single", "w:sz": "8", "w:color": "000000" }), el("w:bottom", { "w:val": "nil" })]),
    ]);
    const tbl = el("w:tbl", {}, [el("w:tr", {}, [cell("x", tcPr)])]);
    const html = renderTable(tbl, context(), renderBlocks);
    expect(html).toContain("background-color:#f5f5f5");
    expect(html).toContain("vertical-align:middle");
    expect(html).toContain("border-top:1px solid #000000");
    expect(html).toContain("border-bottom:none");
  });

  test("an empty cell still gets a paragraph, because the schema needs block content", () => {
    const tbl = el("w:tbl", {}, [el("w:tr", {}, [el("w:tc")])]);
    expect(renderTable(tbl, context(), renderBlocks)).toContain("<td><p></p></td>");
  });

  test("nested tables recurse", () => {
    const inner = el("w:tbl", {}, [el("w:tr", {}, [cell("inner")])]);
    const outer = el("w:tbl", {}, [el("w:tr", {}, [el("w:tc", {}, [inner])])]);
    expect(renderTable(outer, context(), renderBlocks)).toContain("<td><table><tbody><tr><td><p>inner</p></td></tr></tbody></table></td>");
  });

  test("a table with no rows is a warning, not a crash", () => {
    const ctx = context();
    expect(renderTable(el("w:tbl"), ctx, renderBlocks)).toBe("");
    expect(ctx.tally.warnings).toBe(1);
    expect(columnWidths(el("w:tbl"))).toEqual([]);
  });
});
