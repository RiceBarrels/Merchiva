// A UI-less Univer for Bun tests (sheets.md §15, SH3): the model plugins of the preset entries (the only
// @univerjs specifiers the repo may use), without a DOM. `Path2D` is stubbed before the first import, because
// the data-validation and filter entries touch it at module load. Univer instances created here are disposed
// by disposeHeadlessUniverses() (call it in afterEach), so no test leaks timers into the next.
//
// Formulas are not computed unless `formulas: true` (then UniverSheetsFormulaPlugin runs the engine in-thread);
// the formula data model is kept either way, so shared formulas resolve. `formulaFunctions` reaches the engine
// the way the editor's `formula.function` does (lib/sheets/univer/presets.ts).

import type { ICommandService, Univer } from "@univerjs/presets";
import type { FormulaFunctionEntry } from "@/lib/sheets/univer/safe-functions";

type PresetsModule = typeof import("@univerjs/presets");
type CoreModule = typeof import("@univerjs/preset-sheets-core");

export interface HeadlessModules {
  presets: PresetsModule;
  core: CoreModule;
  filter: typeof import("@univerjs/preset-sheets-filter");
  sort: typeof import("@univerjs/preset-sheets-sort");
  conditionalFormatting: typeof import("@univerjs/preset-sheets-conditional-formatting");
  dataValidation: typeof import("@univerjs/preset-sheets-data-validation");
  hyperLink: typeof import("@univerjs/preset-sheets-hyper-link");
  note: typeof import("@univerjs/preset-sheets-note");
  drawing: typeof import("@univerjs/preset-sheets-drawing");
}

function stubPath2D(): void {
  const scope = globalThis as { Path2D?: unknown };
  scope.Path2D ??= class Path2D {
    addPath(): void {}
  };
}

let modules: Promise<HeadlessModules> | null = null;

/** The preset entries, imported once per test process (after the Path2D stub). */
export function loadHeadlessModules(): Promise<HeadlessModules> {
  stubPath2D();
  modules ??= (async () => ({
    presets: await import("@univerjs/presets"),
    core: await import("@univerjs/preset-sheets-core"),
    filter: await import("@univerjs/preset-sheets-filter"),
    sort: await import("@univerjs/preset-sheets-sort"),
    conditionalFormatting: await import("@univerjs/preset-sheets-conditional-formatting"),
    dataValidation: await import("@univerjs/preset-sheets-data-validation"),
    hyperLink: await import("@univerjs/preset-sheets-hyper-link"),
    note: await import("@univerjs/preset-sheets-note"),
    drawing: await import("@univerjs/preset-sheets-drawing"),
  }))();
  return modules;
}

export interface HeadlessUniverOptions {
  /** Compute formulas in-thread (default false: formulas stay as written, cached values unchanged). */
  formulas?: boolean;
  /** The formula engine's extra functions, as the editor passes them (`formula.function` of the core preset). */
  formulaFunctions?: FormulaFunctionEntry[];
}

export interface HeadlessUniver {
  univer: Univer;
  commandService: ICommandService;
  modules: HeadlessModules;
  dispose(): void;
}

const live = new Set<HeadlessUniver>();

/** A Univer with every model plugin the editor's presets register, and no UI. */
export async function createHeadlessUniver(options: HeadlessUniverOptions = {}): Promise<HeadlessUniver> {
  const m = await loadHeadlessModules();
  const { presets: P, core: C } = m;
  const compute = options.formulas === true;
  const univer = new P.Univer({
    locale: P.LocaleType.EN_US,
    locales: { [P.LocaleType.EN_US]: {} },
    logLevel: P.LogLevel.ERROR,
  });
  univer.registerPlugin(C.UniverDocsPlugin);
  univer.registerPlugin(C.UniverFormulaEnginePlugin, { notExecuteFormula: !compute, function: options.formulaFunctions });
  univer.registerPlugin(C.UniverSheetsPlugin, { notExecuteFormula: !compute });
  univer.registerPlugin(C.UniverSheetsNumfmtPlugin);
  if (compute) univer.registerPlugin(C.UniverSheetsFormulaPlugin, { notExecuteFormula: false });
  univer.registerPlugin(m.conditionalFormatting.UniverSheetsConditionalFormattingPlugin);
  univer.registerPlugin(m.dataValidation.UniverDataValidationPlugin);
  univer.registerPlugin(m.dataValidation.UniverSheetsDataValidationPlugin);
  univer.registerPlugin(m.filter.UniverSheetsFilterPlugin);
  univer.registerPlugin(m.sort.UniverSheetsSortPlugin);
  univer.registerPlugin(m.hyperLink.UniverSheetsHyperLinkPlugin);
  univer.registerPlugin(m.note.UniverSheetsNotePlugin);
  univer.registerPlugin(m.drawing.UniverDrawingPlugin);
  univer.registerPlugin(m.drawing.UniverSheetsDrawingPlugin);
  const commandService = univer.__getInjector().get(P.ICommandService);
  const handle: HeadlessUniver = {
    univer,
    commandService,
    modules: m,
    dispose() {
      if (!live.delete(handle)) return;
      univer.dispose();
    },
  };
  live.add(handle);
  return handle;
}

/** Dispose every headless Univer still alive (afterEach). */
export function disposeHeadlessUniverses(): void {
  for (const handle of [...live]) handle.dispose();
}
