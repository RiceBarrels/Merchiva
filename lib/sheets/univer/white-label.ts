// White-labelling of Univer's own copy (sheets.md §9.5): the merged locale packs of the nine presets name
// Microsoft Excel and Univer in function help, and the function list's examples use univer.ai. The editor
// shows our product name instead (t("sheets.brand"), the same in every locale); replacing a proper noun with
// a proper noun keeps the grammar ("Excel 中的" → "Merchiva 中的", "d’Excel" → "de Merchiva").
//
// Pure: no Univer runtime. The packs and the function list are passed in.

import type { ILanguagePack, LanguageValue } from "@univerjs/presets";

/** A product name that must not reach the UI (also matches `univer.ai`). */
export const BRAND_LEAK_RE = /\b(?:microsoft|excel|powerpoint|univer|keynote|google\s+sheets)\b/i;
const BRAND_LEAK_GLOBAL_RE = new RegExp(BRAND_LEAK_RE.source, "gi");

/** `engine-formula.functionList.<FN>.links`: support URLs per function, which nothing in 1.0.2 renders. */
const FUNCTION_LIST_PATH = ["engine-formula", "functionList"];

/** Error texts of Univer's permission checks: a viewer sees our hint instead (§9.5 overrides, §9.8). */
const VIEW_ONLY_MESSAGE_RE = /(?:^|\.)permission\.(?:dialog\.(?:[A-Za-z]+Err|alertContent)|hyperLinkErr)$/;

export interface WhiteLabelOptions {
  brand: string;
  /** Deep-merged over the result (after the rewrite): our own strings win. */
  overrides?: ILanguagePack;
}

/** Rewrites one string: the specific phrases first, then any remaining product name. */
export function whiteLabelText(text: string, brand: string): string {
  return text
    .replace(/Microsoft\s+(?:Office\s+)?(?:Excel|365)\b/g, brand)
    .replace(/([dD])[’']Excel\b/g, `$1e ${brand}`)
    .replace(/([qQ])u[’']Excel\b/g, `$1ue ${brand}`)
    .replace(/\bExcel\b/g, brand)
    .replace(/\bUniver\b/gi, brand)
    .replace(BRAND_LEAK_GLOBAL_RE, brand);
}

function isPack(value: unknown): value is ILanguagePack {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rewrite(value: LanguageValue, brand: string, path: readonly string[]): LanguageValue {
  if (typeof value === "string") return whiteLabelText(value, brand);
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? whiteLabelText(item, brand) : (rewrite(item, brand, path) as ILanguagePack))) as LanguageValue;
  }
  if (!isPack(value)) return value;
  const out: ILanguagePack = {};
  const inFunctionList = path.length === FUNCTION_LIST_PATH.length + 1 && FUNCTION_LIST_PATH.every((key, i) => path[i] === key);
  for (const [key, child] of Object.entries(value)) {
    out[key] = inFunctionList && key === "links" && Array.isArray(child) ? [] : rewrite(child, brand, [...path, key]);
  }
  return out;
}

function deepMerge(target: ILanguagePack, source: ILanguagePack): ILanguagePack {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    target[key] = isPack(value) && isPack(current) ? deepMerge(current, value) : value;
  }
  return target;
}

/** A white-labelled deep copy of `pack` (the input is not changed). */
export function whiteLabelLocale(pack: ILanguagePack, options: WhiteLabelOptions): ILanguagePack {
  const out = rewrite(pack, options.brand, []) as ILanguagePack;
  return options.overrides ? deepMerge(out, options.overrides) : out;
}

/** Overrides replacing every permission-denied message of `pack` with `message`. */
export function viewOnlyOverrides(pack: ILanguagePack, message: string): ILanguagePack {
  const out: ILanguagePack = {};
  const walk = (node: ILanguagePack, path: string, into: ILanguagePack) => {
    for (const [key, value] of Object.entries(node)) {
      const at = path ? `${path}.${key}` : key;
      if (typeof value === "string") {
        if (VIEW_ONLY_MESSAGE_RE.test(at)) into[key] = message;
      } else if (isPack(value)) {
        const child: ILanguagePack = {};
        walk(value, at, child);
        if (Object.keys(child).length > 0) into[key] = child;
      }
    }
  };
  walk(pack, "", out);
  return out;
}

/** The part of Univer's IFunctionInfo this module touches. */
export interface FunctionExampleHolder {
  functionParameter?: Array<{ example?: unknown }>;
}

const neutralizedLists = new WeakSet<object>();

/** Rewrites one example: the univer.ai mail and URL examples become example.com, the name the brand. */
export function neutralizeExample(example: string, brand: string): string {
  return example
    .replace(/developer@univer\.ai/gi, "name@example.com")
    .replace(/univer\.ai/gi, "example.com")
    .replace(/\bUniver\b/gi, brand);
}

/**
 * Rewrites the `example` strings of Univer's exported FUNCTION_LIST in place, once per list (per page): the
 * formula help reads them when its service is constructed, so this runs before the first createUniver.
 */
export function neutralizeFunctionExamples(list: readonly FunctionExampleHolder[], brand: string): void {
  if (neutralizedLists.has(list)) return;
  neutralizedLists.add(list);
  for (const info of list) {
    for (const parameter of info.functionParameter ?? []) {
      if (typeof parameter.example === "string") parameter.example = neutralizeExample(parameter.example, brand);
    }
  }
}
