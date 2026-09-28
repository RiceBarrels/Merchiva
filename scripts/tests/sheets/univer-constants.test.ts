// lib/sheets/univer-constants.ts — the literal mirrors used outside the editor chunk equal the installed Univer
// enums (from @univerjs/presets and the conditional-formatting preset), and the resource names are the names
// the model plugins save under (sheets.md §8, §15 univer-constants). Also the editor's Univer configuration
// against the installed packages (sheets.md §9.2, §9.6, §9.7): the IMAGE() host fence, the desktop → mobile
// plugin swap, and the hidden protection menu ids.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { IPreset, IPresetPlugin, Plugin, PluginCtor, Workbook } from "@univerjs/presets";
import { isAllowedImageUrl } from "@/lib/sheets/image-hosts";
import {
  BOOL, BORDER_STYLE, CELL_TYPE, CF_NUMBER_OP, CF_RULE_TYPE, CF_SUB_TYPE, CF_TEXT_OP, CF_TIME_OP, CF_VALUE_TYPE,
  CUSTOM_RANGE_HYPERLINK, DATE_SYSTEM, DV_ERROR_STYLE, DV_OPERATOR, DV_TYPE, H_ALIGN, IMAGE_SOURCE_TYPE, PROTECTION_RESOURCES,
  RESOURCE, SHEET_HIDDEN, UNIVER_LOCALE, V_ALIGN, WRAP,
} from "@/lib/sheets/univer-constants";
import { SHEET_HIDDEN_MENU_IDS, SHEET_MENU_CONFIG } from "@/lib/sheets/univer/menu-config";
import { buildSafeFormulaFunctions } from "@/lib/sheets/univer/safe-functions";
import { createHeadlessUniver, disposeHeadlessUniverses, loadHeadlessModules } from "./helpers/headless";
import { createHeadlessSheet } from "./helpers/headless-adapter";

type EnumObject = Record<string, string | number>;

/** The named members of a TypeScript enum object (numeric enums also map value → name). */
function members(enumObject: EnumObject): Record<string, string | number> {
  return Object.fromEntries(Object.entries(enumObject).filter(([key]) => !/^\d+$/.test(key)));
}

/** mirror[k] === enum[k] for every key, and the mirror lists every member when `complete`. */
function expectMirror(mirror: Record<string, unknown>, enumObject: EnumObject, complete = true): void {
  const named = members(enumObject);
  for (const [key, value] of Object.entries(mirror)) expect([key, value]).toEqual([key, named[key]]);
  if (complete) expect(Object.keys(mirror).sort()).toEqual(Object.keys(named).sort());
}

describe("univer-constants mirrors the installed enums", () => {
  test("core enums (@univerjs/presets)", async () => {
    const { presets: P } = await loadHeadlessModules();
    const e = (x: unknown) => x as EnumObject;
    expectMirror(UNIVER_LOCALE, e(P.LocaleType));
    expectMirror(CELL_TYPE, e(P.CellValueType));
    expectMirror(BOOL, e(P.BooleanNumber));
    expectMirror(SHEET_HIDDEN, e(P.WorksheetHiddenState));
    expectMirror(H_ALIGN, e(P.HorizontalAlign));
    expectMirror(V_ALIGN, e(P.VerticalAlign));
    expectMirror(WRAP, e(P.WrapStrategy));
    expectMirror(BORDER_STYLE, e(P.BorderStyleTypes));
    expectMirror(DV_TYPE, e(P.DataValidationType));
    expectMirror(DV_OPERATOR, e(P.DataValidationOperator));
    expectMirror(DV_ERROR_STYLE, e(P.DataValidationErrorStyle));
    expectMirror(IMAGE_SOURCE_TYPE, e(P.ImageSourceType));
    // Different key spelling on our side: compare the values.
    expect([DATE_SYSTEM.DATE_1900, DATE_SYSTEM.DATE_1904]).toEqual([P.DateSystem.Date1900, P.DateSystem.Date1904]);
    expect(Object.values(members(e(P.DateSystem))).sort()).toEqual(Object.values(DATE_SYSTEM).sort());
    expect(CUSTOM_RANGE_HYPERLINK).toBe(P.CustomRangeType.HYPERLINK);
  });

  test("conditional-formatting enums (@univerjs/preset-sheets-conditional-formatting)", async () => {
    const { conditionalFormatting: CF } = await loadHeadlessModules();
    const e = (x: unknown) => x as EnumObject;
    expectMirror(CF_RULE_TYPE, e(CF.CFRuleType));
    expectMirror(CF_SUB_TYPE, e(CF.CFSubRuleType));
    expectMirror(CF_VALUE_TYPE, e(CF.CFValueType));
    expectMirror(CF_NUMBER_OP, e(CF.CFNumberOperator));
    expectMirror(CF_TEXT_OP, e(CF.CFTextOperator));
    expectMirror(CF_TIME_OP, e(CF.CFTimePeriodOperator));
  });

  test("resource names are the names the model plugins save under", async () => {
    const sheet = await createHeadlessSheet({
      data: JSON.parse(JSON.stringify({ id: "merchiva-sheet", sheetOrder: ["s1"], styles: {}, resources: [], sheets: { s1: { id: "s1", name: "S", rowCount: 5, columnCount: 5, cellData: {} } } })),
    });
    const saved = new Set((sheet.adapter.save().resources ?? []).map((r) => r.name));
    // Univer 1.0.2 keeps hyperlink-model links in memory only: no resource is saved under the plugin's name,
    // which the sanitizer still recognizes in workbooks written by other versions.
    const { hyperLink } = await loadHeadlessModules();
    expect(RESOURCE.HYPER_LINK).toBe(hyperLink.UniverSheetsHyperLinkPlugin.pluginName);
    for (const [key, name] of Object.entries(RESOURCE)) {
      if (key !== "HYPER_LINK") expect([key, saved.has(name)]).toEqual([key, true]);
    }
    expect(PROTECTION_RESOURCES.every((name) => saved.has(name))).toBe(true);
    disposeHeadlessUniverses();
  });
});

type Ctor = PluginCtor<Plugin>;

const EVIL = "https://evil.example/pixel.png";
const HOSTED = "https://abc123.ufs.sh/f/picture.png";
/** Formula rows: a third-party image, a hosted one, the array form (B3 evil, B4 hosted), and IMAGE inside ISERROR. */
const IMAGE_ROWS = [0, 1, 2, 3, 5] as const;

interface ImageRun {
  /** Displayed value of column A for each IMAGE_ROWS entry (array spills included). */
  values: unknown[];
  /** The rows Univer renders an image in, with its source. */
  images: Array<[number, string]>;
  /** Every URL handed to `new Image()`: Univer measures a formula image on the main thread before drawing it. */
  fetched: string[];
}

/** Computes the IMAGE formulas headless, with or without the editor's function list (the built-in IMAGE). */
async function runImageFormulas(fenced: boolean): Promise<ImageRun> {
  const fetched: string[] = [];
  const scope = globalThis as { Image?: unknown };
  const original = scope.Image;
  scope.Image = class {
    width = 10;
    height = 10;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(url: string) {
      fetched.push(url);
      queueMicrotask(() => this.onload?.());
    }
  };
  try {
    const { core: C } = await loadHeadlessModules();
    const headless = await createHeadlessUniver({ formulas: true, formulaFunctions: fenced ? buildSafeFormulaFunctions(C) : undefined });
    const { presets: P } = headless.modules;
    const workbook = headless.univer.createUnit<object, Workbook>(P.UniverInstanceType.UNIVER_SHEET, {
      id: "fence", sheetOrder: ["s1"], styles: {}, resources: [],
      sheets: { s1: { id: "s1", name: "S", rowCount: 10, columnCount: 3, cellData: {
        0: { 0: { f: `=IMAGE("${EVIL}")` } },
        1: { 0: { f: `=IMAGE("${HOSTED}")` } },
        2: { 0: { f: "=IMAGE(B3:B4)" }, 1: { v: `${EVIL}?array`, t: CELL_TYPE.STRING } },
        3: { 1: { v: HOSTED, t: CELL_TYPE.STRING } },
        5: { 0: { f: `=ISERROR(IMAGE("${EVIL}?iserror"))` } },
      } } },
    });
    const injector = headless.univer.__getInjector();
    injector.get(C.ImageFormulaCellInterceptorController).registerRefreshRenderFunction(() => {}); // the UI's canvas refresh
    await headless.commandService.executeCommand(C.SetFormulaCalculationStartMutation.id, { commands: [], forceCalculation: true }, { onlyLocal: true });
    const sheet = workbook.getSheetBySheetId("s1");
    const imageAt = (row: number) => injector.get(C.FormulaDataModel).getUnitImageFormulaData().fence?.s1?.getValue(row, 0) ?? null;
    for (let i = 0; i < 300 && (sheet?.getCell(5, 0)?.v === undefined || !imageAt(1)?.imageNaturalWidth); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const images: Array<[number, string]> = [];
    for (let row = 0; row < 6; row++) {
      const image = imageAt(row);
      if (image) images.push([row, image.source]);
    }
    return { values: IMAGE_ROWS.map((row) => sheet?.getCell(row, 0)?.v ?? null), images, fetched: [...fetched] };
  } finally {
    disposeHeadlessUniverses();
    scope.Image = original;
  }
}

const split = (entry: IPresetPlugin): [Ctor, unknown] => (Array.isArray(entry) ? [entry[0], entry[1]] : [entry, undefined]);
const ctorsOf = (presets: readonly IPreset[]): Ctor[] => presets.flatMap((preset) => preset.plugins.map((entry) => split(entry)[0]));
const configOf = (presets: readonly IPreset[], ctor: Ctor): Record<string, unknown> | undefined =>
  presets.flatMap((preset) => preset.plugins.map(split)).find(([plugin]) => plugin === ctor)?.[1] as Record<string, unknown> | undefined;

describe("the editor's Univer configuration against the installed presets", () => {
  test("IMAGE() renders only images on our upload hosts: #VALUE! and no fetch otherwise, array form included", async () => {
    const { core: C } = await loadHeadlessModules();
    const VALUE = C.ErrorType.VALUE;
    // Control: the built-in IMAGE loads any URL, so the stub does see fetches.
    const builtIn = await runImageFormulas(false);
    expect(builtIn.fetched).toContain(EVIL);
    expect(builtIn.images).toEqual([[0, EVIL], [1, HOSTED]]);
    expect(builtIn.values).toEqual(["", "", "", "", BOOL.FALSE]);

    const fenced = await runImageFormulas(true);
    expect(fenced.values).toEqual([VALUE, "", VALUE, "", BOOL.TRUE]);
    expect(fenced.images).toEqual([[1, HOSTED]]);
    expect(fenced.fetched.length).toBeGreaterThan(0);
    expect(fenced.fetched.filter((url) => !isAllowedImageUrl(url))).toEqual([]);
    // Univer 1.0.2 renders no image for an array result (the control has none on rows 2-3); the fence still turns
    // the third-party element into #VALUE!, so a later Univer that does render them fetches nothing from it.
  });

  test("swapToMobile replaces every desktop UI plugin in place with its config, and drops the notes UI", async () => {
    const m = await loadHeadlessModules();
    const C = m.core;
    const findReplace = await import("@univerjs/preset-sheets-find-replace");
    const { buildSheetPresets, swapToMobile } = await import("@/lib/sheets/univer/presets");
    const { MerchivaImageIoService } = await import("@/lib/sheets/univer/image-io");
    const swaps = new Map<Ctor, Ctor>([
      [C.UniverUIPlugin, C.UniverMobileUIPlugin],
      [C.UniverSheetsUIPlugin, C.UniverSheetsMobileUIPlugin],
      [C.UniverDocsUIPlugin, C.UniverDocsMobileUIPlugin],
      [C.UniverSheetsFormulaUIPlugin, C.UniverSheetsFormulaMobileUIPlugin],
      [C.UniverSheetsNumfmtUIPlugin, C.UniverSheetsNumfmtMobileUIPlugin],
      [m.filter.UniverSheetsFilterUIPlugin, m.filter.UniverSheetsFilterMobileUIPlugin],
      [m.sort.UniverSheetsSortUIPlugin, m.sort.UniverSheetsSortMobileUIPlugin],
      [m.conditionalFormatting.UniverSheetsConditionalFormattingUIPlugin, m.conditionalFormatting.UniverSheetsConditionalFormattingMobileUIPlugin],
      [m.dataValidation.UniverSheetsDataValidationUIPlugin, m.dataValidation.UniverSheetsDataValidationMobileUIPlugin],
      [findReplace.UniverFindReplacePlugin, findReplace.UniverFindReplaceMobileUIPlugin],
      [findReplace.UniverSheetsFindReplacePlugin, findReplace.UniverSheetsFindReplaceMobileUIPlugin],
      [m.hyperLink.UniverSheetsHyperLinkUIPlugin, m.hyperLink.UniverSheetsHyperLinkMobileUIPlugin],
      [m.drawing.UniverDrawingUIPlugin, m.drawing.UniverDrawingMobileUIPlugin],
      [m.drawing.UniverSheetsDrawingUIPlugin, m.drawing.UniverSheetsDrawingMobileUIPlugin],
    ]);
    const dropped = m.note.UniverSheetsNoteUIPlugin;
    const opened: string[] = [];
    const desktop = buildSheetPresets({
      container: {} as HTMLElement, layout: "desktop", ribbon: "simple", worker: null, popupRootId: "sheet-popups",
      disableAutoFocus: false, onOpenUrl: (url) => opened.push(url),
    });
    const mobile = swapToMobile(desktop);

    // Same presets in the same order; every entry kept, swapped in place (same config object), or dropped.
    expect(mobile.length).toBe(desktop.length);
    desktop.forEach((preset, i) => {
      const expected = preset.plugins.map(split).filter(([ctor]) => ctor !== dropped).map(([ctor, config]) => [swaps.get(ctor) ?? ctor, config]);
      expect(mobile[i].plugins.map(split)).toEqual(expected as Array<[Ctor, unknown]>);
    });
    const desktopCtors = ctorsOf(desktop);
    const mobileCtors = ctorsOf(mobile);
    for (const [from, to] of swaps) {
      expect([from.pluginName, typeof to, desktopCtors.filter((ctor) => ctor === from).length]).toEqual([from.pluginName, "function", 1]);
      expect([from.pluginName, mobileCtors.includes(from), mobileCtors.includes(to)]).toEqual([from.pluginName, false, true]);
    }
    expect([desktopCtors.includes(dropped), mobileCtors.includes(dropped)]).toEqual([true, false]);
    // A UI plugin a Univer upgrade adds to a preset must be swapped or dropped as well.
    for (const ctor of desktopCtors.filter((c) => /UIPlugin$/.test(c.name))) expect([ctor.name, swaps.has(ctor) || ctor === dropped]).toEqual([ctor.name, true]);

    // The configs travel with the swap: popups inside the editor, our menus, links through isSafeSheetLink.
    expect(configOf(mobile, C.UniverMobileUIPlugin)).toMatchObject({ popupRootId: "sheet-popups", menu: SHEET_MENU_CONFIG });
    const urlHandler = configOf(mobile, m.hyperLink.UniverSheetsHyperLinkMobileUIPlugin)?.urlHandler as { navigateToOtherWebsite(url: string): void };
    expect(urlHandler).toBe(configOf(desktop, m.hyperLink.UniverSheetsHyperLinkUIPlugin)?.urlHandler);
    urlHandler.navigateToOtherWebsite("javascript:alert(1)");
    urlHandler.navigateToOtherWebsite("https://example.com/menu");
    expect(opened).toEqual(["https://example.com/menu"]);
    const override = configOf(mobile, m.drawing.UniverDrawingPlugin)?.override;
    expect(override).toEqual([[m.presets.IImageIoService, { useClass: MerchivaImageIoService }]]);
  });

  test("withPluginConfig merges into every entry of one plugin, in place, without touching the preset it got", async () => {
    const m = await loadHeadlessModules();
    const { withPluginConfig } = await import("@/lib/sheets/univer/presets");
    const Filter = m.filter.UniverSheetsFilterPlugin;
    const Sort = m.sort.UniverSheetsSortPlugin;
    const preset: IPreset = { plugins: [Filter, [Sort, { a: 1 }], Filter] };
    expect(withPluginConfig(preset, Sort, { b: 2 }).plugins).toEqual([Filter, [Sort, { a: 1, b: 2 }], Filter]);
    expect(withPluginConfig(preset, Filter, { c: 3 }).plugins).toEqual([[Filter, { c: 3 }], [Sort, { a: 1 }], [Filter, { c: 3 }]]);
    expect(preset.plugins).toEqual([Filter, [Sort, { a: 1 }], Filter]);
  });

  test("every hidden menu id is a menu item the installed sheets UI registers", () => {
    const source = readFileSync(join(process.cwd(), "node_modules", "@univerjs", "sheets-ui", "lib", "es", "index.js"), "utf8");
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const id of SHEET_HIDDEN_MENU_IDS) {
      // An id is either a named constant or a command's `id`; a menu schema entry is keyed by that name.
      const constant = new RegExp(`const (\\w+) = "${escape(id)}";`).exec(source)?.[1];
      const command = new RegExp(`const (\\w+) = \\{\\s*type: CommandType\\.\\w+,\\s*id: "${escape(id)}"`).exec(source)?.[1];
      const key = constant ? `[${constant}]: {` : command ? `[${command}.id]: {` : null;
      expect([id, key !== null && source.includes(key)]).toEqual([id, true]);
    }
    expect(Object.entries(SHEET_MENU_CONFIG)).toEqual(SHEET_HIDDEN_MENU_IDS.map((id) => [id, { hidden: true }]));
  });
});
