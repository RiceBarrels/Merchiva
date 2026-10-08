// lib/sheets/sanitize.ts + lib/sheets/image-hosts.ts (sheets.md §4.3.1, §12.1) against hostile fixtures:
// script and data links in rich text and in the hyperlink model, drawings / backgrounds / doc-model images
// that would make a viewer fetch a third-party URL (including field-level drawing json1 ops in the shapes
// Univer emits), protection, unparsable and malformed resources, and structures built to exhaust the
// walker. Everything is sanitized in place and idempotently.

import { describe, expect, test } from "bun:test";
import { JSON1 } from "@univerjs/core";
import type { IWorkbookData } from "@univerjs/presets";
import { ALLOWED_IMAGE_HOSTS, isAllowedImageUrl } from "@/lib/sheets/image-hosts";
import { SheetCodecError, decodeSheetEnvelope, encodeSheetSnapshot } from "@/lib/sheets/codec";
import {
  SANITIZE_MAX_DEPTH, SHEET_IMAGE_DATA_MAX_BYTES, isAllowedImageSource, isSafeSheetLink, sanitizeOpParams,
  sanitizeWorkbookData, type SanitizeReport,
} from "@/lib/sheets/sanitize";
import { SHEET_UNIT_ID } from "@/lib/sheets/constants";
import { RESOURCE } from "@/lib/sheets/univer-constants";

const OK_IMAGE = "https://utfs.io/f/abc123.png";
const OK_DATA = `data:image/png;base64,${"iVBORw0KGgo".padEnd(64, "A")}`;
const HUGE_DATA = `data:image/png;base64,${"A".repeat(3 * 1024 * 1024)}`;
const EVIL_IMAGE = "https://evil.example/pixel.gif?d=secret";
const newReport = (): SanitizeReport => ({ links: 0, images: 0, resources: [] });

// Drawing ops are built with Univer's own json1 (the runtime the editor applies them with), over the
// drawing model `{ [unitId]: { [subUnitId]: { data: { [drawingId]: drawing }, order } } }`.
const DRAWING_APPLY = "sheet.mutation.set-drawing-apply";
const DATA_PATH = [SHEET_UNIT_ID, "s1", "data"];
type JsonOp = Parameters<typeof JSON1.type.apply>[1];
type JsonDoc = Parameters<typeof JSON1.insertOp>[1];
type DrawingModel = Record<string, Record<string, { data: Record<string, Record<string, unknown>>; order: string[] }>>;

function drawingModel(data: Record<string, Record<string, unknown>> = {}): DrawingModel {
  return { [SHEET_UNIT_ID]: { s1: { data: clone(data), order: Object.keys(data) } } };
}

function drawingParams(op: unknown, type = 2) {
  return { unitId: SHEET_UNIT_ID, subUnitId: "s1", type, op, objects: [] as Array<Record<string, unknown>> };
}

/** Applies the (sanitized) op the way SetDrawingApplyMutation does and returns each drawing's source. */
function sourcesAfter(model: DrawingModel, op: unknown): Record<string, unknown> {
  const next = JSON1.type.apply(model as unknown as JsonDoc, op as JsonOp) as unknown as DrawingModel;
  const data = next[SHEET_UNIT_ID].s1.data;
  return Object.fromEntries(Object.keys(data).map((id) => [id, data[id].source]));
}

function codecReason(fn: () => unknown): string {
  try {
    fn();
    return "no error";
  } catch (err) {
    return err instanceof SheetCodecError ? err.reason : "other error";
  }
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function richCell(url: string) {
  return {
    p: {
      id: "cell", documentStyle: {},
      body: {
        dataStream: "Link\r\n",
        customRanges: [{ startIndex: 0, endIndex: 3, rangeId: "r1", rangeType: 0, properties: { url } }],
      },
    },
  };
}

function workbook(extra: Partial<IWorkbookData> = {}): IWorkbookData {
  return {
    id: SHEET_UNIT_ID, name: "wb", appVersion: "1.0.2", locale: "enUS" as IWorkbookData["locale"], styles: {},
    sheetOrder: ["s1"],
    sheets: {
      s1: {
        id: "s1", name: "One",
        cellData: { 0: { 0: { v: 1, t: 2 }, 1: richCell("javascript:alert(document.cookie)"), 2: richCell("https://merchiva.app/x") } },
        backgroundImage: { source: EVIL_IMAGE, imageSourceType: "URL" as never },
      },
    },
    ...extra,
  };
}

describe("isSafeSheetLink", () => {
  test("http(s), mailto and in-workbook links pass", () => {
    for (const url of ["https://merchiva.app", "http://example.com/a?b=1", "mailto:a@b.co", "#gid=s1&range=A1", "#rangeid=r1", "  https://x.io  "]) {
      expect([url, isSafeSheetLink(url)]).toEqual([url, true]);
    }
  });

  test("script, data, file, relative and protocol-relative links fail", () => {
    const bad = [
      "javascript:alert(1)", " JavaScript:alert(1)", "java\tscript:alert(1)", "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)", "file:///etc/passwd", "relative/path", "//evil.example", "#foo", "", "blob:https://x/1",
    ];
    for (const url of bad) expect([url, isSafeSheetLink(url)]).toEqual([url, false]);
  });
});

describe("image sources", () => {
  test("only https URLs on the upload hosts", () => {
    expect(ALLOWED_IMAGE_HOSTS).toEqual(["utfs.io", "*.ufs.sh"]);
    for (const url of [OK_IMAGE, "https://app1.ufs.sh/f/x", "https://a.b.ufs.sh/f/x", "https://UTFS.IO/f/x", "https://utfs.io:443/f/x"]) {
      expect([url, isAllowedImageUrl(url)]).toEqual([url, true]);
    }
    const bad = [
      "http://utfs.io/f/x", "https://ufs.sh/f/x", "https://evil.example/f/x", "https://utfs.io.evil.example/f/x",
      "https://evilutfs.io/x", "https://user:pw@utfs.io/f/x", "https://utfs.io:8443/f/x", "https://evil.example/?u=https://utfs.io",
      "//utfs.io/f/x", "", "ftp://utfs.io/x",
    ];
    for (const url of bad) expect([url, isAllowedImageUrl(url)]).toEqual([url, false]);
  });

  test("URL / BASE64 / UUID / unknown source types", () => {
    expect(isAllowedImageSource({ source: OK_IMAGE, imageSourceType: "URL" })).toBe(true);
    expect(isAllowedImageSource({ source: EVIL_IMAGE, imageSourceType: "URL" })).toBe(false);
    expect(isAllowedImageSource({ source: OK_DATA, imageSourceType: "BASE64" })).toBe(true);
    expect(isAllowedImageSource({ source: "data:image/svg+xml;base64,PHN2Zz4=", imageSourceType: "BASE64" })).toBe(false);
    expect(isAllowedImageSource({ source: "data:text/html;base64,PHNjcmlwdD4=", imageSourceType: "BASE64" })).toBe(false);
    expect(isAllowedImageSource({ source: "data:image/png;base64,<not base64>", imageSourceType: "BASE64" })).toBe(false);
    expect(isAllowedImageSource({ source: OK_IMAGE, imageSourceType: "BASE64" })).toBe(false);
    expect(isAllowedImageSource({ source: "0b8d7e", imageSourceType: "UUID" })).toBe(false);
    expect(isAllowedImageSource({ source: OK_IMAGE, imageSourceType: undefined })).toBe(false);
    expect(isAllowedImageSource({ source: 42, imageSourceType: "URL" })).toBe(false);
  });

  test("a data:image over 2 MiB is refused, at 2 MiB it passes", () => {
    const body = (bytes: number) => "A".repeat(Math.ceil(bytes / 3) * 4);
    expect(isAllowedImageSource({ source: `data:image/png;base64,${body(SHEET_IMAGE_DATA_MAX_BYTES - 3)}`, imageSourceType: "BASE64" })).toBe(true);
    expect(isAllowedImageSource({ source: `data:image/png;base64,${body(SHEET_IMAGE_DATA_MAX_BYTES + 3)}`, imageSourceType: "BASE64" })).toBe(false);
  });
});

describe("sanitizeOpParams", () => {
  test("rich-text links inside set-range-values", () => {
    const params = { unitId: SHEET_UNIT_ID, subUnitId: "s1", cellValue: { 0: { 0: richCell("javascript:alert(1)"), 1: richCell("https://ok.example") } } };
    const report = newReport();
    sanitizeOpParams("sheet.mutation.set-range-values", params, report);
    expect(params.cellValue[0][0].p.body.customRanges[0].properties.url).toBe("");
    expect(params.cellValue[0][1].p.body.customRanges[0].properties.url).toBe("https://ok.example");
    expect(report).toEqual({ links: 1, images: 0, resources: [] });
  });

  test("the three hyperlink-model mutations", () => {
    const add = { unitId: SHEET_UNIT_ID, subUnitId: "s1", link: { id: "l1", row: 0, column: 0, payload: "javascript:alert(1)" } };
    sanitizeOpParams("sheets.mutation.add-hyper-link", add);
    expect(add.link.payload).toBe("");
    const addOk = { unitId: SHEET_UNIT_ID, subUnitId: "s1", link: { id: "l2", row: 0, column: 0, payload: "#gid=s1&range=B2" } };
    sanitizeOpParams("sheets.mutation.add-hyper-link", addOk);
    expect(addOk.link.payload).toBe("#gid=s1&range=B2");
    const update = { unitId: SHEET_UNIT_ID, subUnitId: "s1", id: "l1", payload: { payload: "data:text/html,<b>x</b>", display: "x" } };
    sanitizeOpParams("sheets.mutation.update-hyper-link", update);
    expect(update.payload.payload).toBe("");
    const rich = { unitId: SHEET_UNIT_ID, subUnitId: "s1", row: 0, col: 0, id: "r1", url: "relative/page" };
    sanitizeOpParams("sheets.mutation.update-rich-hyper-link", rich);
    expect(rich.url).toBe("");
    const notString = { unitId: SHEET_UNIT_ID, subUnitId: "s1", row: 0, col: 0, id: "r1", url: { href: "javascript:x" } };
    sanitizeOpParams("sheets.mutation.update-rich-hyper-link", notString);
    expect(notString.url).toBe("");
  });

  test("a drawing insert (Univer's insertOp) and its objects: an evil URL, a UUID, an oversized data URL and a type-less source are blanked", () => {
    const drawings = [
      { drawingId: "d1", drawingType: 0, imageSourceType: "URL", source: EVIL_IMAGE },
      { drawingId: "d2", drawingType: 0, imageSourceType: "UUID", source: "abc" },
      { drawingId: "d3", drawingType: 0, imageSourceType: "BASE64", source: HUGE_DATA },
      { drawingId: "d4", drawingType: 0, imageSourceType: "URL", source: OK_IMAGE },
      // No type yet: a later op could add one, so drawing data judges the value alone.
      { drawingId: "d5", source: EVIL_IMAGE },
    ];
    const op = drawings.map((d) => JSON1.insertOp([...DATA_PATH, d.drawingId], d as JsonDoc)).reduce(JSON1.type.compose, null);
    const params = { ...drawingParams(op, 0), objects: [{ ...drawings[0] }, { drawingId: "d6", drawingType: 0, source: EVIL_IMAGE }] };
    const report = newReport();
    sanitizeOpParams(DRAWING_APPLY, params, report);
    expect(sourcesAfter(drawingModel(), params.op)).toEqual({ d1: "", d2: "", d3: "", d4: OK_IMAGE, d5: "" });
    expect(params.objects.map((o) => o.source)).toEqual(["", ""]);
    expect(report.images).toBe(6);
  });

  test("a worksheet background image", () => {
    const params = { unitId: SHEET_UNIT_ID, subUnitId: "s1", backgroundImage: { source: EVIL_IMAGE, imageSourceType: "URL", scaleX: 1 } };
    sanitizeOpParams("sheet.mutation.set-worksheet-background-image", params);
    expect(params.backgroundImage).toEqual({ source: "", imageSourceType: "URL", scaleX: 1 });
    const ok = { unitId: SHEET_UNIT_ID, subUnitId: "s1", backgroundImage: { source: OK_DATA, imageSourceType: "BASE64" } };
    sanitizeOpParams("sheet.mutation.set-worksheet-background-image", ok);
    expect(ok.backgroundImage.source).toBe(OK_DATA);
  });

  test("doc-model images the renderer loads whatever their type: text-fill picture, document background, bullet image", () => {
    const docCell = (source: string) => ({
      p: {
        id: "c", documentStyle: { background: { source, sourceType: "URL" } },
        body: {
          dataStream: "ab\r\n",
          textRuns: [{ st: 0, ed: 2, ts: { textFill: { type: "picture", picture: { source, mode: "tile" } } } }],
          paragraphs: [{ startIndex: 2, bullet: { listType: "BULLET_LIST", listId: "l", nestingLevel: 0, image: { source } } }],
        },
      },
    });
    const params = { unitId: SHEET_UNIT_ID, subUnitId: "s1", cellValue: { 0: { 0: docCell(EVIL_IMAGE), 1: docCell(OK_IMAGE), 2: docCell(OK_DATA) } } };
    const report = newReport();
    sanitizeOpParams("sheet.mutation.set-range-values", params, report);
    const sources = (cell: ReturnType<typeof docCell>) => [
      cell.p.documentStyle.background.source, cell.p.body.textRuns[0].ts.textFill.picture.source, cell.p.body.paragraphs[0].bullet.image.source,
    ];
    expect(sources(params.cellValue[0][0])).toEqual(["", "", ""]);
    expect(sources(params.cellValue[0][1])).toEqual([OK_IMAGE, OK_IMAGE, OK_IMAGE]);
    expect(sources(params.cellValue[0][2])).toEqual([OK_DATA, OK_DATA, OK_DATA]);
    expect(report.images).toBe(3);
  });

  test("outside drawing data a `source` that is not an image is left alone", () => {
    const params = { unitId: SHEET_UNIT_ID, subUnitId: "s1", ruleId: "dv1", source: "command", rule: { uid: "dv1", type: "list", formula1: "a,b", ranges: [] } };
    const before = clone(params);
    const report = newReport();
    sanitizeOpParams("data-validation.mutation.add", params, report);
    expect(params).toEqual(before);
    expect(report).toEqual({ links: 0, images: 0, resources: [] });
  });

  test("mutation ids are untrusted: prototype names are ordinary ids", () => {
    for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const params = { url: "javascript:alert(1)", cellValue: { 0: { 0: richCell("javascript:alert(2)") } } };
      expect(() => sanitizeOpParams(id, params)).not.toThrow();
      expect(params.url).toBe("javascript:alert(1)");
      expect(params.cellValue[0][0].p.body.customRanges[0].properties.url).toBe("");
    }
  });

  test("idempotent: a second pass changes nothing", () => {
    const params = { cellValue: { 0: { 0: richCell("javascript:1") } }, backgroundImage: { source: EVIL_IMAGE, imageSourceType: "URL" } };
    sanitizeOpParams("sheet.mutation.set-range-values", params);
    const once = clone(params);
    const report = newReport();
    sanitizeOpParams("sheet.mutation.set-range-values", params, report);
    expect(params).toEqual(once);
    expect(report).toEqual({ links: 0, images: 0, resources: [] });
  });
});

describe("drawing json1 ops in the shapes Univer emits", () => {
  const saved = { d1: { drawingId: "d1", drawingType: 0, imageSourceType: "URL", source: OK_IMAGE, title: EVIL_IMAGE }, d2: { drawingId: "d2", drawingType: 0, imageSourceType: "URL", source: OK_IMAGE, transform: { left: 0 } } };

  test("a field-level source replace (appendJsonUpdateOps) is judged on its value alone", () => {
    const cases: Array<[unknown, unknown]> = [
      [EVIL_IMAGE, ""], ["javascript:alert(1)", ""], ["abc-uuid", ""], [HUGE_DATA, ""], [{ href: EVIL_IMAGE }, ""],
      [OK_IMAGE, OK_IMAGE], [OK_DATA, OK_DATA], ["", ""],
    ];
    for (const [value, expected] of cases) {
      const params = drawingParams(JSON1.replaceOp([...DATA_PATH, "d1", "source"], OK_IMAGE, value as JsonDoc));
      sanitizeOpParams(DRAWING_APPLY, params);
      expect([String(value).slice(0, 40), sourcesAfter(drawingModel(saved), params.op).d1]).toEqual([String(value).slice(0, 40), expected]);
    }
    const insert = drawingParams(JSON1.insertOp([...DATA_PATH, "d2", "source"], EVIL_IMAGE));
    const report = newReport();
    sanitizeOpParams(DRAWING_APPLY, insert, report);
    expect(insert.op).toEqual([...DATA_PATH, "d2", "source", { i: "" }]);
    expect(report.images).toBe(1);
  });

  test("composed updates of several drawings; a separate type change keeps an allowed source", () => {
    const op = [
      JSON1.replaceOp([...DATA_PATH, "d1", "source"], OK_IMAGE, EVIL_IMAGE),
      JSON1.replaceOp([...DATA_PATH, "d2", "source"], OK_IMAGE, OK_DATA),
      JSON1.replaceOp([...DATA_PATH, "d2", "imageSourceType"], "URL", "UUID"),
      JSON1.replaceOp([...DATA_PATH, "d2", "transform"], { left: 0 }, { left: 5 }),
    ].reduce(JSON1.type.compose, null);
    const params = drawingParams(op);
    const report = newReport();
    sanitizeOpParams(DRAWING_APPLY, params, report);
    const next = JSON1.type.apply(drawingModel(saved) as unknown as JsonDoc, params.op as JsonOp) as unknown as DrawingModel;
    expect(next[SHEET_UNIT_ID].s1.data.d1.source).toBe("");
    expect(next[SHEET_UNIT_ID].s1.data.d2).toMatchObject({ source: OK_DATA, imageSourceType: "UUID", transform: { left: 5 } });
    expect(report.images).toBe(1);
    const once = clone(params);
    sanitizeOpParams(DRAWING_APPLY, params);
    expect(params).toEqual(once);
  });

  test("a move or an embedded edit at source / imageSourceType refuses the op", () => {
    const refused: unknown[] = [
      JSON1.moveOp([...DATA_PATH, "d1", "title"], [...DATA_PATH, "d1", "source"]),
      JSON1.moveOp([...DATA_PATH, "d1", "source"], [...DATA_PATH, "d1", "title"]),
      JSON1.moveOp([...DATA_PATH, "d1", "source"], [...DATA_PATH, "d2", "source"]),
      JSON1.moveOp([...DATA_PATH, "d1", "title"], [...DATA_PATH, "d2", "imageSourceType"]),
      JSON1.editOp([...DATA_PATH, "d1", "source"], "text-unicode", ["evil"]),
      [...DATA_PATH, "d1", "imageSourceType", { ena: 1 }],
      [...DATA_PATH, "d1", "source", { e: ["x"], et: "text-unicode" }],
    ];
    for (const op of refused) expect([JSON.stringify(op), codecReason(() => sanitizeOpParams(DRAWING_APPLY, drawingParams(op)))]).toEqual([JSON.stringify(op), "bad_shape"]);
    // Only the drawing mutation reads its op as json1.
    expect(codecReason(() => sanitizeOpParams("sheet.mutation.x", drawingParams(refused[0])))).toBe("no error");
  });

  test("Univer's own order moves, removals and inserts of safe drawings pass untouched", () => {
    const ops: unknown[] = [
      JSON1.moveOp([SHEET_UNIT_ID, "s1", "order", 0], [SHEET_UNIT_ID, "s1", "order", 1]),
      [JSON1.removeOp([...DATA_PATH, "d1"], true), JSON1.removeOp([SHEET_UNIT_ID, "s1", "order", 0], true)].reduce(JSON1.type.compose, null),
      [JSON1.insertOp([...DATA_PATH, "d3"], { ...saved.d2, drawingId: "d3" }), JSON1.insertOp([SHEET_UNIT_ID, "s1", "order", 2], "d3")].reduce(JSON1.type.compose, null),
    ];
    for (const op of ops) {
      const params = drawingParams(op);
      const before = clone(params);
      const report = newReport();
      sanitizeOpParams(DRAWING_APPLY, params, report);
      expect(params).toEqual(before);
      expect(report).toEqual({ links: 0, images: 0, resources: [] });
    }
  });
});

describe("sanitizeWorkbookData", () => {
  const protection = [RESOURCE.RANGE_PROTECTION, RESOURCE.WORKSHEET_PROTECTION, RESOURCE.WORKSHEET_PROTECTION_POINT];
  const drawingData = JSON.stringify({ s1: { data: { d1: { drawingId: "d1", drawingType: 0, imageSourceType: "URL", source: EVIL_IMAGE } }, order: ["d1"] } });
  const dvData = JSON.stringify({ s1: [{ uid: "dv1", type: "list", formula1: "a,b", ranges: [] }] });

  function hostile(): IWorkbookData {
    return workbook({
      resources: [
        ...protection.map((name) => ({ name, data: JSON.stringify({ s1: [{ permissionId: "p" }] }) })),
        { name: RESOURCE.DRAWING, data: drawingData },
        { name: RESOURCE.HYPER_LINK, data: JSON.stringify({ s1: [{ id: "l1", row: 0, column: 0, payload: "javascript:alert(1)" }] }) },
        { name: RESOURCE.DATA_VALIDATION, data: dvData },
        { name: RESOURCE.NOTE, data: "{ not json" },
        { name: RESOURCE.FILTER, data: "" },
      ],
    });
  }

  test("links, backgrounds, drawings and hyperlink payloads are neutralized; protection and broken resources removed", () => {
    const wb = hostile();
    const report = newReport();
    expect(sanitizeWorkbookData(wb, report)).toBe(wb);
    const cells = wb.sheets.s1.cellData as Record<number, Record<number, ReturnType<typeof richCell>>>;
    expect(cells[0][1].p.body.customRanges[0].properties.url).toBe("");
    expect(cells[0][2].p.body.customRanges[0].properties.url).toBe("https://merchiva.app/x");
    expect(wb.sheets.s1.backgroundImage?.source).toBe("");
    const names = (wb.resources ?? []).map((r) => r.name);
    expect(names).toEqual([RESOURCE.DRAWING, RESOURCE.HYPER_LINK, RESOURCE.DATA_VALIDATION, RESOURCE.FILTER]);
    const byName = new Map((wb.resources ?? []).map((r) => [r.name, r.data]));
    expect(JSON.parse(byName.get(RESOURCE.DRAWING) ?? "").s1.data.d1.source).toBe("");
    expect(JSON.parse(byName.get(RESOURCE.HYPER_LINK) ?? "").s1[0].payload).toBe("");
    // An untouched resource keeps its exact string.
    expect(byName.get(RESOURCE.DATA_VALIDATION)).toBe(dvData);
    expect(byName.get(RESOURCE.FILTER)).toBe("");
    expect(report.links).toBe(2);
    expect(report.images).toBe(2);
    expect(report.resources).toEqual([...protection, RESOURCE.NOTE]);
  });

  test("a malformed item does not hide the list: it is dropped and the other resources are still sanitized", () => {
    // Univer loads resources by name (`resources.find(r => r.name === pluginName)`), so it skips such an item.
    const linkData = JSON.stringify({ s1: [{ id: "l1", row: 0, column: 0, payload: "javascript:alert(1)" }] });
    const malformed: Array<[unknown, string]> = [
      [{}, ""], [null, ""], [42, ""], ["text", ""], [[], ""], [{ name: 7, data: "{}" }, ""],
      [{ name: RESOURCE.NOTE, data: { not: "a string" } }, RESOURCE.NOTE], [{ name: RESOURCE.NOTE }, RESOURCE.NOTE],
    ];
    for (const [item, reported] of malformed) {
      for (const first of [false, true]) {
        const good = [{ name: RESOURCE.DRAWING, data: drawingData }, { name: RESOURCE.RANGE_PROTECTION, data: "{}" }, { name: RESOURCE.HYPER_LINK, data: linkData }];
        const resources = (first ? [item, ...good] : [...good, item]) as IWorkbookData["resources"];
        // Through the codec as well: decodeSheetEnvelope only checks that `resources` is an array.
        const wb = decodeSheetEnvelope(encodeSheetSnapshot(workbook({ resources }))).wb;
        const report = newReport();
        sanitizeWorkbookData(wb, report);
        const label = JSON.stringify([item, first]);
        expect([label, (wb.resources ?? []).map((r) => r.name)]).toEqual([label, [RESOURCE.DRAWING, RESOURCE.HYPER_LINK]]);
        const byName = new Map((wb.resources ?? []).map((r) => [r.name, r.data]));
        expect([label, JSON.parse(byName.get(RESOURCE.DRAWING) ?? "").s1.data.d1.source]).toEqual([label, ""]);
        expect([label, JSON.parse(byName.get(RESOURCE.HYPER_LINK) ?? "").s1[0].payload]).toEqual([label, ""]);
        const expected = first ? [reported, RESOURCE.RANGE_PROTECTION] : [RESOURCE.RANGE_PROTECTION, reported];
        expect([label, report.resources]).toEqual([label, expected]);
      }
    }
  });

  test("the workbook's own resources are a list whatever their items; elsewhere one named item makes one", () => {
    const wb = workbook({ resources: [{}, null] as unknown as IWorkbookData["resources"] });
    const report = newReport();
    sanitizeWorkbookData(wb, report);
    expect(wb.resources).toEqual([]);
    expect(report.resources).toEqual(["", ""]);
    // A cell document's resources, with one nameless item beside a drawing.
    const cell = { p: { id: "c", body: { dataStream: "\r\n" }, resources: [{}, { name: RESOURCE.DRAWING, data: drawingData }] } };
    const params = { unitId: SHEET_UNIT_ID, subUnitId: "s1", cellValue: { 0: { 0: cell } } };
    sanitizeOpParams("sheet.mutation.set-range-values", params);
    expect(cell.p.resources).toHaveLength(1);
    expect(JSON.parse((cell.p.resources[0] as { data: string }).data).s1.data.d1.source).toBe("");
    // A `resources` array with no named item is ordinary data.
    const plain = { unitId: SHEET_UNIT_ID, subUnitId: "s1", resources: [1, { id: 2 }] };
    sanitizeOpParams("sheet.mutation.x", plain);
    expect(plain.resources).toEqual([1, { id: 2 }]);
  });

  test("cell rich-text drawings are covered", () => {
    const wb = workbook();
    (wb.sheets.s1.cellData as Record<number, Record<number, unknown>>)[1] = {
      0: { p: { id: "c", documentStyle: {}, body: { dataStream: "\b\r\n" }, drawings: { img: { drawingId: "img", drawingType: 0, imageSourceType: "URL", source: EVIL_IMAGE } } } },
    };
    sanitizeWorkbookData(wb);
    const cell = (wb.sheets.s1.cellData as unknown as Record<number, Record<number, { p: { drawings: Record<string, { source: string }> } }>>)[1][0];
    expect(cell.p.drawings.img.source).toBe("");
  });

  test("idempotent: the second pass reports nothing and changes nothing", () => {
    const wb = hostile();
    sanitizeWorkbookData(wb);
    const once = clone(wb);
    const report = newReport();
    sanitizeWorkbookData(wb, report);
    expect(wb).toEqual(once);
    expect(report).toEqual({ links: 0, images: 0, resources: [] });
  });

  test("allowed hosts and safe links pass untouched", () => {
    const wb = workbook();
    wb.sheets.s1.backgroundImage = { source: OK_IMAGE, imageSourceType: "URL" as never };
    (wb.sheets.s1.cellData as Record<number, Record<number, unknown>>)[0][1] = richCell("mailto:shop@merchiva.app");
    const before = clone(wb);
    const report = newReport();
    sanitizeWorkbookData(wb, report);
    expect(wb).toEqual(before);
    expect(report).toEqual({ links: 0, images: 0, resources: [] });
  });
});

describe("walker caps", () => {
  function nested(depth: number): Record<string, unknown> {
    let node: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < depth; i++) node = { c: node };
    return node;
  }

  test(`data nested deeper than ${SANITIZE_MAX_DEPTH} levels is rejected as bad_shape`, () => {
    expect(() => sanitizeOpParams("sheet.mutation.x", nested(SANITIZE_MAX_DEPTH))).not.toThrow();
    let error: unknown = null;
    try {
      sanitizeOpParams("sheet.mutation.x", nested(SANITIZE_MAX_DEPTH + 1));
    } catch (err) {
      error = err;
    }
    expect(error instanceof SheetCodecError && error.reason === "bad_shape").toBe(true);
  });

  test("resource JSON continues the depth count", () => {
    const deep = JSON.stringify(nested(SANITIZE_MAX_DEPTH));
    const wb = workbook({ resources: [{ name: RESOURCE.NOTE, data: deep }] });
    expect(() => sanitizeWorkbookData(wb)).toThrow(SheetCodecError);
  });

  test("a structure that aliases one object (2^25 paths through 26 objects) is stopped by the node cap", () => {
    let node: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 25; i++) node = { a: node, b: node };
    const started = Date.now();
    expect(() => sanitizeOpParams("sheet.mutation.x", node)).toThrow(SheetCodecError);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  test("cells holding only values are not counted: 2.1 million of them pass", () => {
    const cell = { v: 1, t: 2 };
    const row: Record<number, typeof cell> = {};
    for (let c = 0; c < 1000; c++) row[c] = cell;
    const cellData: Record<number, typeof row> = {};
    for (let r = 0; r < 2100; r++) cellData[r] = row;
    const wb = workbook();
    wb.sheets.s1.cellData = cellData;
    wb.sheets.s1.backgroundImage = undefined;
    expect(() => sanitizeWorkbookData(wb)).not.toThrow();
  });
});
