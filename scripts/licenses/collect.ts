// Builds the third-party notices from the lockfile, node_modules and the policy data. Deterministic: no
// timestamps, stable order, so the committed public/legal/* files can be compared exactly (notices-fresh.test.ts).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { NoticeEntry, NoticesFile } from "@/lib/licenses/types";
import { nodeModulesDir, readLockfile, resolveDependency, type LockPackage, type Lockfile } from "./lockfile";
import { extractCopyrights, findInstalledCopy, readJsonFile, readPackageLicense, type PackageLicense } from "./package-files";
import {
  ELECTIONS, EXCEPTIONS, EXTRA_ROOTS, LICENSE_OVERRIDES, NATIVE_OR_SERVER_PATTERNS, NESTED_LICENSE_DIRS, SERVER_ONLY_ROOTS,
  STYLE_ONLY_ROOTS, UNUSED_DEPENDENCY_EDGES,
} from "./policy";
import { evaluateLicense, needsElection, sniffLicenseText } from "./spdx";
import { templateText } from "./spdx-texts";
import { ASSETS, ATTRIBUTIONS, BUNDLES, UPSTREAM, VENDORED, type BundleSpec, type UpstreamLicense, type VendoredSpec } from "./upstream";

export { extractCopyrights, findInstalledCopy, readPackageLicense } from "./package-files";
export { renderNoticesText } from "./render";

export interface NoticeProblem {
  name: string;
  version: string;
  kind:
    | "no-license-text" | "license-not-allowed" | "needs-election" | "text-contradicts-declared" | "not-installed"
    | "bundle-version-drift" | "unused-policy-entry";
  detail: string;
}

/** True for lock entries that are platform binaries or build/server-only native packages. */
function skippedForPlatform(pkg: LockPackage): boolean {
  return pkg.meta.os !== undefined || pkg.meta.cpu !== undefined || NATIVE_OR_SERVER_PATTERNS.some((re) => re.test(pkg.name));
}

/** Workspace dependencies minus SERVER_ONLY_ROOTS, plus EXTRA_ROOTS: the roots whose whole closure ships. */
function closureRoots(lock: Lockfile): string[] {
  return [...Object.keys(lock.dependencies).filter((n) => !Object.hasOwn(SERVER_ONLY_ROOTS, n)), ...EXTRA_ROOTS];
}

/**
 * The closure roots walked over deps, optional deps and required peers, minus the UNUSED_DEPENDENCY_EDGES; plus each
 * STYLE_ONLY_ROOTS package on its own.
 */
export function distributedClosure(lock: Lockfile): Map<string, LockPackage> {
  const roots = closureRoots(lock);
  const out = new Map<string, LockPackage>();
  const seen = new Set<string>();
  const stack = roots.filter((r) => lock.packages.has(r)).reverse();
  while (stack.length > 0) {
    const key = stack.pop() as string;
    if (seen.has(key)) continue;
    seen.add(key);
    const pkg = lock.packages.get(key);
    if (!pkg || skippedForPlatform(pkg)) continue;
    out.set(key, pkg);
    const optionalPeers = new Set(pkg.meta.optionalPeers ?? []);
    const unused = UNUSED_DEPENDENCY_EDGES[pkg.name] ?? {};
    const deps = [
      ...Object.keys(pkg.meta.dependencies ?? {}),
      ...Object.keys(pkg.meta.optionalDependencies ?? {}),
      ...Object.keys(pkg.meta.peerDependencies ?? {}).filter((d) => !optionalPeers.has(d)),
    ].filter((d) => !Object.hasOwn(unused, d));
    for (const dep of deps) {
      const resolved = resolveDependency(lock, key, dep);
      if (resolved && !seen.has(resolved)) stack.push(resolved);
    }
  }
  // A style-only root ships one stylesheet and none of its dependencies.
  for (const name of Object.keys(STYLE_ONLY_ROOTS)) {
    const pkg = lock.packages.get(name);
    if (pkg && !out.has(name)) out.set(name, pkg);
  }
  return out;
}

/** Package names a bundle inlines, read from the `node_modules/<name>` segments of its source map. */
export function inlinedFromSourceMap(root: string, bundle: BundleSpec): string[] {
  if (!bundle.map) return [];
  const map = readJsonFile(join(root, "node_modules", bundle.host, bundle.map));
  const sources = Array.isArray(map.sources) ? map.sources.filter((s): s is string => typeof s === "string") : [];
  const names = new Set<string>();
  for (const source of sources) {
    const at = source.lastIndexOf("node_modules/");
    if (at < 0) continue;
    const parts = source.slice(at + "node_modules/".length).split("/");
    const name = parts[0].startsWith("@") ? `${parts[0]}/${parts[1] ?? ""}` : parts[0];
    if (name && name !== bundle.host && !name.startsWith(".")) names.add(name);
  }
  return [...names].sort();
}

interface Ctx {
  root: string;
  problems: NoticeProblem[];
  texts: Map<string, string>;
  used: Set<string>;
}

function addText(ctx: Ctx, text: string): string {
  const norm = text.replace(/\r\n?/g, "\n").trim();
  const id = createHash("sha256").update(norm).digest("hex").slice(0, 16);
  ctx.texts.set(id, norm);
  return id;
}

function upstreamFor(ctx: Ctx, name: string, version: string): [string, UpstreamLicense] | null {
  for (const key of version ? [`${name}@${version}`, name] : [name]) {
    const hit = UPSTREAM[key];
    if (hit) return [key, hit];
  }
  return null;
}

function attributions(name: string): string[] {
  return Object.entries(ATTRIBUTIONS).flatMap(([pattern, lines]) =>
    pattern === name || (pattern.endsWith("/*") && name.startsWith(pattern.slice(0, -1))) ? lines : [],
  );
}

const unique = (lines: string[]) => [...new Set(lines)];
const SNIFF_TOKEN: Record<string, RegExp> = { BUSL: /BUSL/i, AGPL: /AGPL/i, LGPL: /LGPL/i, GPL: /GPL/i };

/** One notice entry from installed license data, falling back to UPSTREAM for a missing license or text. */
function describe(
  ctx: Ctx,
  base: Pick<NoticeEntry, "name" | "version" | "source" | "via">,
  lookupVersion: string,
  pl: PackageLicense,
): NoticeEntry {
  const { name } = base;
  const problem = (kind: NoticeProblem["kind"], detail: string) => ctx.problems.push({ name, version: lookupVersion, kind, detail });
  const upstream = upstreamFor(ctx, name, lookupVersion);
  const override = LICENSE_OVERRIDES[name];
  if (override) ctx.used.add(`LICENSE_OVERRIDES:${name}`);
  const license = override?.license ?? (pl.declared || upstream?.[1].license || "");
  let upstreamUsed = !override && pl.declared === "" && upstream !== null;

  const licenseTexts = pl.licenseFiles.map((f) => f.text);
  const vendored = pl.vendoredLicenseFiles ?? [];
  const copyright = [...pl.licenseFiles, ...vendored, ...pl.noticeFiles].flatMap((f) => extractCopyrights(f.text));
  if (licenseTexts.length === 0) {
    if (upstream) {
      upstreamUsed = true;
      const [, up] = upstream;
      const text = up.text === undefined || up.text === "template" ? templateText(ctx.root, up.license, up.copyright) : up.text;
      if (text === null) problem("no-license-text", `no template for "${up.license}"; give UPSTREAM["${upstream[0]}"] a literal text`);
      else {
        licenseTexts.push(text);
        if (up.text !== undefined && up.text !== "template") copyright.push(...extractCopyrights(up.text));
      }
    } else {
      problem("no-license-text", "no license file in the package and no UPSTREAM entry");
    }
  }
  if (upstreamUsed && upstream) {
    ctx.used.add(`UPSTREAM:${upstream[0]}`);
    copyright.push(...upstream[1].copyright);
  }
  copyright.push(...attributions(name));

  const election = ELECTIONS[name];
  const exception = EXCEPTIONS[name];
  for (const text of pl.licenseFiles.map((f) => f.text)) {
    const sniffed = sniffLicenseText(text);
    if (sniffed && !override && !election && !SNIFF_TOKEN[sniffed].test(license)) {
      problem("text-contradicts-declared", `declares "${license}" but a license file is ${sniffed} text; add a LICENSE_OVERRIDES entry`);
    }
  }

  let elected: string | undefined;
  if (exception && exception.license === license) {
    ctx.used.add(`EXCEPTIONS:${name}`);
  } else {
    const verdict = evaluateLicense(name, license);
    if (verdict.ok) elected = verdict.elected;
    else problem(needsElection(verdict.reason) ? "needs-election" : "license-not-allowed", verdict.reason);
  }
  if (elected !== undefined && election) ctx.used.add(`ELECTIONS:${name}`);

  const notes = [
    elected !== undefined ? election?.note : undefined,
    override?.reason,
    // The sign-off (approvedBy) is internal policy data and stays out of the published notices.
    exception && exception.license === license ? `Exception: ${exception.reason}` : undefined,
    upstreamUsed ? upstream?.[1].note : undefined,
  ].filter((n): n is string => typeof n === "string" && n.length > 0);

  const entry: NoticeEntry = {
    ...base,
    license,
    copyright: unique(copyright),
    textIds: unique([...licenseTexts, ...vendored.map((f) => f.text), ...pl.noticeFiles.map((f) => f.text)].map((t) => addText(ctx, t))),
  };
  if (elected !== undefined) entry.elected = elected;
  if (pl.repository) entry.repository = pl.repository;
  if (notes.length > 0) entry.note = notes.join(" ");
  return entry;
}

const NO_FILES: PackageLicense = { declared: "", licenseFiles: [], noticeFiles: [] };

function templated(
  ctx: Ctx,
  base: Pick<NoticeEntry, "name" | "version" | "source" | "via">,
  license: string,
  copyright: string[],
  repository?: string,
  note?: string,
): NoticeEntry {
  const text = templateText(ctx.root, license, copyright);
  if (text === null) ctx.problems.push({ name: base.name, version: base.version, kind: "no-license-text", detail: `no template for "${license}"` });
  const exception = EXCEPTIONS[base.name];
  const excepted = exception !== undefined && exception.license === license;
  if (excepted) ctx.used.add(`EXCEPTIONS:${base.name}`);
  else {
    const verdict = evaluateLicense(base.name, license);
    if (!verdict.ok) ctx.problems.push({ name: base.name, version: base.version, kind: "license-not-allowed", detail: verdict.reason });
  }
  const entry: NoticeEntry = { ...base, license, copyright: unique(copyright), textIds: text === null ? [] : [addText(ctx, text)] };
  if (repository) entry.repository = repository;
  // Like describe(): the sign-off (approvedBy) stays out of the published notices.
  const notes = [note, excepted ? `Exception: ${exception.reason}` : undefined].filter((n): n is string => typeof n === "string" && n.length > 0);
  if (notes.length > 0) entry.note = notes.join(" ");
  return entry;
}

function bundleEntries(ctx: Ctx, bundle: BundleSpec): NoticeEntry[] {
  const hostDir = join(ctx.root, "node_modules", bundle.host);
  const version = existsSync(join(hostDir, "package.json")) ? String(readJsonFile(join(hostDir, "package.json")).version ?? "") : "";
  const via = `${bundle.host}@${bundle.version}`;
  const problem = (kind: NoticeProblem["kind"], detail: string) => ctx.problems.push({ name: bundle.host, version, kind, detail });
  if (version === "") {
    problem("not-installed", "bundle host is not installed");
    return [];
  }
  if (version !== bundle.version) problem("bundle-version-drift", `BUNDLES pins ${bundle.version}, installed ${version}: re-check what it inlines`);
  if (!existsSync(join(hostDir, bundle.file))) problem("not-installed", `bundle file ${bundle.file} is missing`);
  if (bundle.map && !existsSync(join(hostDir, bundle.map))) {
    problem("not-installed", `source map ${bundle.map} is missing`);
    return [];
  }

  const out: NoticeEntry[] = [];
  for (const name of inlinedFromSourceMap(ctx.root, bundle)) {
    const copy = findInstalledCopy(ctx.root, name);
    const copyVersion = copy ? String(readJsonFile(join(copy, "package.json")).version ?? "") : "";
    out.push(describe(ctx, { name, version: "", source: "inlined", via }, copyVersion, copy ? readPackageLicense(copy) : NO_FILES));
  }
  for (const extra of bundle.extra ?? []) {
    out.push(templated(ctx, { name: extra.name, version: "", source: "inlined", via }, extra.license, extra.copyright, extra.repository, extra.note));
  }
  return out;
}

function vendoredEntries(ctx: Ctx, spec: VendoredSpec): NoticeEntry[] {
  const hostDir = join(ctx.root, "node_modules", spec.host);
  const version = String(readJsonFile(join(hostDir, "package.json")).version ?? "");
  const out: NoticeEntry[] = [];
  for (const pkg of spec.packages) {
    const dir = join(hostDir, spec.dir, pkg);
    if (!existsSync(join(dir, "package.json"))) {
      ctx.problems.push({ name: pkg, version: "", kind: "not-installed", detail: `${spec.host}/${spec.dir}/${pkg} is missing (did a ${spec.host} upgrade rename it?)` });
      continue;
    }
    const declaredName = String(readJsonFile(join(dir, "package.json")).name ?? pkg).replace(/-builtin$/, "");
    out.push(describe(ctx, { name: declaredName, version: "", source: "vendored", via: `${spec.host}@${version}` }, "", readPackageLicense(dir)));
  }
  return out;
}

/**
 * Notice entries for the packages VENDORED under next/dist/compiled. Standalone form of what collectNotices does:
 * the entries' textIds point into collectNotices' `texts`, and problems are dropped here.
 */
export function vendoredNotices(root: string, spec: VendoredSpec): NoticeEntry[] {
  return vendoredEntries({ root, problems: [], texts: new Map(), used: new Set() }, spec);
}

interface ManifestEntry { name: string; version?: string; license: string; copyright: string[]; licenseFile?: string }

function findManifests(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) findManifests(path, out);
    else if (entry === "THIRD_PARTY.json") out.push(path);
  }
  return out;
}

function assetEntries(ctx: Ctx): NoticeEntry[] {
  const out = ASSETS.map((a) => templated(ctx, { name: a.name, version: "", source: "asset", via: a.via }, a.license, a.copyright));
  for (const manifest of [...findManifests(join(ctx.root, "public")), ...findManifests(join(ctx.root, "lib"))]) {
    const via = relative(ctx.root, manifest);
    const json: unknown = JSON.parse(readFileSync(manifest, "utf8"));
    for (const item of (Array.isArray(json) ? json : [json]) as ManifestEntry[]) {
      const base = { name: String(item.name), version: String(item.version ?? ""), source: "asset" as const, via };
      if (item.licenseFile) {
        const file = join(manifest, "..", item.licenseFile);
        const pl: PackageLicense = { declared: item.license, licenseFiles: existsSync(file) ? [{ file: item.licenseFile, text: readFileSync(file, "utf8") }] : [], noticeFiles: [] };
        const entry = describe(ctx, base, base.version, pl);
        entry.copyright = unique([...entry.copyright, ...(item.copyright ?? [])]);
        out.push(entry);
      } else out.push(templated(ctx, base, item.license, item.copyright ?? []));
    }
  }
  return out;
}

function sortKey(e: NoticeEntry): string {
  return [e.name, e.version, e.source, e.via ?? ""].join("\u0000");
}

/** The whole notices file plus every policy problem. */
export function collectNotices(root: string): { file: NoticesFile; problems: NoticeProblem[] } {
  const ctx: Ctx = { root, problems: [], texts: new Map(), used: new Set() };
  const lock = readLockfile(root);
  for (const r of [...closureRoots(lock), ...Object.keys(STYLE_ONLY_ROOTS)]) {
    if (!lock.packages.has(r)) ctx.problems.push({ name: r, version: "", kind: "not-installed", detail: "root is not in bun.lock: run bun install" });
  }

  const entries: NoticeEntry[] = [];
  const seenNpm = new Set<string>();
  const closure = [...distributedClosure(lock).values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const [host, deps] of Object.entries(UNUSED_DEPENDENCY_EDGES)) {
    for (const dep of Object.keys(deps)) {
      if (!closure.some((p) => p.name === host && Object.hasOwn(p.meta.dependencies ?? {}, dep))) {
        ctx.problems.push({ name: host, version: "", kind: "unused-policy-entry", detail: `UNUSED_DEPENDENCY_EDGES: no distributed ${host} declares ${dep}` });
      }
    }
  }
  for (const pkg of closure) {
    const id = `${pkg.name}@${pkg.version}`;
    if (seenNpm.has(id)) continue;
    seenNpm.add(id);
    const dir = nodeModulesDir(root, pkg.key);
    if (!existsSync(join(dir, "package.json"))) {
      ctx.problems.push({ name: pkg.name, version: pkg.version, kind: "not-installed", detail: `${relative(root, dir)} is missing: run bun install` });
      continue;
    }
    const nested = NESTED_LICENSE_DIRS[pkg.name];
    if (nested) ctx.used.add(`NESTED_LICENSE_DIRS:${pkg.name}`);
    entries.push(describe(ctx, { name: pkg.name, version: pkg.version, source: "npm" }, pkg.version, readPackageLicense(dir, nested)));
  }
  for (const bundle of BUNDLES) entries.push(...bundleEntries(ctx, bundle));
  entries.push(...vendoredEntries(ctx, VENDORED), ...assetEntries(ctx));

  const seenNames = new Set(entries.map((e) => e.name));
  const policyTables: Array<[string, Record<string, unknown>]> = [
    ["UPSTREAM", UPSTREAM], ["ELECTIONS", ELECTIONS], ["LICENSE_OVERRIDES", LICENSE_OVERRIDES],
    ["EXCEPTIONS", EXCEPTIONS], ["NESTED_LICENSE_DIRS", NESTED_LICENSE_DIRS],
  ];
  for (const [table, record] of policyTables) {
    for (const key of Object.keys(record)) {
      if (!ctx.used.has(`${table}:${key}`)) {
        ctx.problems.push({ name: key, version: "", kind: "unused-policy-entry", detail: `${table}["${key}"] is not used by any distributed package: remove it` });
      }
    }
  }
  for (const pattern of Object.keys(ATTRIBUTIONS)) {
    if (!attributionUsed(pattern, seenNames)) {
      ctx.problems.push({ name: pattern, version: "", kind: "unused-policy-entry", detail: `ATTRIBUTIONS["${pattern}"] matches no distributed package` });
    }
  }

  entries.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
  const texts: Record<string, string> = {};
  for (const id of [...ctx.texts.keys()].sort()) texts[id] = ctx.texts.get(id) as string;
  return { file: { schemaVersion: 1, packageCount: entries.length, texts, packages: entries }, problems: ctx.problems };
}

function attributionUsed(pattern: string, names: Set<string>): boolean {
  if (!pattern.endsWith("/*")) return names.has(pattern);
  const prefix = pattern.slice(0, -1);
  return [...names].some((n) => n.startsWith(prefix));
}
