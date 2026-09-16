// Page setup and header/footer rules: the pure parts behind the page-setup dialog, the rulers and the paged canvas.

import { describe, expect, test } from "bun:test";

import {
  activeVariants,
  headerFooterField,
  substitutePageFields,
  variantForPage,
} from "@/lib/docs/header-footer";
import {
  contentHeightIn,
  defaultPageSetup,
  formatLength,
  inToTwips,
  matchPaper,
  normalizePageSetup,
  PAPER_SIZES,
  pageMetricsPx,
  pageSizeIn,
  parseCssLengthIn,
  parseLength,
  samePageSetup,
  type DocPageSetup,
} from "@/lib/docs/page-setup";

const LETTER = defaultPageSetup("en");
const A4 = defaultPageSetup("fr");

describe("page setup", () => {
  test("the locale picks the paper", () => {
    expect(LETTER.paper).toBe("letter");
    expect(A4.paper).toBe("a4");
    expect(defaultPageSetup("zh-cn").paper).toBe("a4");
  });

  test("ISO sizes convert to the twips Word writes", () => {
    expect(inToTwips(PAPER_SIZES.a4.width)).toBe(11906);
    expect(inToTwips(PAPER_SIZES.a4.height)).toBe(16838);
    expect(inToTwips(PAPER_SIZES.letter.width)).toBe(12240);
    expect(inToTwips(PAPER_SIZES.letter.height)).toBe(15840);
  });

  test("landscape swaps the page, not the margins", () => {
    const landscape: DocPageSetup = { ...LETTER, orientation: "landscape" };
    expect(pageSizeIn(landscape)).toEqual({ width: 11, height: 8.5 });
    expect(pageMetricsPx(landscape)).toMatchObject({ pageWidth: 1056, pageHeight: 816, marginLeft: 96, marginTop: 96 });
  });

  test("Letter at 96dpi is the sheet the pagination plugin measures against", () => {
    expect(pageMetricsPx(LETTER)).toMatchObject({ pageWidth: 816, pageHeight: 1056, contentWidth: 624, contentHeight: 864 });
  });

  test("margins that would swallow the text column are scaled back proportionally", () => {
    const squeezed = normalizePageSetup({ ...LETTER, margins: { top: 8, right: 6, bottom: 8, left: 2 } }, LETTER);
    expect(squeezed.margins.top + squeezed.margins.bottom).toBeLessThanOrEqual(11 - 0.5 + 1e-6);
    expect(squeezed.margins.left + squeezed.margins.right).toBeLessThanOrEqual(8.5 - 0.5 + 1e-6);
    // The 3:1 left/right ratio survives.
    expect(squeezed.margins.right / squeezed.margins.left).toBeCloseTo(3, 2);
    expect(contentHeightIn(squeezed)).toBeGreaterThanOrEqual(0.5);
  });

  test("a header cannot reach past its own margin", () => {
    const setup = normalizePageSetup({ ...LETTER, headerDistance: 4, footerDistance: -2 }, LETTER);
    expect(setup.headerDistance).toBe(1);
    expect(setup.footerDistance).toBe(0);
  });

  test("garbage falls back instead of producing a zero-sized page", () => {
    const setup = normalizePageSetup(
      { paper: "nope" as never, customWidth: Number.NaN, margins: { top: Number.NaN, right: -3, bottom: 1, left: 1 } },
      A4,
    );
    expect(setup.paper).toBe("a4");
    expect(setup.margins.right).toBe(0);
    expect(setup.margins.top).toBe(1);
    expect(pageSizeIn(setup).width).toBeGreaterThan(1);
  });

  test("custom sizes are clamped to a printable range", () => {
    expect(normalizePageSetup({ paper: "custom", customWidth: 0.1, customHeight: 999 }, LETTER)).toMatchObject({
      customWidth: 1,
      customHeight: 48,
    });
  });

  test("matchPaper names an imported page size, orientation-independently", () => {
    expect(matchPaper(8.5, 11)).toBe("letter");
    expect(matchPaper(11, 8.5)).toBe("letter");
    expect(matchPaper(PAPER_SIZES.a4.width, PAPER_SIZES.a4.height)).toBe("a4");
    expect(matchPaper(9.1, 13.2)).toBeNull();
  });

  test("samePageSetup ignores object identity", () => {
    expect(samePageSetup(LETTER, { ...LETTER })).toBe(true);
    expect(samePageSetup(LETTER, { ...LETTER, margins: { ...LETTER.margins, left: 0.5 } })).toBe(false);
  });

  test("lengths round-trip through the dialog's unit", () => {
    expect(formatLength(1, "in")).toBe("1");
    expect(formatLength(1, "cm")).toBe("2.54");
    expect(parseLength("2.54", "cm")).toBeCloseTo(1, 4);
    expect(parseLength("1,5", "in")).toBeCloseTo(1.5, 4);
    expect(parseLength("abc", "in")).toBeNull();
    expect(parseLength("-1", "in")).toBeNull();
  });

  test("CSS lengths from an imported document convert to inches", () => {
    expect(parseCssLengthIn("0.5in")).toBe(0.5);
    expect(parseCssLengthIn("36pt")).toBeCloseTo(0.5, 6);
    expect(parseCssLengthIn("48px")).toBe(0.5);
    expect(parseCssLengthIn("2.54cm")).toBeCloseTo(1, 6);
    expect(parseCssLengthIn("25.4mm")).toBeCloseTo(1, 6);
    expect(parseCssLengthIn("auto")).toBeNull();
    expect(parseCssLengthIn("")).toBeNull();
  });
});

describe("header/footer variants", () => {
  const plain = { differentFirstPage: false, differentOddEven: false };
  const firstOnly = { differentFirstPage: true, differentOddEven: false };
  const both = { differentFirstPage: true, differentOddEven: true };

  test("one header covers every page by default", () => {
    expect([1, 2, 3, 4].map((page) => variantForPage(page, plain))).toEqual(["default", "default", "default", "default"]);
    expect(activeVariants(plain)).toEqual(["default"]);
  });

  test("the first page wins over odd/even", () => {
    expect(variantForPage(1, both)).toBe("first");
    expect(variantForPage(2, both)).toBe("even");
    expect(variantForPage(3, both)).toBe("default");
    expect(activeVariants(both)).toEqual(["default", "first", "even"]);
  });

  test("odd/even stays off unless asked for", () => {
    expect(variantForPage(2, firstOnly)).toBe("default");
    expect(activeVariants(firstOnly)).toEqual(["default", "first"]);
  });

  test("fields are namespaced per zone and variant", () => {
    expect(headerFooterField("header", "first")).toBe("hf:header:first");
    expect(headerFooterField("footer", "default")).toBe("hf:footer:default");
  });
});

describe("page fields", () => {
  test("each page gets its own numbers", () => {
    const html = '<p>Page <span data-page-field="page">#</span> of <span data-page-field="pages">#</span></p>';
    expect(substitutePageFields(html, 3, 7)).toBe('<p>Page <span data-page-field="page">3</span> of <span data-page-field="pages">7</span></p>');
  });

  test("markup without a field is returned untouched", () => {
    const html = "<p>Quarterly report</p>";
    expect(substitutePageFields(html, 1, 1)).toBe(html);
  });

  test("attributes around the marker survive", () => {
    const html = '<p><span style="color: #ff0000" data-page-field="page" class="doc-page-field">#</span></p>';
    expect(substitutePageFields(html, 12, 20)).toContain(">12<");
    expect(substitutePageFields(html, 12, 20)).toContain('style="color: #ff0000"');
  });
});
