// Test helper: evaluates selected top-level declarations of the SpacetimeDB
// module (spacetimedb/src/index.ts) in isolation, so client helpers can be
// checked against the real server code instead of a copy.
//
// The module imports the SpacetimeDB server runtime, so it can't be imported
// under Bun. Instead we parse it with the TypeScript compiler, pull out the
// requested declarations plus the top-level declarations they reference,
// strip types, and evaluate that snippet with caller-provided stubs.
//
// Import following: index.ts delegates to files such as ./drive/logic.ts and
// ./drive/access-index.ts. Every VALUE import with a relative specifier is
// followed (transitively; `import type` is not), and the top-level declarations
// of each followed file join one namespace with index.ts's, so extracting
// `docRoleFor` also brings `driveAccessOf` along. The snippet lists files in
// import order (dependencies first), as ES modules evaluate them. A name
// declared as a value in two followed files is ambiguous: extracting it throws
// (and scripts/tests/docs/server-source-coverage.test.ts asserts there is none).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const MODULE_PATH = join(import.meta.dir, "..", "..", "..", "spacetimedb", "src", "index.ts");

export interface TopLevel {
  readonly name: string;
  /** Emitted text (`export` stripped). */
  readonly text: string;
  readonly isValue: boolean;
  /** Module file, relative to the entry's directory (spacetimedb/src). */
  readonly file: string;
  /** Position in the emitted order (files dependencies-first, statements in source order). */
  readonly order: number;
  readonly refs: ReadonlySet<string>;
}

/** Everything the followed files declare at top level, by name (a name declared twice keeps every entry). */
export interface ServerNamespace {
  readonly files: readonly string[];
  readonly declarations: ReadonlyMap<string, readonly TopLevel[]>;
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

function resolveRelative(baseDir: string, fromFile: string, specifier: string): string {
  const base = resolve(dirname(fromFile), specifier);
  const stem = base.endsWith(".js") ? base.slice(0, -3) : base;
  for (const candidate of [base, `${stem}.ts`, `${stem}.tsx`, join(base, "index.ts")]) {
    if ((candidate.endsWith(".ts") || candidate.endsWith(".tsx")) && existsSync(candidate)) return candidate;
  }
  throw new Error(`server-source: cannot resolve '${specifier}' imported by ${relative(baseDir, fromFile)}`);
}

/**
 * The relative files `file` imports (or re-exports) as values. Aliased, default
 * and namespace imports are refused: the merged namespace cannot express them.
 */
function valueImports(baseDir: string, path: string, file: ts.SourceFile): string[] {
  const out: string[] = [];
  for (const statement of file.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith(".")
    ) {
      out.push(resolveRelative(baseDir, path, statement.moduleSpecifier.text));
      continue;
    }
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith(".")) continue;
    const clause = statement.importClause;
    if (clause?.isTypeOnly) continue;
    const where = `${relative(baseDir, path)} imports '${specifier}'`;
    if (clause?.name) throw new Error(`server-source: default import not supported (${where})`);
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) throw new Error(`server-source: namespace import not supported (${where})`);
    const named = bindings && ts.isNamedImports(bindings) ? bindings.elements.filter((e) => !e.isTypeOnly) : [];
    for (const element of named) {
      if (element.propertyName && element.propertyName.text !== element.name.text) {
        throw new Error(`server-source: aliased import '${element.propertyName.text} as ${element.name.text}' not supported (${where})`);
      }
    }
    // `import './x'` (side effects only) and imports of values are both followed; all-`type` named imports are not.
    if (!clause || named.length > 0) out.push(resolveRelative(baseDir, path, specifier));
  }
  return out;
}

function topLevelOf(file: ts.SourceFile, relPath: string, nextOrder: () => number): TopLevel[] {
  const out: TopLevel[] = [];
  const add = (name: string, statement: ts.Statement, isValue: boolean) =>
    out.push({
      name,
      text: statement.getText(file).replace(/^export\s+/, ""),
      isValue,
      file: relPath,
      order: nextOrder(),
      refs: referencedNames(statement),
    });
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      add(statement.name.text, statement, true);
    } else if (ts.isVariableStatement(statement)) {
      // One statement may declare several names; loadServerDeclarations emits it once (keyed by file + text).
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) add(decl.name.text, statement, true);
      }
    } else if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      add(statement.name.text, statement, false);
    }
  }
  return out;
}

const cache = new Map<string, { source: string; namespace: ServerNamespace }>();

/**
 * Parse the module entry (spacetimedb/src/index.ts unless `entry` names another,
 * for the harness's own tests) and every file it (transitively) imports as a
 * value. Null when the entry cannot be read. Cached per entry content.
 */
export function loadServerNamespace(entry: string = MODULE_PATH): ServerNamespace | null {
  let source: string;
  try {
    source = readFileSync(entry, "utf8");
  } catch {
    return null;
  }
  const hit = cache.get(entry);
  if (hit?.source === source) return hit.namespace;
  const baseDir = dirname(entry);

  const orderedFiles: string[] = [];
  const parsed = new Map<string, ts.SourceFile>();
  const visiting = new Set<string>();
  const visit = (path: string) => {
    if (parsed.has(path) || visiting.has(path)) return;
    visiting.add(path);
    const text = path === entry ? source : readFileSync(path, "utf8");
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    for (const dep of valueImports(baseDir, path, file)) visit(dep);
    parsed.set(path, file);
    orderedFiles.push(path);
  };
  visit(entry);

  let order = 0;
  const declarations = new Map<string, TopLevel[]>();
  for (const path of orderedFiles) {
    const relPath = relative(baseDir, path);
    for (const decl of topLevelOf(parsed.get(path) as ts.SourceFile, relPath, () => order++)) {
      const list = declarations.get(decl.name) ?? [];
      list.push(decl);
      declarations.set(decl.name, list);
    }
  }
  const namespace = { files: orderedFiles.map((p) => relative(baseDir, p)), declarations };
  cache.set(entry, { source, namespace });
  return namespace;
}

/** A name declared more than once across the followed files where one declaration is a value (types may repeat). */
function isCollision(list: readonly TopLevel[]): boolean {
  return list.length > 1 && list.some((d) => d.isValue);
}

/** Every ambiguous name of the merged namespace, with the files declaring it. */
export function serverNameCollisions(namespace: ServerNamespace): Array<{ name: string; files: string[] }> {
  const out: Array<{ name: string; files: string[] }> = [];
  for (const [name, list] of namespace.declarations) {
    if (isCollision(list)) out.push({ name, files: list.map((d) => d.file) });
  }
  return out;
}

/** The one declaration of `name`; throws when it is ambiguous. */
function declarationOf(namespace: ServerNamespace, name: string): TopLevel | undefined {
  const list = namespace.declarations.get(name);
  if (!list || list.length === 0) return undefined;
  if (isCollision(list)) {
    throw new Error(
      `server-source: '${name}' is declared in more than one module file (${list.map((d) => d.file).join(", ")}); rename one`,
    );
  }
  return list[0];
}

/** Which of `names` the module does not define as a value (the reason loadServerDeclarations would return null). */
export function missingServerDeclarations(names: readonly string[], entry: string = MODULE_PATH): string[] | null {
  const namespace = loadServerNamespace(entry);
  if (!namespace) return null;
  return names.filter((name) => !namespace.declarations.get(name)?.some((d) => d.isValue));
}

/**
 * Returns the requested declarations as live values, or null when the module
 * doesn't define all of them yet. `stubs` provide free variables such as
 * `isServiceCaller` or `SenderError`; stubbed names are never pulled from the files.
 * `entry` defaults to spacetimedb/src/index.ts.
 */
export function loadServerDeclarations(
  names: readonly string[],
  stubs: Record<string, unknown> = {},
  entry: string = MODULE_PATH,
): Record<string, unknown> | null {
  const namespace = loadServerNamespace(entry);
  if (!namespace) return null;
  if (names.some((name) => !namespace.declarations.get(name)?.some((d) => d.isValue))) return null;

  const included = new Map<string, TopLevel>(); // by emitted text: one entry per statement
  const queue = [...names];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name) || name in stubs) continue;
    seen.add(name);
    const decl = declarationOf(namespace, name);
    if (!decl || included.has(`${decl.file}\n${decl.text}`)) continue;
    included.set(`${decl.file}\n${decl.text}`, decl);
    for (const ref of decl.refs) {
      if (namespace.declarations.has(ref) && !seen.has(ref)) queue.push(ref);
    }
  }

  const ordered = [...included.values()].sort((a, b) => a.order - b.order);
  const snippet = ordered.map((decl) => decl.text).join("\n\n");
  const js = ts.transpileModule(snippet, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const factory = new Function(...Object.keys(stubs), `"use strict";\n${js}\nreturn { ${names.join(", ")} };`);
  return factory(...Object.values(stubs)) as Record<string, unknown>;
}
