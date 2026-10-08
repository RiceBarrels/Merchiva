// Slide renderer (slides.md §5, §15). The render checks replace app modules with throwing stand-ins (proof that
// SlideView needs no provider), which would leak into other test files in this process, so they run in a child
// `bun test` of render-smoke.isolated.tsx. The pure helpers the renderer and the exporters share are tested here.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { GestureFrameStore, elementFrame } from "@/components/slides/canvas/gesture-frames";
import { decorIdPrefix, svgDefId } from "@/components/slides/canvas/svg-ids";
import { MIN_STAGE_SCALE, ViewportWatcher, fitScale } from "@/components/slides/canvas/use-stage-fit";
import { countSimplified, cssImageUses, renderSlideToPng, renderSlidesToPdf } from "@/components/slides/export/raster";
import { EmptyExportError, openPdfWriter } from "@/lib/slides/export/pdf";
import { ReportCounter } from "@/lib/slides/export/report";
import {
  cropFrame, cssLinearGradient, cssUrl, dashArray, gradientVector, rgbaCss, shapePathD, slideBackground, tableCellLook, tableGrid,
  textAreaInsets,
} from "@/lib/slides/export/render-rules";
import type { SlideElement, TableElement } from "@/lib/slides/model/types";
import { STARTER_THEMES } from "@/lib/slides/themes/themes";
import { canonical, sampleDeck, sampleElements } from "./helpers/fixtures";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/slides/render-smoke.isolated.tsx";

describe("SlideView render smoke (isolated process)", () => {
  test(
    "renders every element type without providers; ids, links, placeholders, CORS, editor, frames",
    () => {
      const proc = Bun.spawnSync([process.execPath, "test", FIXTURE], { cwd: ROOT, env: { ...process.env }, stdout: "pipe", stderr: "pipe" });
      const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
      if (proc.exitCode !== 0) console.error(output);
      expect(proc.exitCode).toBe(0);
      expect(output).toContain("13 pass");
      expect(output).toContain("0 fail");
    },
    60_000,
  );
});

describe("stage fit", () => {
  test("the largest scale that fits, never zero", () => {
    expect(fitScale({ w: 1000, h: 600 }, { w: 960, h: 540 }, 20)).toBe(1);
    expect(fitScale({ w: 480, h: 1000 }, { w: 960, h: 540 })).toBe(0.5);
    expect(fitScale({ w: 0, h: 0 }, { w: 960, h: 540 })).toBe(MIN_STAGE_SCALE);
  });

  test("the observer attaches when the viewport mounts late, moves with it, and stops on dispose", () => {
    const log: string[] = [];
    type Report = (entries: Array<{ contentRect: { width: number; height: number } }>) => void;
    const observer: { report: Report | null } = { report: null };
    class FakeObserver {
      constructor(cb: Report) {
        observer.report = cb;
      }
      observe(el: { id: string }) {
        log.push(`observe ${el.id}`);
      }
      disconnect() {
        log.push("disconnect");
      }
    }
    const realm = { ResizeObserver: FakeObserver } as unknown as Window;
    const element = (id: string) => ({ id, ownerDocument: { defaultView: realm } }) as unknown as HTMLElement;
    const sizes: Array<[number, number]> = [];
    const watcher = new ViewportWatcher((w, h) => sizes.push([w, h]));
    watcher.sync(null, null); // first render: a skeleton, no viewport yet
    expect(log).toEqual([]);
    const a = element("a");
    watcher.sync(a, null); // a later commit mounts it
    watcher.sync(a, null); // unrelated commits cost nothing
    expect(log).toEqual(["observe a"]);
    observer.report?.([{ contentRect: { width: 800, height: 450 } }]);
    expect(sizes).toEqual([[800, 450]]);
    watcher.sync(element("b"), null);
    watcher.dispose();
    expect(log).toEqual(["observe a", "disconnect", "observe b", "disconnect"]);
  });
});

describe("raster export report and guards", () => {
  test("simplifications: vertical text, image fills on other geometry, charts, unusable picture srcs", () => {
    const [, star, path, , img, , chart] = sampleElements();
    const report = new ReportCounter();
    const roundFill = canonical({ ...(star as object), id: "rr", geom: { kind: "preset", preset: "roundRect" }, fill: { t: "image", src: "https://cdn.example.com/f.png", mode: "cover" }, box: {} });
    countSimplified([star, path, roundFill, chart, img, { ...img, src: "http://insecure.example/x.png" } as SlideElement], report);
    expect(report.toReport().items).toEqual([
      { code: "imageMissing", count: 1 },
      { code: "chartSkipped", count: 1 },
      { code: "maskApprox", count: 1 },
      { code: "verticalTextFlattened", count: 1 },
    ]);
  });

  test("CSS-background pictures of a slide: its background (or its master's) and every image fill", () => {
    const deck = sampleDeck();
    const [a, b] = deck.slides;
    expect(cssImageUses(deck, a)).toEqual(["https://cdn.example.com/fill.png"]);
    expect(cssImageUses(deck, b)).toEqual(["https://cdn.example.com/bg.png"]);
  });

  test("nothing to export is an EmptyExportError, never a blank page", async () => {
    const deck = sampleDeck();
    const opts = { scale: 1, labels: { placeholders: { title: "", subtitle: "", body: "" }, chart: "", imageMissing: "" } };
    await expect(renderSlidesToPdf(deck, [], opts)).rejects.toBeInstanceOf(EmptyExportError);
    await expect(renderSlidesToPdf(deck, ["nope"], opts)).rejects.toBeInstanceOf(EmptyExportError);
    await expect(renderSlideToPng(deck, "nope", opts)).rejects.toBeInstanceOf(EmptyExportError);
    const writer = await openPdfWriter({ w: 960, h: 540 });
    expect(() => writer.toBlob()).toThrow(EmptyExportError);
  });
});

describe("gesture frames", () => {
  test("per-element notifications; set() replaces, clear() ends the gesture", () => {
    const store = new GestureFrameStore();
    const hits: string[] = [];
    const offA = store.subscribe("a", () => hits.push("a"));
    store.subscribe("b", () => hits.push("b"));
    const frame = { x: 1, y: 2, w: 3, h: 4, rot: 0 };
    store.set(new Map([["a", frame]]));
    expect(store.get("a")).toBe(frame);
    expect(store.active).toBe(true);
    store.update("b", frame);
    store.clear();
    expect(hits).toEqual(["a", "b", "a", "b"]);
    offA();
    store.update("a", frame);
    expect(hits).toHaveLength(4);
    expect(store.get("zzz")).toBeNull();
  });

  test("a gesture starts from the element box, or a line's endpoint box", () => {
    const [txt, , , line] = sampleElements();
    expect(elementFrame(txt)).toEqual({ x: 40, y: 50, w: 300, h: 120, rot: 15 });
    expect(elementFrame(line)).toEqual({ x: 10, y: 20, w: 390, h: 0, rot: 0 });
  });
});

describe("svg def ids", () => {
  test("slide and decor defs never collide, even for equal element ids", () => {
    const prefix = "s_R_1_-";
    const ids = new Set([svgDefId(prefix, "d", "grad"), svgDefId(decorIdPrefix(prefix), "grad", "grad"), svgDefId(decorIdPrefix(prefix), "d", "grad")]);
    expect(ids.size).toBe(3);
    expect(svgDefId(prefix, "x1", "head")).toBe("s_R_1_-x1-head");
  });
});

describe("render rules shared with the exporters", () => {
  const theme = STARTER_THEMES["simple-light"];

  test("colours, gradients, dashes, CSS urls", () => {
    expect(rgbaCss("#ff8000", 0.5)).toBe("rgba(255, 128, 0, 0.5)");
    expect(rgbaCss("#ff8000")).toBe("#ff8000");
    expect(gradientVector(0)).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
    expect(gradientVector(90)).toEqual({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 });
    expect(cssLinearGradient({ t: "linear", angle: 0, stops: [{ pos: 0, color: "theme:accent1" }, { pos: 1, color: "#000000", alpha: 0.5 }] }, theme)).toBe(
      "linear-gradient(90deg, #2563eb 0%, rgba(0, 0, 0, 0.5) 100%)",
    );
    expect(dashArray("dash", 2)).toBe("8 6");
    expect(dashArray("solid", 2)).toBeUndefined();
    expect(cssUrl('https://x.example/a"b\\c')).toBe('url("https://x.example/a%22b%5Cc")');
  });

  test("backgrounds fall back from slide to master to theme", () => {
    const deck = sampleDeck();
    const [a, b] = deck.slides;
    expect(slideBackground(a, null, deck.meta.theme)).toEqual({ t: "solid", color: "#fafafa" });
    expect(slideBackground(b, deck.masters[0], deck.meta.theme)).toEqual(deck.masters[0].background);
    expect(slideBackground(b, null, deck.meta.theme)).toEqual(deck.meta.theme.background);
  });

  test("geometry: custom paths scale to the box, text sits inside the preset's text area", () => {
    const [txt, star, path] = sampleElements();
    expect(shapePathD((path as Extract<SlideElement, { type: "shape" }>).geom, 150, 40)).toBe("M0 0 L150 0 L75 40 Z");
    expect(shapePathD({ kind: "path", d: "not a path", vw: 1, vh: 1, srcPreset: "" }, 10, 10)).toBe("");
    expect(textAreaInsets(txt as Extract<SlideElement, { type: "text" }>, 300, 120)).toEqual([7.2, 3.6, 7.2, 3.6]);
    const starInsets = textAreaInsets(star as Extract<SlideElement, { type: "shape" }>, 300, 120);
    expect(starInsets[0]).toBeCloseTo(90 + 1);
    expect(cropFrame(300, 120, { l: 0.1, t: 0, r: 0.2, b: 0.05 }).offX).toBeCloseTo(42.857, 2);
  });

  test("table grid: spans from anchors, clamped; stray covered cells shown; missing cells empty; sizes scaled", () => {
    const table = canonical({
      id: "t", z: "a", type: "table", locked: false, name: "", link: "", placeholder: "", x: 0, y: 0, w: 300, h: 90, rot: 0,
      rows: [{ id: "r1", order: "A", h: 10 }, { id: "r2", order: "B", h: 10 }, { id: "r3", order: "C", h: 10 }],
      cols: [{ id: "c1", order: "A", w: 10 }, { id: "c2", order: "B", w: 20 }],
      cells: [
        { rowId: "r1", colId: "c1", text: {}, fill: null, rowSpan: 2, colSpan: 1, covered: false, vAlign: "top" },
        { rowId: "r2", colId: "c1", text: {}, fill: null, rowSpan: 1, colSpan: 1, covered: true, vAlign: "top" },
        { rowId: "r3", colId: "c2", text: {}, fill: "#ff0000", rowSpan: 1, colSpan: 1, covered: true, vAlign: "top" },
      ],
      style: { headerRow: true, banded: true },
    }) as TableElement;
    const grid = tableGrid(table);
    expect(grid.colWidths).toEqual([100, 200]);
    expect(grid.rowHeights).toEqual([30, 30, 30]);
    expect(grid.rows.map((r) => r.map((c) => [c.key, c.rowSpan, c.colSpan, c.cell ? "cell" : "missing"]))).toEqual([
      [["r1:c1", 2, 1, "cell"], ["r1:c2", 1, 1, "missing"]],
      [["r2:c2", 1, 1, "missing"]],
      [["r3:c1", 1, 1, "missing"], ["r3:c2", 1, 1, "cell"]],
    ]);
    const [head, , body] = grid.rows;
    expect(tableCellLook(table, head[0])).toEqual({ fill: "theme:accent1", bold: true, color: "theme:bg" });
    expect(tableCellLook(table, grid.rows[1][0]).fill).toBe("theme:surface");
    expect(tableCellLook(table, body[1]).fill).toBe("#ff0000");
    expect(tableCellLook(table, body[0]).fill).toBeNull();
  });
});
