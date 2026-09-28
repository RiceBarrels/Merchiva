// Regression guard for the isServiceCaller hole. A SpacetimeDB unique-index
// `find()` returns the row or NULL on a miss (SDK 2.10 `tableIterateOne`),
// never undefined, so `find(key) !== undefined` is true for EVERY key.
// isServiceCaller compared that way and made every caller the service
// identity, which findActiveMember then treats as a virtual owner of every
// org. Compare a find result with `!= null` or by truthiness instead.
//
// Reads the REAL module sources (every spacetimedb/src/**/*.ts, index.ts
// included) and the installed SDK, resolved from this file's location.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const REPO = join(import.meta.dir, "..", "..", "..");
const MODULE_SRC = join(REPO, "spacetimedb", "src");
const INDEX_PATH = join(MODULE_SRC, "index.ts");
const SDK_SERVER = join(REPO, "spacetimedb", "node_modules", "spacetimedb", "dist", "server", "index.mjs");

/** Every module source file. `foo 2.ts` Finder copies are junk, not module code. */
function moduleFiles(dir: string = MODULE_SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return moduleFiles(path);
    const isSource = entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") && !/ \d+\.ts$/.test(entry.name);
    return entry.isFile() && isSource ? [path] : [];
  });
}

function unwrap(node: ts.Expression): ts.Expression {
  let n = node;
  while (
    ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) ||
    ts.isSatisfiesExpression(n) || ts.isTypeAssertionExpression(n)
  ) n = n.expression;
  return n;
}

const isUndefined = (node: ts.Expression): boolean =>
  (ts.isIdentifier(node) && node.text === "undefined") || ts.isVoidExpression(node);

/**
 * `<table>.<index>.find(key)`, or the findById(table, id) helper that returns
 * one. Array#find takes a callback on a plain value (`rows.find(fn)`,
 * `[...it].find(fn)`), so a function argument or a non-property receiver is not
 * an index lookup.
 */
function isIndexFind(node: ts.Expression): boolean {
  const call = unwrap(node);
  if (!ts.isCallExpression(call)) return false;
  if (ts.isIdentifier(call.expression)) return call.expression.text === "findById";
  if (!ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== "find") return false;
  if (!ts.isPropertyAccessExpression(call.expression.expression) || call.arguments.length !== 1) return false;
  const [arg] = call.arguments;
  return !ts.isArrowFunction(arg) && !ts.isFunctionExpression(arg);
}

/** The nearest declaration of `name` visible from `from` (lexical scope); undefined for a parameter. */
function declarationOf(from: ts.Node, name: string): ts.VariableDeclaration | undefined {
  const named = (d: ts.VariableDeclaration) => ts.isIdentifier(d.name) && d.name.text === name;
  for (let scope = from.parent; scope; scope = scope.parent) {
    if (ts.isBlock(scope) || ts.isSourceFile(scope) || ts.isModuleBlock(scope) || ts.isCaseOrDefaultClause(scope)) {
      for (const st of scope.statements) {
        const hit = ts.isVariableStatement(st) ? st.declarationList.declarations.find(named) : undefined;
        if (hit) return hit;
      }
    }
    if ((ts.isForStatement(scope) || ts.isForOfStatement(scope) || ts.isForInStatement(scope)) &&
      scope.initializer && ts.isVariableDeclarationList(scope.initializer)) {
      const hit = scope.initializer.declarations.find(named);
      if (hit) return hit;
    }
    if (ts.isFunctionLike(scope) && scope.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === name)) {
      return undefined;
    }
  }
  return undefined;
}

/** A find call itself, or a variable initialised from one. */
function isFindResult(node: ts.Expression): boolean {
  const n = unwrap(node);
  if (isIndexFind(n)) return true;
  if (!ts.isIdentifier(n)) return false;
  const decl = declarationOf(n, n.text);
  return decl?.initializer !== undefined && isIndexFind(decl.initializer);
}

interface Finding { file: string; line: number; text: string }

/** `x === undefined`, `x !== undefined`, `typeof x === 'undefined'` (either side) where x is a find result. */
function strictUndefinedChecks(fileName: string, source: string): Finding[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const findings: Finding[] = [];
  const checks = (a: ts.Expression, b: ts.Expression): boolean =>
    (isUndefined(b) && isFindResult(a)) ||
    (ts.isTypeOfExpression(a) && ts.isStringLiteral(b) && b.text === "undefined" && isFindResult(a.expression));
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      const strict = op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken;
      const left = unwrap(node.left);
      const right = unwrap(node.right);
      if (strict && (checks(left, right) || checks(right, left))) {
        const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        findings.push({ file: fileName, line, text: node.getText(file) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return findings;
}

describe("isServiceCaller regression: a unique-index find() miss is null, never undefined", () => {
  test("the SDK's unique-index find returns null for a missing row", () => {
    const sdk = readFileSync(SDK_SERVER, "utf8");
    const at = sdk.indexOf("function tableIterateOne(");
    expect(at).toBeGreaterThan(-1);
    const body = sdk.slice(at, sdk.indexOf("\n}", at));
    expect(body).toContain("return null;");
    expect(body).not.toContain("return undefined");
    expect(sdk).toContain("return tableIterateOne(iter_id, deserializeRow);");
  });

  test("the check flags strict undefined comparisons of find results and nothing else", () => {
    const sample = [
      "function a(ctx) { return ctx.db.serviceIdentity.identity.find(ctx.sender) !== undefined; }",
      "function b(ctx, k) { const row = ctx.db.user.id.find(k); if (row === undefined) return; }",
      "function c(ctx, id) { return undefined === findById(ctx.db.document, id); }",
      "function d(ctx, k) { const r = (ctx.db.user.id.find(k) as Row | undefined); return typeof r === 'undefined'; }",
      "function e(ctx, k) { return ctx.db.serviceIdentity.identity.find(k) != null; }",
      "function f(rows) { return [...rows].find((r) => r.id === 1) === undefined; }",
      "function g(ctx, k) { return ctx.db.user.id.find(k)?.email === undefined; }",
      "function h(ctx, k) { const row = ctx.db.user.id.find(k); if (!row) return; }",
      "function i(ctx, row) { return row === undefined; }",
      "function j(rows, pick) { const row = rows.find(pick); return row === undefined; }",
    ].join("\n");
    expect(strictUndefinedChecks("sample.ts", sample).map((f) => f.line)).toEqual([1, 2, 3, 4]);
  });

  test("no module source compares a unique-index find() result with === / !== undefined", () => {
    const files = moduleFiles();
    expect(files).toContain(INDEX_PATH);
    const findings = files.flatMap((path) => strictUndefinedChecks(relative(REPO, path), readFileSync(path, "utf8")));
    expect(findings.map((f) => `${f.file}:${f.line}: ${f.text}`)).toEqual([]);
  });

  test("claimFirstAdmin is service-only", () => {
    const file = ts.createSourceFile("index.ts", readFileSync(INDEX_PATH, "utf8"), ts.ScriptTarget.Latest, true);
    let first: string | undefined;
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "claimFirstAdmin" &&
        node.initializer && ts.isCallExpression(node.initializer)) {
        const handler = node.initializer.arguments[1];
        if (handler && ts.isArrowFunction(handler) && ts.isBlock(handler.body)) first = handler.body.statements[0]?.getText(file);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(first).toBe("if (!isServiceCaller(ctx)) unauthorized('Service identity required');");
  });
});
