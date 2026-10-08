// Merges the Drive / Sheets / Slides i18n fragments (scripts/i18n/drive/) into all 8 locale files.
//
//   bun scripts/i18n/drive.ts                     validate every fragment, abort on any problem, else merge
//   bun scripts/i18n/drive.ts --check             write nothing; exit 1 on a problem or on any fragment leaf
//                                                 that messages/*.json does not hold with the same value
//   bun scripts/i18n/drive.ts --derive-zh <frag>  fill only the MISSING zh-tw / zh-hk leaves of one fragment from
//                                                 its zh-cn (OpenCC + scripts/i18n/drive/terms.ts), for review
//
// The merge follows scripts/i18n/browser-desktop.ts: leaf-scoped (only a fragment's owned prefixes, its parent's
// when it extends one, and its listed overwrites), never deletes a key, idempotent, temp file + rename, redone
// from a fresh read when another writer touched the file. It prints every EXISTING key whose value it changes, and
// one summary line when it wrote anything, so a second run prints nothing. Only the serial merge unit (W2.3) runs
// it without --check; every other unit edits its fragment and never messages/*.json.
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  FRAGMENTS_DIR, LOCALES, MESSAGES_DIR, flatten, flattenMessages, formatProblem, hasLocale, incompleteFragmentDirs,
  leavesOf, loadFragmentAt, loadFragments, loadMessages, unmergedLeaves, validateFragments, writablePrefixes, underPrefix,
  type Fragment, type Locale, type Tree,
} from "./drive/fragment";
import { deriveZhHk, deriveZhTw } from "./drive/terms";

interface Entry {
  key: string;
  value: string;
  /** Owned prefixes (own + parent's) and the exact overwrite paths this entry's fragment may write. */
  prefixes: string[];
  overwrites: string[];
}

export interface MergeReport {
  /** Existing keys whose value changed, with the locales they changed in. */
  changed: Array<{ key: string; locales: Locale[] }>;
  /** Keys that did not exist before, summed over the locales. */
  added: number;
  /** Locale files that were rewritten. */
  written: Locale[];
}

function setLeaf(root: Record<string, unknown>, entry: Entry): void {
  const { key, value } = entry;
  if (!entry.overwrites.includes(key) && !entry.prefixes.some((p) => underPrefix(key, p))) {
    throw new Error(`${key} is outside ${entry.prefixes.join(", ")}`);
  }
  const parts = key.split(".");
  let cur = root;
  for (const part of parts.slice(0, -1)) {
    const next = cur[part];
    if (next === undefined) cur[part] = {};
    else if (typeof next !== "object" || next === null || Array.isArray(next)) throw new Error(`${key}: "${part}" is not an object`);
    cur = cur[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (cur[leaf] !== undefined && typeof cur[leaf] !== "string") throw new Error(`${key} would overwrite an object`);
  cur[leaf] = value;
}

/** Writes `entries` into `<dir>/<locale>.json`. Returns the existing keys it changed and the count it added. */
function mergeInto(dir: string, locale: Locale, entries: Entry[]): { changed: string[]; added: number; written: boolean } {
  const file = join(dir, `${locale}.json`);
  for (let attempt = 0; attempt < 5; attempt++) {
    const mtime = statSync(file).mtimeMs;
    const original = readFileSync(file, "utf8");
    const json = JSON.parse(original) as Record<string, unknown>;
    const before = flattenMessages(json);
    for (const entry of entries) setLeaf(json, entry);
    const text = `${JSON.stringify(json, null, 2)}\n`;
    if (text === original) return { changed: [], added: 0, written: false }; // already merged: don't touch the file
    if (statSync(file).mtimeMs !== mtime) continue; // another writer: redo from a fresh read
    const changed = entries.filter((e) => before.has(e.key) && before.get(e.key) !== e.value).map((e) => e.key);
    const added = entries.filter((e) => !before.has(e.key)).length;
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
    return { changed, added, written: true };
  }
  throw new Error(`${locale}.json kept changing; rerun`);
}

/** Merges already-validated fragments into `messagesDir`. */
export function mergeFragments(frags: ReadonlyArray<Fragment>, messagesDir: string = MESSAGES_DIR): MergeReport {
  const changed = new Map<string, Locale[]>();
  let added = 0;
  const written: Locale[] = [];
  for (const locale of LOCALES) {
    const entries: Entry[] = frags.flatMap((frag) => {
      if (!hasLocale(frag, locale)) return [];
      const prefixes = writablePrefixes(frag, frags);
      return [...flatten(frag.locales[locale])].map(([key, value]) => ({ key, value, prefixes, overwrites: frag.overwrites }));
    });
    const result = mergeInto(messagesDir, locale, entries);
    for (const key of result.changed) changed.set(key, [...(changed.get(key) ?? []), locale]);
    added += result.added;
    if (result.written) written.push(locale);
  }
  return { changed: [...changed].map(([key, locales]) => ({ key, locales })), added, written };
}

// ---------------------------------------------------------------------------------------------------------------
// --derive-zh

export interface DeriveReport {
  source: string;
  /** Leaves filled in, per converted locale. */
  derived: Record<"zh-tw" | "zh-hk", string[]>;
}

function resolveFragmentPath(target: string, dir: string): string {
  if (existsSync(target)) return target;
  for (const candidate of [join(dir, target), join(dir, `${target}.json`)]) if (existsSync(candidate)) return candidate;
  throw new Error(`no fragment "${target}" (looked for a path, ${join(dir, target)}/ and ${join(dir, `${target}.json`)})`);
}

/** Adds each zh-cn leaf missing from `current` (a copy; existing leaves keep their value and order). */
function fillTree(zhcn: Map<string, string>, current: Tree, derive: (v: string) => string, filled: string[]): Tree {
  const out = structuredClone(current);
  const have = flatten(current);
  for (const [key, value] of zhcn) {
    if (have.has(key)) continue;
    const parts = key.split(".");
    let cur = out;
    for (const part of parts.slice(0, -1)) {
      const next = cur[part];
      if (next === undefined) cur[part] = {};
      else if (typeof next === "string") throw new Error(`${key}: "${part}" is already a leaf`);
      cur = cur[part] as Tree;
    }
    cur[parts[parts.length - 1]] = derive(value);
    filled.push(key);
  }
  return out;
}

function writeJson(file: string, data: unknown): void {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  if (existsSync(file) && readFileSync(file, "utf8") === text) return;
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

/** Fills the missing zh-tw / zh-hk leaves of one fragment (a name, a directory or a .json path). Never touches messages. */
export function deriveZh(target: string, dir: string = FRAGMENTS_DIR): DeriveReport {
  const path = resolveFragmentPath(target, dir);
  const frag = loadFragmentAt(path);
  if (!hasLocale(frag, "zh-cn")) throw new Error(`${frag.source}: no zh-cn to derive from`);
  const zhcn = flatten(frag.locales["zh-cn"]);
  const derived: DeriveReport["derived"] = { "zh-tw": [], "zh-hk": [] };
  const trees = {
    "zh-tw": fillTree(zhcn, hasLocale(frag, "zh-tw") ? frag.locales["zh-tw"] : {}, deriveZhTw, derived["zh-tw"]),
    "zh-hk": fillTree(zhcn, hasLocale(frag, "zh-hk") ? frag.locales["zh-hk"] : {}, deriveZhHk, derived["zh-hk"]),
  };
  const touched = (["zh-tw", "zh-hk"] as const).filter((loc) => derived[loc].length > 0);
  if (statSync(path).isDirectory()) {
    for (const loc of touched) writeJson(join(path, `${loc}.json`), trees[loc]);
  } else if (touched.length > 0) {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { locales: Record<string, unknown> };
    for (const loc of touched) raw.locales[loc] = trees[loc];
    writeJson(path, raw);
  }
  return { source: frag.source, derived };
}

// ---------------------------------------------------------------------------------------------------------------
// CLI

function main(argv: string[]): number {
  const deriveAt = argv.indexOf("--derive-zh");
  if (deriveAt >= 0) {
    const target = argv[deriveAt + 1];
    if (!target) {
      console.error("usage: bun scripts/i18n/drive.ts --derive-zh <fragment name or path>");
      return 2;
    }
    const report = deriveZh(target);
    for (const loc of ["zh-tw", "zh-hk"] as const) {
      for (const key of report.derived[loc]) console.log(`derived ${loc} ${key}`);
    }
    const total = report.derived["zh-tw"].length + report.derived["zh-hk"].length;
    console.log(total > 0 ? `${report.source}: derived ${total} leaves. Review every one by hand.` : `${report.source}: nothing missing`);
    return 0;
  }
  const unknown = argv.filter((a) => a !== "--check");
  if (unknown.length > 0) {
    console.error(`unknown argument(s): ${unknown.join(" ")}`);
    return 2;
  }

  // loadFragments skips a directory with no fragment.json; merging past one would silently drop its keys.
  const incomplete = incompleteFragmentDirs();
  if (incomplete.length > 0) {
    for (const dir of incomplete) console.error(`${dir}: not a fragment (no fragment.json); finish it or remove it`);
    console.error(`${incomplete.length} incomplete fragment director${incomplete.length === 1 ? "y" : "ies"}; nothing merged`);
    return 1;
  }
  const frags = loadFragments();
  const messages = loadMessages();
  const problems = validateFragments(frags, messages);
  if (problems.length > 0) {
    for (const p of problems) console.error(formatProblem(p));
    console.error(`${problems.length} fragment problem(s); nothing merged`);
    return 1;
  }

  if (argv.includes("--check")) {
    const unmerged = unmergedLeaves(frags, messages);
    if (unmerged.length > 0) {
      const perFragment = new Map<string, number>();
      for (const u of unmerged) perFragment.set(u.fragment, (perFragment.get(u.fragment) ?? 0) + 1);
      for (const [name, count] of perFragment) console.error(`${name}: ${count} leaves differ from messages/`);
      console.error(`${unmerged.length} fragment leaves are not in messages/ yet; the merge is bun scripts/i18n/drive.ts`);
      return 1;
    }
    const leaves = frags.reduce((n, f) => n + LOCALES.reduce((m, l) => m + leavesOf(f, l).size, 0), 0);
    console.log(`ok: ${frags.length} fragments, ${leaves} leaves, all merged`);
    return 0;
  }

  const report = mergeFragments(frags);
  for (const { key, locales } of report.changed) console.log(`changed ${key} (${locales.join(", ")})`);
  if (report.written.length > 0) console.log(`added ${report.added} leaves; wrote ${report.written.join(", ")}`);
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
