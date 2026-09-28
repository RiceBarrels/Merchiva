// Univer's @univerjs/engine-render lazy-loads TeX hyphenation patterns (the `hyphen` package's port of hyph-utf8)
// through its PATTERN_LOADERS table: one dynamic import per language. Several of those files are licensed MPL-1.1 /
// GPL-2.0 / LGPL-2.1 (hu) or LPPL only (ru, th), whatever the Apache header Univer stamps on them says. Merchiva never
// turns on auto-hyphenation, so next.config.ts aliases every file the table imports to an empty pattern
// (lib/licenses/empty-hyphenation-patterns.ts) and none of that data reaches a bundle. American English is inlined
// in engine-render's index.js and does ship; it is listed in the notices (upstream.ts BUNDLES).
// Imported by next.config.ts, so it uses node: modules only (no Bun APIs, no "@/" paths).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ENGINE_RENDER_DIR = "node_modules/@univerjs/engine-render";
/** The engine-render builds a bundler can pick: "import" → lib/es, "require" → lib/cjs. */
export const ENGINE_RENDER_BUILDS = ["lib/es/index.js", "lib/cjs/index.js"] as const;
/** The stand-in every pattern file resolves to, relative to the project root (a turbopack.resolveAlias value). */
export const EMPTY_PATTERNS_MODULE = "./lib/licenses/empty-hyphenation-patterns.ts";
/** Languages whose patterns engine-render inlines in index.js instead of loading a file. */
export const INLINED_PATTERN_LANGUAGES = ["en-us"] as const;

export interface PatternLoader {
  /** Language tag, as engine-render keys it ("de-1901"). */
  lang: string;
  /** "./<lang>-<hash>.js" for a lazily imported file; null when the loader returns data inlined in index.js. */
  target: string | null;
}

const TABLE_START = "const PATTERN_LOADERS = {";
const ENTRY_RE = /^\s*\["([a-z0-9-]+)"\]:\s*(.+?),?$/;
const FILE_TARGET_RE = /^\(\)\s*=>\s*(?:import\(|Promise\.resolve\(\)\.then\(\(\)\s*=>\s*require\()"(\.\/[^"]+)"\)\)?$/;
const INLINE_TARGET_RE = /^\(\)\s*=>\s*Promise\.resolve\(\)\.then\(\(\)\s*=>\s*[A-Za-z_$][\w$]*\)$/;

/** Every entry of PATTERN_LOADERS in one engine-render build. Throws when the table or an entry has a new shape. */
export function patternLoaders(source: string): PatternLoader[] {
  const start = source.indexOf(TABLE_START);
  if (start < 0) throw new Error("engine-render: PATTERN_LOADERS not found (did a Univer upgrade move it?)");
  const end = source.indexOf("\n};", start);
  if (end < 0) throw new Error("engine-render: PATTERN_LOADERS has no end");
  const out: PatternLoader[] = [];
  for (const line of source.slice(start + TABLE_START.length, end).split("\n")) {
    if (line.trim() === "") continue;
    const entry = ENTRY_RE.exec(line);
    if (!entry) throw new Error(`engine-render: unexpected PATTERN_LOADERS line: ${line.trim()}`);
    const [, lang, loader] = entry;
    const file = FILE_TARGET_RE.exec(loader);
    if (file) out.push({ lang, target: file[1] });
    else if (INLINE_TARGET_RE.test(loader)) out.push({ lang, target: null });
    else throw new Error(`engine-render: unexpected loader for "${lang}": ${loader}`);
  }
  if (out.length === 0) throw new Error("engine-render: PATTERN_LOADERS is empty");
  return out;
}

/** The loaders of every engine-render build, keyed by build path. */
export function installedPatternLoaders(root: string): Map<string, PatternLoader[]> {
  const out = new Map<string, PatternLoader[]>();
  for (const build of ENGINE_RENDER_BUILDS) {
    out.set(build, patternLoaders(readFileSync(join(root, ENGINE_RENDER_DIR, build), "utf8")));
  }
  return out;
}

/** turbopack.resolveAlias entries sending every lazily loaded pattern file of every build to the empty stand-in. */
export function hyphenationPatternAliases(root: string): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const loaders of installedPatternLoaders(root).values()) {
    for (const { target } of loaders) if (target !== null) aliases[target] = EMPTY_PATTERNS_MODULE;
  }
  return aliases;
}

/** The export name engine-render reads from a loaded pattern module (its snackToPascal: "de-1901" → "De1901"). */
export function patternExportName(lang: string): string {
  return lang
    .split("-")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}
