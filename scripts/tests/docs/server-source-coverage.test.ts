// Guard against silent skips. Parity suites extract server code with
// loadServerDeclarations (./server-source.ts), which returns null when a name is
// missing — and a `describe.if(server !== null)` then quietly runs nothing. This
// suite fails instead, whenever:
// - a name some test under scripts/tests/ extracts is no longer defined by
//   spacetimedb/src/index.ts or a file it imports (e.g. moved into a factory, or
//   renamed without updating the suite);
// - the scan cannot tell which names a call extracts: a list imported from
//   another file or computed, an extractor passed around as a value, or an
//   anonymous function forwarding its list;
// - a name in REQUIRED (what the Docs / Drive parity and policy suites rely on)
//   is missing or does not evaluate;
// - two module files declare the same value name, which makes extraction ambiguous.
//
// Wrappers are followed, not listed: a function that forwards one of its own
// parameters to an extractor (fake-db.ts `loadModule`, a sheets harness…)
// becomes an extractor itself, and its callers' lists are checked instead.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { moduleStubs } from "../drive/fake-db";
import { loadServerDeclarations, loadServerNamespace, missingServerDeclarations, serverNameCollisions } from "./server-source";

const TESTS_DIR = join(import.meta.dir, "..");

/** Always required, whatever the suites currently call. */
const REQUIRED = [
  // Docs parity suites
  "docRoleFor", "docMemberGate", "docExcerpt", "docLink", "sanitizeDocAwareness", "cleanCommentAnchor", "DOC_ROLE_RANK",
  // Drive access model (spacetimedb/src/drive/logic.ts, followed from index.ts)
  "driveAccessOf", "withoutDrivePower", "DRIVE_DOC_ROLE_RANK",
  // Access-index maintenance (spacetimedb/src/drive/access-index.ts + the index.ts wrappers)
  "syncDriveAdminIndex", "syncMemberDocReaders", "syncDocumentReaders", "dropDocumentReaders", "rekeyAccessIdentity",
  "syncMemberAccessIndexes", "dropMemberAccessIndexes", "refreshDocReaders", "isActiveMemberId",
] as const;

/** Suites that extract from synthetic module trees or probe missing names on purpose. */
const HARNESS_SELF_TESTS = new Set(["docs/server-source.test.ts", "docs/server-source-coverage.test.ts"]);
/** The server-source.ts extractors → the position of their name list. Forwarding wrappers are discovered. */
const BASE_EXTRACTORS: ReadonlyArray<readonly [string, number]> = [["loadServerDeclarations", 0], ["missingServerDeclarations", 0]];

interface SourceText { rel: string; text: string }

function testFiles(dir: string): SourceText[] {
  const out: SourceText[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...testFiles(path));
    else if (/\.tsx?$/.test(entry.name)) out.push({ rel: relative(TESTS_DIR, path), text: readFileSync(path, "utf8") });
  }
  return out;
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

interface Extraction { file: string; names: string[] }

interface Scan {
  extractions: Extraction[];
  /** Forwarding wrappers found: name → "file: argument n". */
  wrappers: Map<string, string>;
  /** Everything the scan could not follow — each one would be a silent skip. */
  problems: string[];
}

interface Parsed {
  rel: string;
  source: ts.SourceFile;
  constArrays: Map<string, ts.ArrayLiteralExpression>;
  /** `import { a as b }` → b → a */
  aliases: Map<string, string>;
}

function parse(file: SourceText): Parsed {
  const source = ts.createSourceFile(file.rel, file.text, ts.ScriptTarget.ES2022, true);
  const constArrays = new Map<string, ts.ArrayLiteralExpression>();
  const aliases = new Map<string, string>();
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        const init = decl.initializer && unwrap(decl.initializer);
        if (ts.isIdentifier(decl.name) && init && ts.isArrayLiteralExpression(init)) constArrays.set(decl.name.text, init);
      }
    } else if (ts.isImportDeclaration(statement)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) if (element.propertyName) aliases.set(element.name.text, element.propertyName.text);
      }
    }
  }
  return { rel: file.rel, source, constArrays, aliases };
}

/** The function declaring `id` as a parameter (walking out through nested functions) and that parameter's position. */
function parameterOf(id: ts.Identifier): { fn: ts.SignatureDeclaration; index: number } | undefined {
  for (let node: ts.Node | undefined = id.parent; node; node = node.parent) {
    if (!ts.isFunctionLike(node)) continue;
    const index = node.parameters.findIndex((p) => ts.isIdentifier(p.name) && p.name.text === id.text);
    if (index >= 0) return { fn: node, index };
  }
  return undefined;
}

/** The name callers use for `fn`, when it has one. */
function functionName(fn: ts.SignatureDeclaration): string | undefined {
  if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return undefined;
  const holder = fn.parent;
  if ((ts.isVariableDeclaration(holder) || ts.isPropertyAssignment(holder)) && ts.isIdentifier(holder.name)) return holder.name.text;
  return undefined;
}

function calleeName(file: Parsed, call: ts.CallExpression): string | undefined {
  const callee = unwrap(call.expression);
  if (ts.isIdentifier(callee)) return file.aliases.get(callee.text) ?? callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
}

/** `id` names an extractor somewhere other than a call, a declaration, an import/export or a `typeof` type. */
function isValueUse(id: ts.Identifier): boolean {
  const parent = id.parent;
  if (ts.isCallExpression(parent) && parent.expression === id) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) {
    return !(ts.isCallExpression(parent.parent) && parent.parent.expression === parent);
  }
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return false;
  if ((ts.isFunctionDeclaration(parent) || ts.isMethodDeclaration(parent) || ts.isVariableDeclaration(parent) || ts.isParameter(parent)
    || ts.isPropertyAssignment(parent) || ts.isBindingElement(parent)) && parent.name === id) return false;
  return ts.findAncestor(id, ts.isTypeQueryNode) === undefined;
}

/** One pass over every file with the current extractors; the forwarding wrappers it finds join `extractors`. */
function scanPass(files: readonly Parsed[], extractors: Map<string, number>, wrappers: Map<string, string>): Omit<Scan, "wrappers"> {
  const extractions: Extraction[] = [];
  const problems: string[] = [];
  for (const file of files) {
    const at = (node: ts.Node) => `${file.rel}:${file.source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
    /** `id` is a parameter of the enclosing function: that function becomes an extractor (its callers carry the names). */
    const forward = (id: ts.Identifier): boolean => {
      const param = parameterOf(id);
      if (!param) return false;
      const name = functionName(param.fn);
      const known = name === undefined ? undefined : extractors.get(name);
      if (name === undefined) problems.push(`${at(id)}: an anonymous function forwards its parameter ${id.text} to an extractor — name it so its callers are scanned`);
      else if (known === undefined) {
        extractors.set(name, param.index);
        wrappers.set(name, `${file.rel}: argument ${param.index + 1}`);
      } else if (known !== param.index) problems.push(`${at(id)}: two extractors named ${name} take their list at different positions — rename one`);
      return true;
    };
    const resolveConst = (id: ts.Identifier, names: string[], depth: number): boolean => {
      const list = file.constArrays.get(id.text);
      if (!list || depth >= 5) return false;
      resolveList(list, names, depth + 1);
      return true;
    };
    const resolveList = (list: ts.ArrayLiteralExpression, names: string[], depth: number): void => {
      for (const element of list.elements) {
        const value = unwrap(element);
        if (ts.isStringLiteralLike(value)) names.push(value.text);
        else if (ts.isSpreadElement(element) && ts.isIdentifier(element.expression)
          && (forward(element.expression) || resolveConst(element.expression, names, depth))) continue;
        else problems.push(`${at(element)}: cannot resolve list element ${element.getText(file.source)} — use string literals or a same-file const array`);
      }
    };
    const visit = (node: ts.Node): void => {
      const name = ts.isCallExpression(node) ? calleeName(file, node) : undefined;
      const index = name === undefined ? undefined : extractors.get(name);
      if (ts.isCallExpression(node) && index !== undefined) {
        const given = node.arguments[index];
        const arg = given && unwrap(given);
        const names: string[] = [];
        if (arg && ts.isArrayLiteralExpression(arg)) {
          resolveList(arg, names, 0);
          extractions.push({ file: file.rel, names });
        } else if (arg && ts.isIdentifier(arg) && forward(arg)) {
          // A wrapper: its callers are scanned instead.
        } else if (arg && ts.isIdentifier(arg) && resolveConst(arg, names, 0)) {
          extractions.push({ file: file.rel, names });
        } else {
          problems.push(`${at(node)}: cannot resolve the list passed to ${name}(${arg ? arg.getText(file.source) : ""}) — imported or computed lists are not followed; use string literals or a same-file const array`);
        }
      } else if (ts.isIdentifier(node) && extractors.has(file.aliases.get(node.text) ?? node.text) && isValueUse(node)) {
        problems.push(`${at(node)}: ${node.text} is used as a value — call it directly so its list can be checked`);
      }
      ts.forEachChild(node, visit);
    };
    visit(file.source);
  }
  return { extractions, problems };
}

/** Repeats the pass until no new wrapper turns up, so wrappers of wrappers are followed too. */
function scanExtractions(sources: readonly SourceText[]): Scan {
  const files = sources.map(parse);
  const extractors = new Map<string, number>(BASE_EXTRACTORS);
  const wrappers = new Map<string, string>();
  for (;;) {
    const known = extractors.size;
    const pass = scanPass(files, extractors, wrappers);
    if (extractors.size === known) return { ...pass, wrappers };
  }
}

const scan = scanExtractions(testFiles(TESTS_DIR).filter((file) => !HARNESS_SELF_TESTS.has(file.rel)));

describe("server-source coverage", () => {
  test("the scan finds the known parity suites and follows fake-db.ts loadModule", () => {
    const files = new Set(scan.extractions.map((e) => e.file));
    for (const file of ["docs/access.test.ts", "docs/fake-server.ts", "docs/home-member-gate.test.ts", "drive/access-index.test.ts"]) {
      expect(files).toContain(file);
    }
    expect(scan.wrappers.get("loadModule")).toBe("drive/fake-db.ts: argument 1");
  });

  test("every name a suite extracts is defined by the module (no silent skips)", () => {
    const problems = [...scan.problems];
    for (const { file, names } of scan.extractions) {
      for (const name of missingServerDeclarations(names) ?? names) problems.push(`${file}: '${name}' is not defined by spacetimedb/src/index.ts or its imports`);
    }
    expect(problems).toEqual([]);
  });

  test("the scan follows new wrappers and reports every list it cannot follow", () => {
    const synthetic = scanExtractions([
      {
        rel: "sheets/helpers/harness.ts",
        text: [
          'import { loadServerDeclarations as load } from "../../docs/server-source";',
          'export function loadSheetServer(stubs: object, names: readonly string[]) { return load([...names, "docRoleFor"], stubs); }',
          "export const probe = (names: string[]) => missingServerDeclarations(names);",
          "export default (names: string[]) => loadServerDeclarations(names);",
        ].join("\n"),
      },
      {
        rel: "sheets/a.test.ts",
        text: [
          'import { SHEET_NAMES } from "./names";',
          'const LOCAL = ["sheetB"] as const;',
          'loadSheetServer({}, ["sheetA", ...LOCAL]);',
          'probe(["sheetC"]);',
          "loadServerDeclarations(SHEET_NAMES);",
          "const alias = loadSheetServer;",
          "type Loaded = ReturnType<typeof loadSheetServer>;",
          'loadServerDeclarations([...SHEET_NAMES, "x"]);',
        ].join("\n"),
      },
    ]);
    expect(Object.fromEntries(synthetic.wrappers)).toEqual({
      loadSheetServer: "sheets/helpers/harness.ts: argument 2",
      probe: "sheets/helpers/harness.ts: argument 1",
    });
    expect(synthetic.extractions).toEqual([
      { file: "sheets/helpers/harness.ts", names: ["docRoleFor"] },
      { file: "sheets/a.test.ts", names: ["sheetA", "sheetB"] },
      { file: "sheets/a.test.ts", names: ["sheetC"] },
      { file: "sheets/a.test.ts", names: ["x"] },
    ]);
    expect(synthetic.problems.map((p) => p.slice(0, p.indexOf(": ")))).toEqual([
      "sheets/helpers/harness.ts:4", // anonymous forwarder
      "sheets/a.test.ts:5", // imported list
      "sheets/a.test.ts:6", // extractor used as a value
      "sheets/a.test.ts:8", // spread of an imported list
    ]);
  });

  test("REQUIRED names exist and evaluate", () => {
    expect(missingServerDeclarations(REQUIRED)).toEqual([]);
    const decls = loadServerDeclarations(REQUIRED, moduleStubs());
    expect(decls).not.toBeNull();
    for (const name of REQUIRED) {
      expect({ name, type: typeof decls?.[name] }).toEqual({ name, type: expect.stringMatching(/^(function|object)$/) });
    }
  });

  test("no value name is declared in two module files", () => {
    const namespace = loadServerNamespace();
    expect(namespace).not.toBeNull();
    expect(serverNameCollisions(namespace as NonNullable<typeof namespace>)).toEqual([]);
  });
});
