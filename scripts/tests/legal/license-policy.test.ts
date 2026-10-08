import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { collectNotices, distributedClosure, type NoticeProblem } from "../../licenses/collect";
import { readLockfile } from "../../licenses/lockfile";
import { EXCEPTIONS, SERVER_IMPORT_ALLOWLIST, SERVER_ONLY_ROOTS, STYLE_ONLY_ROOTS, UNUSED_DEPENDENCY_EDGES } from "../../licenses/policy";
import {
  clientChainsToRoots, cssPackageImports, directRootImporters, importSpecifiers, isClientFile, isPackageSpecifier, isWorkerFile,
  packageName, readSources, resolveImport, startsServerOnly,
} from "./import-graph";

/*
 * The license policy holds for everything that ships (integration-legal §3): every distributed package has an
 * allowed license with its text, and no "use client" file can reach a server-only package, which is what lets
 * SERVER_ONLY_ROOTS leave the notices.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const { file, problems } = collectNotices(ROOT);
const ROOTS = new Set(Object.keys(SERVER_ONLY_ROOTS));
const sources = readSources(ROOT, ["app", "components", "lib"]);
const stylesheets = readSources(ROOT, ["app", "components", "lib"], [".css"]);
const listedNpm = new Set(file.packages.filter((e) => e.source === "npm").map((e) => e.name));
/** [stylesheet, specifier, package] for every package import of an app stylesheet. */
const cssImports = [...stylesheets].flatMap(([path, src]) => cssPackageImports(src).map((spec) => [path, spec, packageName(spec)] as const));
const describeProblem = (p: NoticeProblem) => `[${p.kind}] ${p.name}${p.version ? `@${p.version}` : ""}: ${p.detail}`;

describe("license policy", () => {
  test("collectNotices reports no problems", () => {
    expect(problems.map(describeProblem)).toEqual([]);
  });

  test("every EXCEPTIONS entry is still distributed; pending sign-offs are announced", () => {
    for (const [name, exception] of Object.entries(EXCEPTIONS)) {
      expect(file.packages.some((e) => e.name === name && e.license === exception.license)).toBe(true);
      if (exception.approvedBy === "pending-user") console.warn(`EXCEPTIONS.${name} awaits sign-off; generate.ts --release will fail`);
    }
  });

  test("a server-only root is listed only when another distributed package depends on it, or its stylesheet ships", () => {
    const lock = readLockfile(ROOT);
    const closure = [...distributedClosure(lock).values()];
    const unexplained = [...ROOTS].filter(
      (root) =>
        listedNpm.has(root) &&
        !Object.hasOwn(STYLE_ONLY_ROOTS, root) &&
        !closure.some((p) => p.name !== root && Object.hasOwn(p.meta.dependencies ?? {}, root)),
    );
    expect(unexplained).toEqual([]);
  });
});

describe("stylesheets: what app CSS @imports ships in every client CSS bundle", () => {
  test("the scan sees app/globals.css and its package imports", () => {
    expect(stylesheets.has("app/globals.css")).toBe(true);
    expect(cssImports.length).toBeGreaterThan(0);
  });

  test("every package an app stylesheet imports is listed in the notices", () => {
    const unlisted = cssImports.filter(([, , name]) => !listedNpm.has(name)).map(([path, spec]) => `${path} imports ${spec}`);
    expect(unlisted).toEqual([]);
  });

  test("a stylesheet imports a SERVER_ONLY_ROOTS package only when it is a STYLE_ONLY_ROOTS entry", () => {
    const offenders = cssImports
      .filter(([, , name]) => ROOTS.has(name) && !Object.hasOwn(STYLE_ONLY_ROOTS, name))
      .map(([path, spec]) => `${path} imports ${spec}`);
    expect(offenders).toEqual([]);
  });

  test("every STYLE_ONLY_ROOTS entry is a server-only root that an app stylesheet still imports (no stale entries)", () => {
    const imported = new Set(cssImports.map(([, , name]) => name));
    const stale = Object.keys(STYLE_ONLY_ROOTS).filter((name) => !ROOTS.has(name) || !imported.has(name) || !listedNpm.has(name));
    expect(stale).toEqual([]);
  });

  test("the scanner reads @import / @plugin package specifiers (synthetic stylesheet)", () => {
    const css = [
      '@import "tailwindcss";',
      '@import url("pkg/a.css") layer(base);',
      "@import url(other);",
      '@import "./local.css";',
      "@import url(https://fonts.example.com/x.css);",
      '/* @import "commented-out"; */',
      '@plugin "@scope/plugin";',
      "@custom-variant dark (&:is(.dark *));",
    ].join("\n");
    expect(cssPackageImports(css)).toEqual(["tailwindcss", "pkg/a.css", "other", "@scope/plugin"]);
  });
});

describe("server-only packages never reach client code", () => {
  test("the import graph sees the app", () => {
    expect(sources.size).toBeGreaterThan(300);
    expect([...sources.values()].filter(isClientFile).length).toBeGreaterThan(100);
  });

  test("no \"use client\" file reaches a SERVER_ONLY_ROOTS package, directly or transitively", () => {
    const chains = clientChainsToRoots(sources, ROOTS).map((c) => c.join(" → "));
    expect(chains).toEqual([]);
  });

  test("a file outside app/api that imports a root starts with server-only or is allowlisted", () => {
    const offenders = [...directRootImporters(sources, ROOTS)]
      .filter(([path]) => !startsServerOnly(sources.get(path) ?? "") && !Object.hasOwn(SERVER_IMPORT_ALLOWLIST, path))
      .map(([path, roots]) => `${path} imports ${roots.join(", ")}`);
    expect(offenders).toEqual([]);
  });

  test("every SERVER_IMPORT_ALLOWLIST entry exists and still imports a root (no stale entries)", () => {
    const direct = directRootImporters(sources, ROOTS);
    const stale = Object.keys(SERVER_IMPORT_ALLOWLIST).filter((path) => !sources.has(path) || !direct.has(path));
    expect(stale).toEqual([]);
  });

  test("the checker reports the chain from a client file to a server root (synthetic tree)", () => {
    const tree = new Map<string, string>([
      ["components/a.tsx", '"use client";\nimport { charge } from "@/lib/pay";\nexport const A = charge;'],
      ["lib/pay.ts", 'import Stripe from "stripe";\nexport const charge = Stripe;'],
      ["components/b.tsx", '"use client";\nimport type Stripe from "stripe";\n// import x from "openai";\nexport type B = Stripe;'],
      ["components/c.tsx", "\"use client\";\nconst m = () => import('../lib/ai');\nexport default m;"],
      ["lib/ai.ts", 'export * from "openai";'],
      ["app/api/x/route.ts", 'import { Resend } from "resend";\nexport const r = Resend;'],
      ["lib/guarded.ts", '// header\nimport "server-only";\nimport { WebPush } from "web-push";\nexport const w = WebPush;'],
    ]);
    const roots = new Set(["stripe", "openai", "resend", "web-push"]);
    expect(clientChainsToRoots(tree, roots)).toEqual([
      ["components/a.tsx", "lib/pay.ts", "stripe"],
      ["components/c.tsx", "lib/ai.ts", "openai"],
    ]);
    expect([...directRootImporters(tree, roots).keys()]).toEqual(["lib/pay.ts", "lib/ai.ts", "lib/guarded.ts"]);
    expect(startsServerOnly(tree.get("lib/guarded.ts") ?? "")).toBe(true);
    expect(startsServerOnly(tree.get("lib/pay.ts") ?? "")).toBe(false);
  });

  test("module workers are client entries, and new Worker(new URL(…)) is an edge (synthetic tree)", () => {
    const tree = new Map<string, string>([
      ["components/c.tsx", '"use client";\nexport const w = () => new Worker(new URL("../lib/w.worker.ts", import.meta.url), { type: "module" });'],
      ["lib/w.worker.ts", 'import { verify } from "@/lib/auth/verify-token";\nself.onmessage = () => verify();'],
      ["lib/auth/verify-token.ts", 'import { jwtVerify } from "jose";\nexport const verify = jwtVerify;'],
      ["lib/spawn.ts", 'export const s = () => new Worker(new URL("./x.worker.ts", import.meta.url));'],
      ["lib/x.worker.ts", 'import Stripe from "stripe";\nexport const x = Stripe;'],
      ["lib/asset.ts", '// new URL("./x.worker.ts", import.meta.url)\nexport const u = new URL("./font.woff2", import.meta.url);'],
    ]);
    expect(importSpecifiers(tree.get("components/c.tsx") ?? "")).toEqual(["../lib/w.worker.ts"]);
    expect(importSpecifiers(tree.get("lib/asset.ts") ?? "")).toEqual(["./font.woff2"]);
    expect(importSpecifiers('export type M = typeof import("exceljs");\nexport const m = () => import("exceljs");')).toEqual(["exceljs"]);
    expect(clientChainsToRoots(tree, new Set(["jose", "stripe"]))).toEqual([
      ["components/c.tsx", "lib/w.worker.ts", "lib/auth/verify-token.ts", "jose"],
      ["lib/w.worker.ts", "lib/auth/verify-token.ts", "jose"],
      ["lib/x.worker.ts", "stripe"],
    ]);
  });

  test("the scan sees the app's module workers", () => {
    const workers = [...sources.keys()].filter(isWorkerFile);
    expect(workers.length).toBeGreaterThan(0);
    const spawned = new Set(
      [...sources].flatMap(([path, src]) => importSpecifiers(src).map((s) => resolveImport(sources, path, s)).filter((p): p is string => p !== null)),
    );
    expect(workers.filter((w) => !spawned.has(w))).toEqual([]);
  });
});

/** Every JS file of an installed package, outside its own nested node_modules. */
function packageFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) packageFiles(path, out);
    else if (/\.(c|m)?js$/.test(entry)) out.push(path);
  }
  return out;
}

describe("UNUSED_DEPENDENCY_EDGES", () => {
  for (const [host, deps] of Object.entries(UNUSED_DEPENDENCY_EDGES)) {
    for (const dep of Object.keys(deps)) {
      test(`no file of the installed ${host} imports ${dep}`, () => {
        const dir = join(ROOT, "node_modules", host);
        expect(existsSync(dir)).toBe(true);
        const files = packageFiles(dir);
        expect(files.length).toBeGreaterThan(0);
        const importers = files.filter((f) => importSpecifiers(readFileSync(f, "utf8")).filter(isPackageSpecifier).map(packageName).includes(dep));
        expect(importers).toEqual([]);
      });
      test(`no app file imports ${dep}`, () => {
        const importers = [...sources].filter(([, src]) => importSpecifiers(src).filter(isPackageSpecifier).map(packageName).includes(dep));
        expect(importers.map(([p]) => p)).toEqual([]);
      });
    }
  }
});
