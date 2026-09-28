// bun.lock reader for the license tooling. bun.lock is JSONC: `packages[key] = ["name@version", registry, meta,
// integrity]`, where a nested key looks like "parent/child" (a scoped name counts as one segment) and names the copy
// installed at node_modules/parent/node_modules/child.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface LockMeta {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalPeers?: string[];
  os?: string | string[];
  cpu?: string | string[];
}

export interface LockPackage {
  key: string;
  name: string;
  version: string;
  meta: LockMeta;
}

export interface Lockfile {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  overrides: Record<string, string>;
  packages: Map<string, LockPackage>;
}

type JsoncParser = { JSONC?: { parse(text: string): unknown } };

/** Strict fallback for a runtime without Bun.JSONC: drop trailing commas outside strings, then JSON.parse. */
function stripTrailingCommas(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += text[i + 1] ?? "";
        i++;
      } else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") continue;
    }
    out += ch;
  }
  return out;
}

export function parseJsonc(text: string): unknown {
  const bun = (globalThis as { Bun?: JsoncParser }).Bun;
  if (bun?.JSONC) return bun.JSONC.parse(text);
  return JSON.parse(stripTrailingCommas(text));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringRecord(v: unknown): Record<string, string> {
  if (!isObject(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, s] of Object.entries(v)) if (typeof s === "string") out[k] = s;
  return out;
}

/** "name@version" → [name, version], split at the LAST "@" so scoped names and aliases parse correctly. */
export function splitNameVersion(id: string): [string, string] {
  const at = id.lastIndexOf("@");
  if (at <= 0) return [id, ""];
  return [id.slice(0, at), id.slice(at + 1)];
}

function readMeta(v: unknown): LockMeta {
  if (!isObject(v)) return {};
  const meta: LockMeta = {};
  if (isObject(v.dependencies)) meta.dependencies = stringRecord(v.dependencies);
  if (isObject(v.optionalDependencies)) meta.optionalDependencies = stringRecord(v.optionalDependencies);
  if (isObject(v.peerDependencies)) meta.peerDependencies = stringRecord(v.peerDependencies);
  if (Array.isArray(v.optionalPeers)) meta.optionalPeers = v.optionalPeers.filter((s): s is string => typeof s === "string");
  if (typeof v.os === "string" || Array.isArray(v.os)) meta.os = v.os as string | string[];
  if (typeof v.cpu === "string" || Array.isArray(v.cpu)) meta.cpu = v.cpu as string | string[];
  return meta;
}

/** Parses `<root>/bun.lock`. The name of each package comes from its value ("name@version"), not from its key. */
export function readLockfile(root: string): Lockfile {
  const json = parseJsonc(readFileSync(join(root, "bun.lock"), "utf8"));
  if (!isObject(json) || !isObject(json.packages) || !isObject(json.workspaces)) throw new Error("bun.lock: unexpected shape");
  const ws = json.workspaces[""];
  const workspace = isObject(ws) ? ws : {};
  const packages = new Map<string, LockPackage>();
  for (const [key, value] of Object.entries(json.packages)) {
    if (!Array.isArray(value) || typeof value[0] !== "string") continue;
    const [name, version] = splitNameVersion(value[0]);
    packages.set(key, { key, name, version, meta: readMeta(value[2]) });
  }
  return {
    dependencies: stringRecord(workspace.dependencies),
    devDependencies: stringRecord(workspace.devDependencies),
    overrides: stringRecord(json.overrides),
    packages,
  };
}

/** "a/@s/b/c" → ["a", "@s/b", "c"]. */
export function lockKeySegments(key: string): string[] {
  const parts = key.split("/");
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith("@") && i + 1 < parts.length) {
      out.push(`${parts[i]}/${parts[i + 1]}`);
      i++;
    } else out.push(parts[i]);
  }
  return out;
}

/**
 * Resolves `dep` as required from the package at `parentKey`, the way bun lays node_modules out: the nearest
 * nested copy ("<parent>/<dep>", then one segment up at a time), else the hoisted "<dep>". Null when absent.
 */
export function resolveDependency(lock: Lockfile, parentKey: string, dep: string): string | null {
  const segs = lockKeySegments(parentKey);
  while (segs.length > 0) {
    const key = `${segs.join("/")}/${dep}`;
    if (lock.packages.has(key)) return key;
    segs.pop();
  }
  return lock.packages.has(dep) ? dep : null;
}

/** The install directory of a lock key: "a/@s/b" → <root>/node_modules/a/node_modules/@s/b. */
export function nodeModulesDir(root: string, key: string): string {
  const segs = lockKeySegments(key);
  return join(root, "node_modules", ...segs.flatMap((s, i) => (i === 0 ? [s] : ["node_modules", s])));
}
