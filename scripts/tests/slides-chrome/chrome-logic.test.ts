// The pure parts of the Slides toolbar and menu bar (components/slides/chrome/*.ts, menubar/slide-order.ts): what the
// selection enables, what the text controls show, zoom steps, slide moves, the overflow row and the font list.
import { describe, expect, test } from "bun:test";
import type { JSONContent } from "@tiptap/core";

import { SLIDES_FONTS, fontLabel, matchSlidesFont } from "@/components/slides/chrome/fonts";
import { selectionInfo } from "@/components/slides/chrome/selection-info";
import { editorTextState, elementsTextState, linkHrefFromInput, markToggle, sameTextState } from "@/components/slides/chrome/text-state";
import { visibleGroupCount } from "@/components/slides/chrome/toolbar-layout";
import { parseZoomValue, stepZoom, zoomPercent, zoomValue } from "@/components/slides/chrome/zoom";
import { pickedSlides, slideMove } from "@/components/slides/menubar/slide-order";
import { newLine, newShape, newTable, newTextBox } from "@/lib/slides/editor/elements";
import { DEFAULT_TEXT_DEFAULTS } from "@/lib/slides/model/defaults";
import { safeFontCss } from "@/lib/slides/model/safe-values";
import type { NewElement, SlideElement, SlideSnapshot } from "@/lib/slides/model/types";

const SIZE = { w: 960, h: 540 };
let n = 0;
const el = (e: NewElement): SlideElement => ({ ...e, id: `e${++n}`, z: `a${n}` }) as SlideElement;
const text = (json: JSONContent): SlideElement => ({ ...el(newTextBox(SIZE)), text: json }) as SlideElement;
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const p = (attrs: Record<string, unknown> | undefined, ...content: JSONContent[]): JSONContent => ({ type: "paragraph", ...(attrs ? { attrs } : {}), content });
const run = (s: string, ...marks: JSONContent["marks"] & object): JSONContent => ({ type: "text", text: s, ...(marks.length ? { marks } : {}) });

function deckOf(elements: SlideElement[], opts: { schemaTooNew?: boolean } = {}) {
  const slide = { id: "s1", order: "a0", layout: "blank", masterId: "", hidden: false, background: null, transition: null, notes: doc(), elements } as SlideSnapshot;
  return { slideIds: ["s1"], slides: new Map([["s1", slide]]), schemaTooNew: opts.schemaTooNew ?? false };
}
const ui = (selection: string[], extra: Partial<{ editing: { elementId: string } | null; previewVersionId: string | null }> = {}) => ({
  currentSlideId: "s1", selection, editing: null, previewVersionId: null, ...extra,
});

describe("selectionInfo", () => {
  const box = el(newTextBox(SIZE));
  const shape = el(newShape("rect", SIZE));
  const line = el(newLine(false, SIZE));
  const table = el(newTable(2, 2, SIZE));
  const deck = deckOf([box, shape, line, table]);

  test("groups the selection by what the controls act on", () => {
    const s = selectionInfo({ deck, ui: ui([box.id, shape.id, line.id]), canEditNow: true });
    expect(s.selected.map((e) => e.id)).toEqual([box.id, shape.id, line.id]);
    expect(s.texts.map((e) => e.id)).toEqual([box.id, shape.id]);
    expect(s.lines.map((e) => e.id)).toEqual([line.id]);
    expect(s.outlined.map((e) => e.id)).toEqual([box.id, shape.id]);
    expect(s.table).toBeNull();
    expect(s.hasText && s.writable).toBe(true);
  });

  test("a table counts only when it is the whole selection; ids of other slides are ignored", () => {
    expect(selectionInfo({ deck, ui: ui([table.id]), canEditNow: true }).table?.id).toBe(table.id);
    expect(selectionInfo({ deck, ui: ui([table.id, line.id]), canEditNow: true }).table).toBeNull();
    expect(selectionInfo({ deck, ui: ui(["gone"]), canEditNow: true }).selected).toEqual([]);
  });

  test("nothing is writable for a viewer, a newer deck, or while a version is previewed", () => {
    expect(selectionInfo({ deck, ui: ui([]), canEditNow: false }).writable).toBe(false);
    expect(selectionInfo({ deck: deckOf([], { schemaTooNew: true }), ui: ui([]), canEditNow: true }).writable).toBe(false);
    expect(selectionInfo({ deck, ui: ui([], { previewVersionId: "v1" }), canEditNow: true }).writable).toBe(false);
  });

  test("allLocked and hasText", () => {
    const locked = { ...line, id: "L", locked: true } as SlideElement;
    const s = selectionInfo({ deck: deckOf([locked]), ui: ui(["L"]), canEditNow: true });
    expect([s.allLocked, s.hasText]).toEqual([true, false]);
    expect(selectionInfo({ deck, ui: ui([], { editing: { elementId: box.id } }), canEditNow: true }).hasText).toBe(true);
  });
});

describe("text state", () => {
  test("marks are on only when all of the text has them; values come from the first run and paragraph", () => {
    const a = text(doc(p({ textAlign: "center", lineHeight: 1.5, dir: "rtl" }, run("Hi", { type: "bold" }, { type: "textStyle", attrs: { fontSize: 32, color: "#ff0000", fontFamily: "theme:heading" } }), run(" there", { type: "bold" }))));
    const s = elementsTextState([a]);
    expect(s).toMatchObject({ bold: true, italic: false, size: 32, color: "#ff0000", font: "theme:heading", align: "center", lineHeight: 1.5, dir: "rtl", list: "none" });
    const b = text(doc(p(undefined, run("x", { type: "italic" }), run("y"))));
    expect(elementsTextState([b])?.italic).toBe(false);
    expect(elementsTextState([a, b])?.bold).toBe(false);
  });

  test("unstyled text shows the element defaults; bold defaults count as bold; lists and links", () => {
    const plain = text(doc(p(undefined, run("x"))));
    expect(elementsTextState([plain])).toMatchObject({ font: DEFAULT_TEXT_DEFAULTS.font, size: DEFAULT_TEXT_DEFAULTS.size, color: DEFAULT_TEXT_DEFAULTS.color, align: DEFAULT_TEXT_DEFAULTS.align, link: null, highlight: null });
    const boldDefault = { ...plain, textStyle: { ...DEFAULT_TEXT_DEFAULTS, bold: true } } as SlideElement;
    expect(elementsTextState([boldDefault])?.bold).toBe(true);
    const list = text(doc({ type: "bulletList", content: [{ type: "listItem", content: [p(undefined, run("x", { type: "link", attrs: { href: "https://a.test/" } }))] }] }));
    expect(elementsTextState([list])).toMatchObject({ list: "bullet", link: "https://a.test/" });
    const unsafe = text(doc(p(undefined, run("x", { type: "link", attrs: { href: "javascript:alert(1)" } }))));
    expect(elementsTextState([unsafe])?.link).toBeNull();
  });

  test("tables use their cells and the table's text style; lines and pictures hold no text", () => {
    const table = el(newTable(1, 2, SIZE));
    expect(elementsTextState([table])?.size).toBe(table.type === "table" ? table.style.textStyle.size : -1);
    expect(elementsTextState([el(newLine(false, SIZE))])).toBeNull();
  });

  test("the live editor through the reader", () => {
    const active = new Set(["italic", "orderedList"]);
    const attrs: Record<string, Record<string, unknown>> = {
      textStyle: { fontSize: "24px", color: "theme:accent2", fontFamily: null },
      highlight: { color: "#ffff00" },
      link: {},
      paragraph: { textAlign: "justify", lineHeight: null, dir: null },
    };
    const s = editorTextState({ isActive: (name) => active.has(name), attrs: (type) => attrs[type] }, DEFAULT_TEXT_DEFAULTS);
    expect(s).toMatchObject({ bold: DEFAULT_TEXT_DEFAULTS.bold, italic: true, size: 24, color: "theme:accent2", highlight: "#ffff00", font: DEFAULT_TEXT_DEFAULTS.font, align: "justify", list: "ordered", lineHeight: DEFAULT_TEXT_DEFAULTS.lineHeight, dir: null, link: null });
    expect(sameTextState(s, { ...s })).toBe(true);
    expect(sameTextState(s, { ...s, italic: false })).toBe(false);
    expect(sameTextState(null, null)).toBe(true);
  });

  test("a mark button sends the opposite of what it shows: bold from the box defaults is turned off, not toggled", () => {
    const plain = text(doc(p(undefined, run("Title"))));
    const boldDefault = { ...plain, textStyle: { ...DEFAULT_TEXT_DEFAULTS, bold: true } } as SlideElement;
    const shown = elementsTextState([boldDefault]);
    expect(shown?.bold).toBe(true);
    expect(shown && markToggle(shown, "bold")).toEqual({ kind: "mark", mark: "bold", on: false });
    const live = editorTextState({ isActive: () => false, attrs: () => ({}) }, { ...DEFAULT_TEXT_DEFAULTS, bold: true });
    expect(markToggle(live, "bold")).toEqual({ kind: "mark", mark: "bold", on: false });
    expect(markToggle(live, "italic")).toEqual({ kind: "mark", mark: "italic", on: true });
  });

  test("typed links: http(s) and mailto kept, bare domains and e-mail addresses completed, the rest refused", () => {
    expect(linkHrefFromInput(" https://merchiva.app/x ")).toBe("https://merchiva.app/x");
    expect(linkHrefFromInput("merchiva.app/menu?a=1")).toBe("https://merchiva.app/menu?a=1");
    expect(linkHrefFromInput("ana@shop.test")).toBe("mailto:ana@shop.test");
    expect(linkHrefFromInput("javascript:alert(1)")).toBe("");
    expect(linkHrefFromInput("not a link")).toBe("");
    expect(linkHrefFromInput("")).toBe("");
  });
});

describe("zoom", () => {
  test("steps from fit go to the next step above / below the stage's fit scale, within bounds", () => {
    expect([stepZoom("fit", 1, 1.4), stepZoom("fit", -1, 1.4)]).toEqual([1.5, 1.25]);
    expect([stepZoom("fit", 1, 1.5), stepZoom("fit", -1, 0.5)]).toEqual([2, 0.25]);
    expect([stepZoom("fit", 1, 4.4), stepZoom("fit", -1, 0.05)]).toEqual([4, 0.1]);
  });

  test("steps from fit with no known fit scale start at 100% / 50%, then walk the steps within bounds", () => {
    expect([stepZoom("fit", 1), stepZoom("fit", -1), stepZoom("fit", 1, null), stepZoom("fit", 1, 0), stepZoom("fit", -1, Number.NaN)]).toEqual([1, 0.5, 1, 1, 0.5]);
    expect(stepZoom(1, 1, 2.5)).toBe(1.25);
    expect([stepZoom(1, 1), stepZoom(1, -1), stepZoom(1.1, 1), stepZoom(4, 1), stepZoom(0.1, -1)]).toEqual([1.25, 0.75, 1.25, 4, 0.1]);
  });

  test("menu values round-trip; junk is refused", () => {
    expect([zoomValue("fit"), zoomValue(1.5), zoomPercent(1.25)]).toEqual(["fit", "1.5", "125%"]);
    expect([parseZoomValue("fit"), parseZoomValue("0.75"), parseZoomValue("abc"), parseZoomValue("99")]).toEqual(["fit", 0.75, null, null]);
  });
});

describe("slide moves", () => {
  const order = ["a", "b", "c", "d", "e"];
  test("a block moves one step past its outer neighbour, and not past the ends", () => {
    expect(slideMove(order, ["c"], -1)).toEqual({ ids: ["c"], before: "b" });
    expect(slideMove(order, ["c"], 1)).toEqual({ ids: ["c"], before: "e" });
    expect(slideMove(order, ["d"], 1)).toEqual({ ids: ["d"], before: null });
    expect(slideMove(order, ["a"], -1)).toBeNull();
    expect(slideMove(order, ["e"], 1)).toBeNull();
    expect(slideMove(order, ["d", "b"], -1)).toEqual({ ids: ["b", "d"], before: "a" });
    expect(slideMove(order, [], 1)).toBeNull();
  });

  test("picked slides fall back to the current slide", () => {
    expect([pickedSlides(["b", "c"], "c"), pickedSlides([], "c"), pickedSlides([], null)]).toEqual([["b", "c"], ["c"], []]);
  });
});

describe("toolbar overflow", () => {
  test("everything fits, or the leading groups that fit next to the ⋮ button", () => {
    expect(visibleGroupCount([100, 100, 100], 0)).toBe(3);
    expect(visibleGroupCount([100, 100, 100], 400)).toBe(3);
    expect(visibleGroupCount([100, 100, 100], 300)).toBe(2);
    expect(visibleGroupCount([100, 100, 100], 100)).toBe(0);
  });
});

describe("fonts", () => {
  test("every offered stack passes the model's font check and ends in a generic family", () => {
    for (const font of SLIDES_FONTS) {
      expect(safeFontCss(font.css)).toBe(font.css);
      expect(font.css).toMatch(/(sans-serif|serif|monospace)$/);
    }
  });

  test("stored fonts match by first family; theme fonts and unknown fonts get labels", () => {
    const t = (key: string) => `<${key}>`;
    expect(matchSlidesFont("Georgia, serif")).toBe(SLIDES_FONTS[1].css);
    expect(matchSlidesFont("theme:body")).toBe("theme:body");
    expect(matchSlidesFont('"Calibri", Carlito, sans-serif')).toBeNull();
    expect([fontLabel("theme:heading", t), fontLabel("'Courier New', monospace", t), fontLabel('"Calibri", Carlito', t)]).toEqual(["<slides.format.fontHeading>", "Courier New", "Calibri"]);
  });
});
