// The docs test harness (./server-source.ts): extraction follows index.ts's
// value imports into spacetimedb/src/drive/*, keeps ES module order, and refuses
// ambiguous names instead of silently picking one.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadServerDeclarations, loadServerNamespace, missingServerDeclarations } from "./server-source";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A throwaway module tree; returns the path of its index.ts. */
function moduleTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "server-source-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return join(root, "index.ts");
}

describe("the real module", () => {
  test("follows index.ts → drive/access-index.ts → drive/logic.ts", () => {
    const namespace = loadServerNamespace();
    expect(namespace).not.toBeNull();
    const files = namespace?.files ?? [];
    for (const file of ["drive/logic.ts", "drive/access-index.ts", "index.ts"]) expect(files).toContain(file);
    expect(files.indexOf("drive/logic.ts")).toBeLessThan(files.indexOf("drive/access-index.ts"));
    expect(files.at(-1)).toBe("index.ts");
    expect(files).not.toContain("drive/types.ts"); // reached only through `import type`
  });

  test("syncDocumentReaders comes out runnable, with driveAccessOf and DRIVE_DOC_ROLE_RANK pulled along", () => {
    const decls = loadServerDeclarations(["syncDocumentReaders", "docRoleFor"], { SenderError: Error, isServiceCaller: () => false });
    expect(decls).not.toBeNull();
    const inserted: Array<Record<string, unknown>> = [];
    const identity = (hex: string) => ({ toHexString: () => hex });
    const member = (id: string, role: string, permissions = "{}") => ({ id, organizationId: "o", userId: identity(id), status: "active", role, permissions });
    const members = [member("owner", "owner"), member("staff", "staff"), member("viewer", "staff", '{"drive":{"view":true}}')];
    const ctx = {
      db: {
        orgMember: { byOrganizationId: { filter: () => members.values() } },
        documentAccess: { byDocumentId: { filter: () => [].values() } },
        documentReaderIndex: { byDocumentId: { filter: () => [].values() }, insert: (row: Record<string, unknown>) => inserted.push(row) },
      },
    };
    const sync = decls?.syncDocumentReaders as (ctx: unknown, doc: object, roleFor: unknown) => void;
    sync(ctx, { id: "d1", organizationId: "o", ownerMemberId: "someone", visibility: "private" }, decls?.docRoleFor);
    expect(inserted.map((r) => r.id).sort()).toEqual(["d1:owner", "d1:viewer"]);
  });

  test("missingServerDeclarations names what a suite would not find", () => {
    expect(missingServerDeclarations(["docRoleFor", "driveAccessOf", "noSuchThing"])).toEqual(["noSuchThing"]);
    expect(loadServerDeclarations(["noSuchThing"])).toBeNull();
  });
});

describe("import following on a synthetic module", () => {
  test("dependencies are emitted first, so a module-level const can use an imported one", () => {
    const entry = moduleTree({
      "index.ts": "import { BASE } from './lib/base';\nexport const DOUBLE = BASE * 2;\nexport function total() { return DOUBLE + BASE; }\n",
      "lib/base.ts": "import { ONE } from './one';\nexport const BASE = ONE * 21;\n",
      "lib/one.ts": "export const ONE = 1;\n",
    });
    const decls = loadServerDeclarations(["total"], {}, entry);
    expect((decls?.total as () => number)()).toBe(63);
    expect(loadServerNamespace(entry)?.files).toEqual(["lib/one.ts", "lib/base.ts", "index.ts"]);
  });

  test("`import type` and all-type named imports are not followed; mixed ones are", () => {
    const entry = moduleTree({
      "index.ts": [
        "import type { A } from './a';",
        "import { type B } from './b';",
        "import { type C, cValue } from './c';",
        "export function f(x: A, y: B): number { return cValue; }",
      ].join("\n"),
      "a.ts": "export type A = number;\nexport const aValue = 1;\n",
      "b.ts": "export type B = number;\nexport const bValue = 2;\n",
      "c.ts": "export type C = number;\nexport const cValue = 3;\n",
    });
    expect(loadServerNamespace(entry)?.files).toEqual(["c.ts", "index.ts"]);
    expect((loadServerDeclarations(["f"], {}, entry)?.f as (a: number, b: number) => number)(0, 0)).toBe(3);
  });

  test("a name declared in two module files throws when extracted", () => {
    const entry = moduleTree({
      "index.ts": "import { fromA } from './a';\nconst helper = () => 'index';\nexport function useIt() { return helper() + fromA(); }\n",
      "a.ts": "function helper() { return 'a'; }\nexport function fromA() { return helper(); }\n",
    });
    expect(() => loadServerDeclarations(["useIt"], {}, entry)).toThrow("'helper' is declared in more than one module file (a.ts, index.ts)");
  });

  test("a type declared in two files is not a collision (types are erased)", () => {
    const entry = moduleTree({
      "index.ts": "import { two } from './a';\ntype Id = string;\nexport function f(x: Id) { return x + two(); }\n",
      "a.ts": "type Id = number;\nexport function two(): Id { return 2; }\n",
    });
    expect((loadServerDeclarations(["f"], {}, entry)?.f as (x: string) => string)("x")).toBe("x2");
  });

  test("aliased, default and namespace imports are refused loudly", () => {
    const aliased = moduleTree({ "index.ts": "import { a as b } from './a';\nexport const x = b;\n", "a.ts": "export const a = 1;\n" });
    expect(() => loadServerNamespace(aliased)).toThrow("aliased import 'a as b' not supported");
    const star = moduleTree({ "index.ts": "import * as a from './a';\nexport const x = a;\n", "a.ts": "export const a = 1;\n" });
    expect(() => loadServerNamespace(star)).toThrow("namespace import not supported");
    const dflt = moduleTree({ "index.ts": "import a from './a';\nexport const x = a;\n", "a.ts": "export default 1;\n" });
    expect(() => loadServerNamespace(dflt)).toThrow("default import not supported");
  });

  test("import cycles terminate", () => {
    const entry = moduleTree({
      "index.ts": "import { b } from './b';\nexport function a() { return 'a'; }\nexport function run() { return a() + b(); }\n",
      "b.ts": "import { a } from './index';\nexport function b() { return 'b'; }\n",
    });
    expect((loadServerDeclarations(["run"], {}, entry)?.run as () => string)()).toBe("ab");
  });
});
