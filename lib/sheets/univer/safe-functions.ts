// IMAGE() limited to our upload hosts (sheets.md §9.6, §12.1): the built-in executor, wrapped so a result that
// would make every viewer's grid load a third-party URL becomes #VALUE! instead. Registered in both threads
// (the formula worker computes, the main thread keeps the same function list), and it overrides the built-in
// because Univer appends `formula.function` after ALL_IMPLEMENTED_FUNCTIONS.
//
// No runtime import of the engine: the main thread passes the core preset's namespace and the worker the formula
// engine package itself (formula.worker.ts; the preset's worker entry does not export the executors).

import type { Ctor } from "@univerjs/presets";
import type * as SheetsCore from "@univerjs/preset-sheets-core";
import type { BaseFunction, BaseValueObject, IFunctionNames } from "@univerjs/preset-sheets-core";
import { isAllowedImageUrl } from "@/lib/sheets/image-hosts";

export type SafeFunctionDeps = Pick<typeof SheetsCore, "ALL_IMPLEMENTED_FUNCTIONS" | "ErrorType" | "ErrorValueObject">;

export type FormulaFunctionEntry = [Ctor<BaseFunction>, IFunctionNames];

interface ImageResult {
  isImage(): boolean;
  getImageInfo?: () => { source?: unknown } | null | undefined;
}

/** The image source an IMAGE() result would render, or null when the value is not an image. */
function imageSourceOf(value: BaseValueObject): unknown {
  const candidate = value as unknown as ImageResult;
  if (typeof candidate.isImage !== "function" || !candidate.isImage()) return null;
  return candidate.getImageInfo?.()?.source ?? "";
}

export function buildSafeFormulaFunctions(ef: SafeFunctionDeps): FormulaFunctionEntry[] {
  const builtIn = ef.ALL_IMPLEMENTED_FUNCTIONS.find(([, name]) => name === "IMAGE");
  if (!builtIn) return [];
  const Base = builtIn[0];
  const refuse = (value: BaseValueObject): BaseValueObject => {
    const source = imageSourceOf(value);
    if (source === null) return value;
    return typeof source === "string" && isAllowedImageUrl(source) ? value : ef.ErrorValueObject.create(ef.ErrorType.VALUE);
  };
  class SafeImage extends Base {
    override calculate(...args: BaseValueObject[]) {
      const result = super.calculate(...args);
      if (!("isArray" in result) || typeof result.isArray !== "function") return result;
      const value = result as BaseValueObject;
      return value.isArray() ? value.mapValue((item) => refuse(item)) : refuse(value);
    }
  }
  return [[SafeImage, "IMAGE"]];
}
