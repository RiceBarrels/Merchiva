// Test helper: evaluates selected top-level declarations of the SpacetimeDB
// module (spacetimedb/src/index.ts) in isolation, so client helpers can be
// checked against the real server code instead of a copy.
//
// The module imports the SpacetimeDB server runtime, so it can't be imported
// under Bun. Instead we parse it with the TypeScript compiler, pull out the
// requested declarations plus the top-level declarations they reference,
// strip types, and evaluate that snippet with caller-provided stubs.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const MODULE_PATH = join(import.meta.dir, "..", "..", "..", "spacetimedb", "src", "index.ts");

interface TopLevel {
  statement: ts.Statement;
  isValue: boolean;
}

function topLevelDeclarations(file: ts.SourceFile): Map<string, TopLevel> {
  const out = new Map<string, TopLevel>();
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      out.set(statement.name.text, { statement, isValue: true });
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) out.set(decl.name.text, { statement, isValue: true });
      }
    } else if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      out.set(statement.name.text, { statement, isValue: false });
    }
  }
  return out;
}

/** Identifiers used as references (not as `obj.prop` names or object keys). */
function referencedNames(node: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n)) {
      const parent = n.parent;
      const isPropertyName =
        (parent && ts.isPropertyAccessExpression(parent) && parent.name === n) ||
        (parent && ts.isPropertyAssignment(parent) && parent.name === n) ||
        (parent && ts.isPropertySignature(parent) && parent.name === n);
      if (!isPropertyName) names.add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return names;
}

/**
 * Returns the requested declarations as live values, or null when the module
 * doesn't define all of them yet. `stubs` provide free variables such as
 * `isServiceCaller` or `SenderError`; stubbed names are never pulled from the file.
 */
export function loadServerDeclarations(
  names: readonly string[],
  stubs: Record<string, unknown> = {},
): Record<string, unknown> | null {
  let source: string;
  try {
    source = readFileSync(MODULE_PATH, "utf8");
  } catch {
    return null;
  }
  const file = ts.createSourceFile("index.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const declarations = topLevelDeclarations(file);
  if (names.some((name) => !declarations.get(name)?.isValue)) return null;

  const included = new Set<ts.Statement>();
  const queue = [...names];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name) || name in stubs) continue;
    seen.add(name);
    const decl = declarations.get(name);
    if (!decl || included.has(decl.statement)) continue;
    included.add(decl.statement);
    for (const ref of referencedNames(decl.statement)) {
      if (declarations.has(ref) && !seen.has(ref)) queue.push(ref);
    }
  }

  const ordered = file.statements.filter((statement) => included.has(statement));
  const snippet = ordered.map((statement) => statement.getText(file).replace(/^export\s+/, "")).join("\n\n");
  const js = ts.transpileModule(snippet, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const factory = new Function(...Object.keys(stubs), `"use strict";\n${js}\nreturn { ${names.join(", ")} };`);
  return factory(...Object.values(stubs)) as Record<string, unknown>;
}
