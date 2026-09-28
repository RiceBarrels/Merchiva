// Import graph over app/ components/ lib/ for the license guard: which "use client" files and module workers can
// reach a server-only package. Pure functions over a { path → source } map, so the tests can also run them on
// synthetic trees.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

export type SourceMap = ReadonlyMap<string, string>;

const SOURCE_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
/** Finder / iCloud duplicates ("x 2.ts") are junk, not sources. */
const JUNK_RE = / 2(\.|$)/;

/**
 * Every source file under `dirs` (repo-relative, "/" separators), skipping node_modules, dotfolders and junk copies.
 * `exts` picks other files instead ([".css"] for the stylesheets).
 */
export function readSources(root: string, dirs: readonly string[], exts: readonly string[] = SOURCE_EXT): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs).sort()) {
      if (entry === "node_modules" || entry.startsWith(".") || JUNK_RE.test(entry)) continue;
      const childRel = `${rel}/${entry}`;
      if (statSync(join(root, childRel)).isDirectory()) walk(childRel);
      else if (exts.some((ext) => entry.endsWith(ext)) && !entry.endsWith(".d.ts")) out.set(childRel, readFileSync(join(root, childRel), "utf8"));
    }
  };
  for (const dir of dirs) walk(dir);
  return out;
}

/** Strips comments (keeping string literals intact) so commented-out imports and directives do not count. */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (ch === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (quote !== "`" && src[i] === "\n") break;
        out += src[i];
        i++;
      }
      out += src[i] ?? "";
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** The first statement of a file, after comments: `"use client"`, `import "server-only"`, … */
export function firstStatement(src: string): string {
  return stripComments(src).trimStart().split(/;|\n/)[0]?.trim() ?? "";
}

export const isClientFile = (src: string) => /^["']use client["']$/.test(firstStatement(src));
export const startsServerOnly = (src: string) => /^import\s+["']server-only["']$/.test(firstStatement(src));
/** Module-worker entry points (`lib/sheets/xlsx/xlsx.worker.ts`): they always run in the browser. */
export const isWorkerFile = (path: string) => /\.worker\.(?:ts|tsx|js|mjs)$/.test(path);

/**
 * Value imports of a file: `import … from`, side-effect `import "x"`, `export … from`, `import()` and `require()`,
 * plus the relative `new URL("./x.worker.ts", import.meta.url)` a `new Worker(…)` bundles as its own entry.
 * `import type` / `export type` / `typeof import("x")` are skipped: they vanish at compile time.
 */
export function importSpecifiers(src: string): string[] {
  const code = stripComments(src);
  const out: string[] = [];
  const staticRe = /(?:^|[;\n}])\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*["']([^"']+)["']/g;
  for (const m of code.matchAll(staticRe)) if (!m[2]) out.push(m[4]);
  for (const m of code.matchAll(/(?:^|[;\n}])\s*import\s*["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of code.matchAll(/(?<!\btypeof\s+)\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  for (const m of code.matchAll(/\bnew\s+URL\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*,\s*import\.meta\.url\s*\)/g)) out.push(m[1]);
  return out;
}

/** "@scope/pkg/sub" → "@scope/pkg"; "pkg/sub" → "pkg". */
export function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Resolves an app import to a repo-relative source path in `files`, or null for a package / unknown path. */
export function resolveImport(files: SourceMap, from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = specifier.slice(2);
  else if (specifier.startsWith("./") || specifier.startsWith("../")) base = normalize(join(dirname(from), specifier)).replace(/\\/g, "/");
  else return null;
  const candidates = [base, ...SOURCE_EXT.map((e) => base + e), ...SOURCE_EXT.map((e) => `${base}/index${e}`)];
  return candidates.find((c) => files.has(c)) ?? null;
}

export const isPackageSpecifier = (s: string) => !s.startsWith(".") && !s.startsWith("/") && !s.startsWith("@/");

/**
 * Package specifiers a stylesheet pulls into the CSS bundle: `@import "pkg/x.css"`, `@import url(pkg)` and Tailwind's
 * `@plugin "pkg"`. Relative paths, URLs and commented-out rules are skipped.
 */
export function cssPackageImports(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  for (const m of code.matchAll(/@(?:import|plugin)\s+(?:url\(\s*["']?([^"')\s]+)["']?\s*\)|["']([^"']+)["'])/g)) {
    const spec = m[1] ?? m[2] ?? "";
    if (isPackageSpecifier(spec) && !/^[a-z][a-z0-9+.-]*:/i.test(spec)) out.push(spec);
  }
  return out;
}

/**
 * For each client entry (a "use client" file or a module-worker file), the first chain that reaches a package in
 * `roots` (["components/a.tsx", "lib/x.ts", "stripe"]). Files importing a root are found through their graph edges.
 */
export function clientChainsToRoots(files: SourceMap, roots: ReadonlySet<string>): string[][] {
  const edges = new Map<string, { files: string[]; packages: string[] }>();
  for (const [path, src] of files) {
    const specs = importSpecifiers(src);
    edges.set(path, {
      files: specs.map((s) => resolveImport(files, path, s)).filter((p): p is string => p !== null),
      packages: specs.filter(isPackageSpecifier).map(packageName),
    });
  }
  const chains: string[][] = [];
  for (const [path, src] of files) {
    if (!isClientFile(src) && !isWorkerFile(path)) continue;
    const parent = new Map<string, string | null>([[path, null]]);
    const queue = [path];
    let found: string[] | null = null;
    while (queue.length > 0 && !found) {
      const current = queue.shift() as string;
      const e = edges.get(current);
      if (!e) continue;
      const hit = e.packages.find((p) => roots.has(p));
      if (hit) {
        const chain = [hit];
        for (let at: string | null = current; at !== null; at = parent.get(at) ?? null) chain.unshift(at);
        found = chain;
        break;
      }
      for (const next of e.files) {
        if (!parent.has(next)) {
          parent.set(next, current);
          queue.push(next);
        }
      }
    }
    if (found) chains.push(found);
  }
  return chains;
}

/** Files outside app/api that import a root package directly, with the roots they import. */
export function directRootImporters(files: SourceMap, roots: ReadonlySet<string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [path, src] of files) {
    if (path.startsWith("app/api/")) continue;
    const hits = [...new Set(importSpecifiers(src).filter(isPackageSpecifier).map(packageName).filter((p) => roots.has(p)))];
    if (hits.length > 0) out.set(path, hits);
  }
  return out;
}

export function repoRelative(root: string, abs: string): string {
  return relative(root, abs).replace(/\\/g, "/");
}
