// The formula engine's module Web Worker (sheets.md §9.3): a second, UI-less Univer that computes formulas for
// the editor's main-thread instance over Univer's RPC (the main thread registers the engine with
// notExecuteFormula). Created by worker-support.ts; the S0 spike ran this entry under Turbopack dev,
// `next build` and the static export. The one place `@univerjs/engine-formula` is imported (a direct
// dependency, pinned 1.0.2): the preset's worker entry does not export the IMAGE() executor safe-functions wraps.

import * as engineFormula from "@univerjs/engine-formula";
import { UniverSheetsCoreWorkerPreset } from "@univerjs/preset-sheets-core/worker";
import { UniverSheetsFilterWorkerPreset } from "@univerjs/preset-sheets-filter/worker";
import { LocaleType, LogLevel, createUniver } from "@univerjs/presets";
import { buildSafeFormulaFunctions } from "./safe-functions";

createUniver({
  locale: LocaleType.EN_US,
  locales: { [LocaleType.EN_US]: {} },
  logLevel: LogLevel.WARN,
  presets: [
    UniverSheetsCoreWorkerPreset({ formula: { function: buildSafeFormulaFunctions(engineFormula) } }),
    UniverSheetsFilterWorkerPreset(),
  ],
});
