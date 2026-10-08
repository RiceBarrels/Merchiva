import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readLockfile } from "../../licenses/lockfile";
import { MIN_VERSIONS, PINNED_OVERRIDES, PINNED_VERSIONS, SURVEYJS_LOCKSTEP, UNIVER_LOCKSTEP } from "../../licenses/policy";

/*
 * Office dependencies stay pinned exactly (integration-legal §3): a caret would let a Univer minor, an unreviewed
 * pptxtojson or an ExcelJS rebuild in without a license review. pptxtojson ≤ 0.1.2 was GPL-3.0 / AGPL-3.0.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};
const lock = readLockfile(ROOT);
const declared = { ...pkg.devDependencies, ...pkg.dependencies };
const EXACT = /^\d+\.\d+\.\d+$/;

describe("pinned versions", () => {
  test("every PINNED_VERSIONS entry is exact in package.json and resolved to it in bun.lock", () => {
    const wrong: string[] = [];
    for (const [name, pin] of Object.entries(PINNED_VERSIONS)) {
      const spec = declared[name];
      if (spec === undefined || !EXACT.test(spec) || spec !== pin) wrong.push(`package.json ${name}: ${spec ?? "missing"} (want exactly ${pin})`);
      const resolved = lock.packages.get(name);
      if (!resolved || `${resolved.name}@${resolved.version}` !== `${name}@${pin}`) {
        wrong.push(`bun.lock ${name}: ${resolved ? `${resolved.name}@${resolved.version}` : "missing"} (want ${name}@${pin})`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test("the pin list covers every direct @univerjs dependency", () => {
    const direct = Object.keys(pkg.dependencies ?? {}).filter((n) => n.startsWith(UNIVER_LOCKSTEP.scope));
    expect(direct.length).toBeGreaterThan(0);
    expect(direct.filter((n) => !Object.hasOwn(PINNED_VERSIONS, n))).toEqual([]);
  });

  test(`every lock package in ${UNIVER_LOCKSTEP.scope}* moves in lockstep at ${UNIVER_LOCKSTEP.version}`, () => {
    const except = new Set<string>(UNIVER_LOCKSTEP.except);
    const off = [...lock.packages.values()]
      .filter((p) => p.name.startsWith(UNIVER_LOCKSTEP.scope) && !except.has(p.name) && p.version !== UNIVER_LOCKSTEP.version)
      .map((p) => `${p.key} = ${p.name}@${p.version}`);
    expect(off).toEqual([]);
  });

  test(`${SURVEYJS_LOCKSTEP.packages.join(" and ")} are pinned and resolved in lockstep at ${SURVEYJS_LOCKSTEP.version}`, () => {
    const off: string[] = [];
    for (const name of SURVEYJS_LOCKSTEP.packages) {
      if (PINNED_VERSIONS[name] !== SURVEYJS_LOCKSTEP.version) off.push(`PINNED_VERSIONS ${name}: ${PINNED_VERSIONS[name] ?? "missing"}`);
      const copies = [...lock.packages.values()].filter((p) => p.name === name);
      if (copies.length === 0) off.push(`bun.lock ${name}: missing`);
      for (const p of copies) if (p.version !== SURVEYJS_LOCKSTEP.version) off.push(`${p.key} = ${p.name}@${p.version}`);
    }
    expect(off).toEqual([]);
  });

  test("package.json keeps the https and unzipper overrides, and the lock resolves them exactly", () => {
    for (const [name, version] of Object.entries(PINNED_OVERRIDES)) {
      expect(pkg.overrides?.[name]).toBe(version);
      expect(lock.overrides[name]).toBe(version);
      const everyCopy = [...lock.packages.values()].filter((p) => p.name === name);
      expect(everyCopy.length).toBeGreaterThan(0);
      expect(everyCopy.map((p) => p.version)).toEqual(everyCopy.map(() => version));
    }
  });

  test("MIN_VERSIONS floors hold for every lock entry, nested copies included", () => {
    const low: string[] = [];
    for (const [name, range] of Object.entries(MIN_VERSIONS)) {
      const copies = [...lock.packages.values()].filter((p) => p.name === name);
      expect(copies.length).toBeGreaterThan(0);
      for (const p of copies) if (!Bun.semver.satisfies(p.version, range)) low.push(`${p.key} = ${p.version} (need ${range})`);
    }
    expect(low).toEqual([]);
  });

  test("the floor would reject the GPL-era pptxtojson releases", () => {
    expect(Bun.semver.satisfies("0.1.2", MIN_VERSIONS.pptxtojson)).toBe(false);
    expect(Bun.semver.satisfies("2.2.0", MIN_VERSIONS.pptxtojson)).toBe(true);
  });
});
