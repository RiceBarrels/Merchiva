// i18n fragments for the Drive / Sheets / Slides work. Parallel units keep their keys here instead of editing
// messages/*.json; `bun scripts/i18n/drive.ts` merges them in one serial step. Two shapes, both in this folder:
//
//   <name>.json               meta fields + `locales: { en: Tree, ar: Tree, … }` (small sets)
//   <name>/fragment.json      meta only, plus <name>/<locale>.json holding that locale's Tree (large sets)
//
// A Tree is rooted like messages/*.json ({ "drive": { "errors": { … } } }). Meta: `unit` and `owned` (dotted
// prefixes the fragment may define) are required; `extends` (null, or the name of the fragment whose prefixes this
// one may add NEW leaves under; such a fragment normally lists `owned: []`), `overwrites` (full paths of existing
// messages keys whose value this fragment replaces) and `allowSameAsEn` (leaves allowed to equal en) default to
// null / [] / []. Other meta fields ($schema, note) are ignored.
//
// Structural errors (bad JSON, a non-string leaf, missing `unit`/`owned`) throw from loadFragments; everything else
// is a FragmentProblem from validateFragments. A directory with no fragment.json (a fragment still being written) is
// skipped by loadFragments and named by incompleteFragmentDirs.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { brandViolation } from "../../licenses/brand";
import { convertZh } from "./terms";

export const LOCALES = ["en", "ar", "es", "fr", "hi", "zh-cn", "zh-hk", "zh-tw"] as const;
export type Locale = (typeof LOCALES)[number];
export type Tree = { [k: string]: string | Tree };

export interface Fragment {
  name: string;
  unit: string;
  owned: string[];
  extends: string | null;
  overwrites: string[];
  allowSameAsEn: string[];
  /**
   * An absent locale file or entry is left OUT at runtime (validateFragments reports `locale-missing`), so read this
   * through `hasLocale` / `leavesOf`, or after validation passed. `flatten()` of an absent locale is an empty map.
   */
  locales: Record<Locale, Tree>;
  source: string;
}

export interface FragmentProblem {
  fragment: string;
  key?: string;
  locale?: string;
  rule: string;
  detail: string;
}

export type FragmentRule =
  | "meta" | "extends" | "locale-missing" | "key-parity" | "placeholders" | "unowned" | "owned-overlap"
  | "duplicate-leaf" | "collision" | "unlisted-overwrite" | "overwrite-missing" | "overwrite-unused"
  | "allow-unused" | "value" | "brand" | "script" | "untranslated" | "simplified";

const ROOT = join(import.meta.dir, "..", "..", "..");
export const FRAGMENTS_DIR = import.meta.dir;
export const MESSAGES_DIR = join(ROOT, "messages");

/** Never fragments: Finder / iCloud copies ("x 2.json", "drive-ui 2"), dotfiles, an interrupted write's `.tmp`. */
const IGNORED_NAME = /^\.| 2(\.|$)|\.tmp$/;

// ---------------------------------------------------------------------------------------------------------------
// Loading

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`${displayPath(file)}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function displayPath(path: string): string {
  const rel = relative(ROOT, path);
  return rel.startsWith("..") || isAbsolute(rel) ? path : rel;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asTree(value: unknown, where: string): Tree {
  if (!isObject(value)) throw new Error(`${where}: expected an object`);
  const out: Tree = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
    else if (isObject(v)) out[k] = asTree(v, `${where}.${k}`);
    else throw new Error(`${where}.${k}: a leaf must be a string`);
  }
  return out;
}

function stringList(meta: Record<string, unknown>, field: string, where: string): string[] {
  const v = meta[field];
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((s) => typeof s !== "string")) throw new Error(`${where}: "${field}" must be a string array`);
  return v as string[];
}

function isLocale(s: string): s is Locale {
  return (LOCALES as readonly string[]).includes(s);
}

/** Loads one fragment: a `<name>.json` file, or a directory holding `fragment.json`. */
export function loadFragmentAt(path: string): Fragment {
  const isDir = existsSync(path) && statSync(path).isDirectory();
  const metaFile = isDir ? join(path, "fragment.json") : path;
  const where = displayPath(metaFile);
  if (!existsSync(metaFile)) throw new Error(`${displayPath(path)}: not a fragment (no fragment.json)`);
  const meta = readJson(metaFile);
  if (!isObject(meta)) throw new Error(`${where}: expected an object`);
  if (typeof meta.unit !== "string" || meta.unit.trim() === "") throw new Error(`${where}: "unit" is required`);
  if (!Array.isArray(meta.owned)) throw new Error(`${where}: "owned" is required`);
  const ext = meta.extends ?? null;
  if (ext !== null && typeof ext !== "string") throw new Error(`${where}: "extends" must be a string or null`);

  const locales: Partial<Record<Locale, Tree>> = {};
  if (isDir) {
    if (meta.locales !== undefined) throw new Error(`${where}: a directory fragment keeps its locales in <locale>.json files`);
    for (const entry of readdirSync(path)) {
      if (IGNORED_NAME.test(entry) || entry === "fragment.json") continue;
      const loc = entry.replace(/\.json$/, "");
      if (!entry.endsWith(".json") || !isLocale(loc)) throw new Error(`${displayPath(join(path, entry))}: unexpected file in a fragment directory`);
      locales[loc] = asTree(readJson(join(path, entry)), displayPath(join(path, entry)));
    }
  } else {
    if (!isObject(meta.locales)) throw new Error(`${where}: "locales" is required in a file fragment`);
    for (const [loc, tree] of Object.entries(meta.locales)) {
      if (!isLocale(loc)) throw new Error(`${where}: unknown locale "${loc}"`);
      locales[loc] = asTree(tree, `${where} locales.${loc}`);
    }
  }
  const name = (isDir ? path : path.slice(0, -".json".length)).split(/[\\/]/).filter(Boolean).pop() ?? path;
  return {
    name,
    unit: meta.unit,
    owned: stringList(meta, "owned", where),
    extends: ext,
    overwrites: stringList(meta, "overwrites", where),
    allowSameAsEn: stringList(meta, "allowSameAsEn", where),
    locales: locales as Record<Locale, Tree>, // absent locales stay absent: see Fragment.locales
    source: displayPath(path),
  };
}

const fragmentEntries = (dir: string) =>
  readdirSync(dir, { withFileTypes: true }).filter((e) => !IGNORED_NAME.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));

/** Every fragment in `dir` (default: this folder), sorted by name. Directories with no fragment.json are skipped. */
export function loadFragments(dir: string = FRAGMENTS_DIR): Fragment[] {
  return fragmentEntries(dir)
    .filter((e) => (e.isDirectory() ? existsSync(join(dir, e.name, "fragment.json")) : e.isFile() && e.name.endsWith(".json")))
    .map((e) => loadFragmentAt(join(dir, e.name)));
}

/** Directories in `dir` that loadFragments skips for having no fragment.json. The merge refuses to run past one. */
export function incompleteFragmentDirs(dir: string = FRAGMENTS_DIR): string[] {
  const dirs = fragmentEntries(dir).filter((e) => e.isDirectory() && !existsSync(join(dir, e.name, "fragment.json")));
  return dirs.map((e) => displayPath(join(dir, e.name)));
}

/** Leaves of `tree` by dotted path. An absent tree (a locale a fragment lacks) has none. */
export function flatten(tree: Tree | undefined): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: Tree, prefix: string) => {
    for (const [k, v] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "string") out.set(path, v);
      else walk(v, path);
    }
  };
  if (tree !== undefined) walk(tree, "");
  return out;
}

/**
 * A parsed messages file, flattened like scripts/tests/i18n/keys.test.ts does: objects are walked, anything else
 * (strings, and the few arrays such as landing.home.island) is one leaf.
 */
export function flattenMessages(json: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (isObject(v)) walk(v, path);
      else out.set(path, String(v));
    }
  };
  if (isObject(json)) walk(json, "");
  return out;
}

/** messages/<locale>.json of `dir`, flattened. */
export function loadMessages(dir: string = MESSAGES_DIR): Record<Locale, Map<string, string>> {
  const out: Partial<Record<Locale, Map<string, string>>> = {};
  for (const loc of LOCALES) out[loc] = flattenMessages(readJson(join(dir, `${loc}.json`)));
  return out as Record<Locale, Map<string, string>>;
}

export function hasLocale(frag: Fragment, locale: Locale): boolean {
  return Object.hasOwn(frag.locales, locale);
}

/** The fragment's leaves in `locale` ([] when that locale is absent). */
export function leavesOf(frag: Fragment, locale: Locale): Map<string, string> {
  return hasLocale(frag, locale) ? flatten(frag.locales[locale]) : new Map();
}

export function underPrefix(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(`${prefix}.`);
}

/** Prefixes a fragment may write: its own `owned`, plus its parent's when it `extends` one. */
export function writablePrefixes(frag: Fragment, all: ReadonlyArray<Fragment>): string[] {
  const parent = frag.extends ? all.find((f) => f.name === frag.extends && f !== frag) : undefined;
  return [...frag.owned, ...(parent?.owned ?? [])];
}

/** Fragment leaves whose value in messages/<locale>.json is missing or different. */
export function unmergedLeaves(
  frags: ReadonlyArray<Fragment>,
  messages: Record<Locale, Map<string, string>>,
): Array<{ fragment: string; locale: Locale; key: string }> {
  const out: Array<{ fragment: string; locale: Locale; key: string }> = [];
  for (const frag of frags) {
    for (const loc of LOCALES) {
      for (const [key, value] of leavesOf(frag, loc)) {
        if (messages[loc].get(key) !== value) out.push({ fragment: frag.name, locale: loc, key });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Validation

const SCRIPT_RE: Partial<Record<Locale, RegExp>> = {
  ar: /[\u0600-\u06FF]/,
  hi: /[\u0900-\u097F]/,
  "zh-cn": /[\u3400-\u9FFF]/,
  "zh-hk": /[\u3400-\u9FFF]/,
  "zh-tw": /[\u3400-\u9FFF]/,
};

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

/** False for values made only of placeholders, digits and punctuation: nothing there to translate. */
const hasWords = (s: string) => /\p{L}/u.test(s.replace(/\{\w+\}/g, ""));

/** Every proper prefix of every key: the paths that are objects, so a leaf may not sit there. */
function objectPaths(keys: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const key of keys) {
    const parts = key.split(".");
    for (let i = 1; i < parts.length; i++) out.add(parts.slice(0, i).join("."));
  }
  return out;
}

function properPrefixes(key: string): string[] {
  const parts = key.split(".");
  return parts.slice(1).map((_, i) => parts.slice(0, i + 1).join("."));
}

export function validateFragments(
  frags: ReadonlyArray<Fragment>,
  messages: Record<Locale, Map<string, string>>,
): FragmentProblem[] {
  const problems: FragmentProblem[] = [];
  const add = (fragment: string, rule: FragmentRule, detail: string, key?: string, locale?: string) =>
    problems.push({ fragment, rule, detail, ...(key !== undefined ? { key } : {}), ...(locale !== undefined ? { locale } : {}) });
  const msgObjects = Object.fromEntries(LOCALES.map((l) => [l, objectPaths(messages[l].keys())])) as Record<Locale, Set<string>>;

  const seenNames = new Set<string>();
  for (const frag of frags) {
    if (seenNames.has(frag.name)) add(frag.name, "meta", `two fragments are named "${frag.name}"`);
    seenNames.add(frag.name);
  }

  // Keys each fragment defines: en's, or the union when en itself is missing.
  const keysOf = new Map<Fragment, string[]>();
  for (const frag of frags) {
    const keys = hasLocale(frag, "en") ? [...leavesOf(frag, "en").keys()] : [...new Set(LOCALES.flatMap((l) => [...leavesOf(frag, l).keys()]))];
    keysOf.set(frag, keys);
  }

  for (const frag of frags) {
    const keys = keysOf.get(frag) ?? [];
    const keySet = new Set(keys);
    const allowSame = new Set(frag.allowSameAsEn);
    const overwrites = new Set(frag.overwrites);
    const flat = Object.fromEntries(LOCALES.map((l) => [l, leavesOf(frag, l)])) as Record<Locale, Map<string, string>>;
    const en = flat.en;

    if (frag.extends !== null && !frags.some((f) => f.name === frag.extends && f !== frag)) {
      add(frag.name, "extends", `extends "${frag.extends}", which is not a fragment`);
    }
    for (const loc of LOCALES) if (!hasLocale(frag, loc)) add(frag.name, "locale-missing", `no ${loc} locale`, undefined, loc);

    // Key and placeholder parity against en.
    if (hasLocale(frag, "en")) {
      for (const loc of LOCALES) {
        if (loc === "en" || !hasLocale(frag, loc)) continue;
        for (const key of en.keys()) if (!flat[loc].has(key)) add(frag.name, "key-parity", `missing in ${loc}`, key, loc);
        for (const [key, value] of flat[loc]) {
          if (!en.has(key)) add(frag.name, "key-parity", `${loc} has a key en does not`, key, loc);
          else if (placeholders(value) !== placeholders(en.get(key) ?? "")) {
            add(frag.name, "placeholders", `{${placeholders(value)}} in ${loc}, {${placeholders(en.get(key) ?? "")}} in en`, key, loc);
          }
        }
      }
    }

    // Ownership, overwrites, allowSameAsEn.
    const writable = writablePrefixes(frag, frags);
    for (const key of keys) {
      if (!overwrites.has(key) && !writable.some((p) => underPrefix(key, p))) {
        add(frag.name, "unowned", `not under ${writable.length > 0 ? writable.join(", ") : "any owned prefix"} and not in overwrites`, key);
      }
    }
    for (const key of frag.overwrites) {
      if (!messages.en.has(key)) add(frag.name, "overwrite-missing", "listed in overwrites but not a key of messages/en.json", key);
      if (!keySet.has(key)) add(frag.name, "overwrite-unused", "listed in overwrites but not defined by this fragment", key);
    }
    for (const key of frag.allowSameAsEn) {
      if (!keySet.has(key)) add(frag.name, "allow-unused", "listed in allowSameAsEn but not defined by this fragment", key);
    }

    // Per-value rules.
    for (const loc of LOCALES) {
      for (const [key, value] of flat[loc]) {
        if (value.length === 0 || value.trim() !== value) {
          add(frag.name, "value", "empty, or leading/trailing whitespace", key, loc);
          continue;
        }
        const brand = brandViolation(loc, value);
        if (brand !== null) add(frag.name, "brand", `uses "${brand}"`, key, loc);
        if (loc === "en" || allowSame.has(key) || !hasWords(value)) continue;
        if (value === en.get(key)) {
          add(frag.name, "untranslated", `${loc} equals en`, key, loc);
          continue;
        }
        const script = SCRIPT_RE[loc];
        if (script && !script.test(value)) add(frag.name, "script", `${loc} value has no ${loc} script`, key, loc);
      }
    }

    // Not left simplified.
    for (const [loc, convert] of [["zh-tw", convertZh.tw], ["zh-hk", convertZh.hk]] as const) {
      for (const [key, zhcn] of flat["zh-cn"]) {
        if (flat[loc].get(key) === zhcn && convert(zhcn) !== zhcn) {
          add(frag.name, "simplified", `${loc} equals zh-cn, but OpenCC converts it to "${convert(zhcn)}"`, key, loc);
        }
      }
    }

    // Against messages: unlisted overwrites and leaf/object collisions (one problem per key).
    for (const key of keys) {
      const differing = LOCALES.filter((l) => {
        const current = messages[l].get(key);
        return current !== undefined && flat[l].has(key) && current !== flat[l].get(key);
      });
      if (differing.length > 0 && !overwrites.has(key)) {
        add(frag.name, "unlisted-overwrite", `exists in messages with a different value (${differing.join(", ")}); list it in overwrites or change the key`, key);
      }
      const colliding = LOCALES.filter((l) => msgObjects[l].has(key) || properPrefixes(key).some((p) => messages[l].has(p)));
      if (colliding.length > 0) add(frag.name, "collision", `a leaf/object collision with messages (${colliding.join(", ")})`, key);
    }
  }

  // Across fragments: owned overlap, duplicate leaves, leaf/object collisions.
  for (let i = 0; i < frags.length; i++) {
    for (let j = i + 1; j < frags.length; j++) {
      const a = frags[i];
      const b = frags[j];
      if (a.extends === b.name || b.extends === a.name) continue;
      const pairs = a.owned.flatMap((pa) => b.owned.filter((pb) => underPrefix(pa, pb) || underPrefix(pb, pa)).map((pb) => `${pa} ~ ${pb}`));
      if (pairs.length > 0) add(b.name, "owned-overlap", `owned prefixes overlap "${a.name}": ${pairs.join("; ")} (only an extends fragment may share them)`);
    }
  }
  const definedBy = new Map<string, string>();
  for (const frag of frags) {
    for (const key of keysOf.get(frag) ?? []) {
      const first = definedBy.get(key);
      if (first !== undefined && first !== frag.name) add(frag.name, "duplicate-leaf", `already defined by "${first}"`, key);
      else definedBy.set(key, frag.name);
    }
  }
  const fragObjects = objectPaths(definedBy.keys());
  for (const [key, owner] of definedBy) {
    if (fragObjects.has(key)) add(owner, "collision", "a leaf here, but another fragment puts keys under it", key);
  }
  return problems;
}

export function formatProblem(p: FragmentProblem): string {
  const where = [p.key, p.locale].filter(Boolean).join(" @ ");
  return `[${p.fragment}] ${p.rule}${where ? ` ${where}` : ""}: ${p.detail}`;
}
