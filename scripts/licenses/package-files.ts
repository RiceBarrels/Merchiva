// Reading license data from an installed package directory: declared license, license / NOTICE files, copyright
// lines, repository URL, and the search for an installed copy of an inlined package.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Top-level license files. Wider than `[.-]` so LICENSE_MIT / LICENSE_APACHE-2.0 (@tauri-apps/api) count. */
export const LICENSE_FILE_RE = /^(licen[cs]e|copying|unlicense)([._-].*)?$/i;
/** NOTICE files, plus third-party license bundles a package ships next to its own license (@tiptap/pm). */
export const NOTICE_FILE_RE = /^(notice|third[-_]party[-_](licen[cs]es|notices))([._-].*)?$/i;

export interface PackageLicense {
  declared: string;
  licenseFiles: Array<{ file: string; text: string }>;
  noticeFiles: Array<{ file: string; text: string }>;
  /** License files of libraries the package vendors in a sub-folder (NESTED_LICENSE_DIRS); never its own license. */
  vendoredLicenseFiles?: Array<{ file: string; text: string }>;
  repository?: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function readJsonFile(file: string): Record<string, unknown> {
  const json: unknown = JSON.parse(readFileSync(file, "utf8"));
  return isObject(json) ? json : {};
}

/** The declared license: `license` (string or `{ type }`), else the legacy `licenses` array joined with OR. */
export function declaredLicense(pkg: Record<string, unknown>): string {
  const l = pkg.license;
  if (typeof l === "string") return l.trim();
  if (isObject(l) && typeof l.type === "string") return l.type.trim();
  if (Array.isArray(pkg.licenses)) {
    const ids = pkg.licenses.map((x) => (typeof x === "string" ? x : isObject(x) && typeof x.type === "string" ? x.type : "")).filter(Boolean);
    if (ids.length > 1) return `(${ids.join(" OR ")})`;
    return ids[0] ?? "";
  }
  return "";
}

/** "git+https://github.com/a/b.git", "git@github.com:a/b", "github:a/b", "a/b" → "https://github.com/a/b". */
export function normalizeRepository(repo: unknown): string | undefined {
  const raw = typeof repo === "string" ? repo : isObject(repo) && typeof repo.url === "string" ? repo.url : "";
  let url = raw.trim();
  if (url === "") return undefined;
  const shorthand = /^(github|gitlab|bitbucket):([\w.-]+\/[\w.-]+)$/.exec(url);
  if (shorthand) url = `https://${shorthand[1] === "github" ? "github.com" : shorthand[1] === "gitlab" ? "gitlab.com" : "bitbucket.org"}/${shorthand[2]}`;
  else if (/^[\w.-]+\/[\w.-]+$/.test(url)) url = `https://github.com/${url}`;
  url = url
    .replace(/^git\+/, "")
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/^(git|ssh|http):\/\//, "https://")
    .replace(/^https:\/\/git@/, "https://")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  return /^https:\/\/[^\s]+$/.test(url) ? url : undefined;
}

function readTopLevel(dir: string, re: RegExp): Array<{ file: string; text: string }> {
  return readdirSync(dir)
    .filter((n) => re.test(n) && statSync(join(dir, n)).isFile())
    .sort()
    .map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") }));
}

/** License data of the package installed at `dir`; `nestedDir` adds `<dir>/<nestedDir>/<x>/LICENSE*` files. */
export function readPackageLicense(dir: string, nestedDir?: string): PackageLicense {
  const pkg = readJsonFile(join(dir, "package.json"));
  const vendoredLicenseFiles: Array<{ file: string; text: string }> = [];
  if (nestedDir && existsSync(join(dir, nestedDir))) {
    for (const sub of readdirSync(join(dir, nestedDir)).sort()) {
      const subDir = join(dir, nestedDir, sub);
      if (!statSync(subDir).isDirectory()) continue;
      for (const f of readTopLevel(subDir, LICENSE_FILE_RE)) vendoredLicenseFiles.push({ file: `${nestedDir}/${sub}/${f.file}`, text: f.text });
    }
  }
  const out: PackageLicense = {
    declared: declaredLicense(pkg),
    licenseFiles: readTopLevel(dir, LICENSE_FILE_RE),
    noticeFiles: readTopLevel(dir, NOTICE_FILE_RE),
  };
  if (vendoredLicenseFiles.length > 0) out.vendoredLicenseFiles = vendoredLicenseFiles;
  const repository = normalizeRepository(pkg.repository);
  if (repository) out.repository = repository;
  return out;
}

const COPYRIGHT_LINE_RE = /^(copyright\b|\(c\)|©)/i;
/** License prose that merely mentions copyright ("copyright notice", "Copyright holders", "copyright treaty", …). */
const COPYRIGHT_PROSE_RE = /^copyright\s+(notices?|owners?|holders?|licen[cs]es?|statements?|and|or|laws?|protection|infringement|treaty|permission|to|in|of|on|for|is|the|disclaimer)\b/i;
/** Lower-case "copyright …" not followed by a (c) / © / year is running text of a license. */
const LOWERCASE_PROSE_RE = /^copyright(?!\s*(\(c\)|©|\d))/;
/** Enumerated clauses of the Apache / MPL texts: "(c) You must retain …", "(c) under Patent Claims …". */
const CLAUSE_RE = /^\(c\)\s+(You|If|[a-z])/;
/** Template placeholders, and the copyright of a license document itself (GPL / AGPL / LGPL texts). */
const NOT_A_HOLDER_RE = /[[{]yyyy[\]}]|[[{]name of copyright owner[\]}]|<year>|<name of author>|Free Software Foundation/i;

/** Copyright lines of a license text: trimmed, comment markers removed, HTML entities decoded, de-duplicated. */
export function extractCopyrights(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const body = raw.replace(/^[\s*#/>-]+/, "");
    if (!COPYRIGHT_LINE_RE.test(body) || COPYRIGHT_PROSE_RE.test(body) || LOWERCASE_PROSE_RE.test(body)) continue;
    if (CLAUSE_RE.test(body) || NOT_A_HOLDER_RE.test(body)) continue;
    const line = body
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .trim();
    // A bare "Copyright" heading names no holder (the holder is on the next line of the reproduced text).
    if (line.length > 0 && !/^(copyright|\(c\)|©)$/i.test(line) && !out.includes(line)) out.push(line);
  }
  return out;
}

const SKIP_SEGMENT_RE = /\/(test|tests|fixtures|__fixtures__)\//;

/** True for a path inside a test / fixture folder, judged below `root` only (the checkout may live under /test/). */
export function inSkippedFolder(root: string, path: string): boolean {
  return SKIP_SEGMENT_RE.test(`/${relative(root, path).replace(/\\/g, "/")}/`);
}
const copyIndexes = new Map<string, Map<string, string>>();

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

/** Every installed package by name, breadth-first so the hoisted copy wins; test / fixture folders skipped. */
function installedCopies(root: string): Map<string, string> {
  const cached = copyIndexes.get(root);
  if (cached) return cached;
  const index = new Map<string, string>();
  const queue = [join(root, "node_modules")];
  while (queue.length > 0) {
    const nm = queue.shift() as string;
    if (inSkippedFolder(root, nm)) continue;
    for (const entry of safeList(nm)) {
      if (entry.startsWith(".")) continue;
      const names = entry.startsWith("@") ? safeList(join(nm, entry)).map((s) => `${entry}/${s}`) : [entry];
      for (const name of names) {
        const dir = join(nm, name);
        if (!index.has(name) && existsSync(join(dir, "package.json"))) {
          try {
            if (readJsonFile(join(dir, "package.json")).name === name) index.set(name, dir);
          } catch {
            // an unreadable package.json is not a copy
          }
        }
        if (existsSync(join(dir, "node_modules"))) queue.push(join(dir, "node_modules"));
      }
    }
  }
  copyIndexes.set(root, index);
  return index;
}

/**
 * A real installed copy of `name`: a `…/node_modules/<name>` directory whose package.json `name` equals `name`,
 * outside any test / fixture folder (node_modules/resolve/test/…/node_modules/util is not the util package).
 */
export function findInstalledCopy(root: string, name: string): string | null {
  return installedCopies(root).get(name) ?? null;
}
