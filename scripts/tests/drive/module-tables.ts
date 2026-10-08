// Reads every `table(options, columns)` definition of the SpacetimeDB module
// source: the table name, whether it is public, and its columns in declaration
// order, each with its WIRE type; and every `spacetimedb.reducer(…)`: its name
// and its parameters, in order, with their wire types. Shared by
// scripts/tests/drive/client-compat-schema.test.ts and the script that wrote
// scripts/tests/fixtures/client-compat-tables.json, so the fixture and the
// check read the source the same way.
//
// The source is parsed (TypeScript syntax tree), like scripts/check-rls-coverage.ts:
// comments and layout do not matter, and anything unreadable is reported.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/** [column name, wire type] in declaration order. */
export type ModuleColumn = [name: string, type: string];

export interface ModuleTable {
  readonly name: string;
  readonly file: string;
  /** `public: true` (clients may subscribe); absent means private. */
  readonly isPublic: boolean;
  readonly columns: readonly ModuleColumn[];
}

export interface ModuleTables {
  readonly tables: ReadonlyMap<string, ModuleTable>;
  /** Definitions that could not be read (each one fails the compat test). */
  readonly unreadable: readonly string[];
}

/** `path` and every .ts file below it, sorted. */
export function moduleSourceFiles(dir: string): Array<{ path: string; text: string }> {
  return readdirSync(dir).sort().flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return moduleSourceFiles(path);
    return path.endsWith(".ts") ? [{ path, text: readFileSync(path, "utf8") }] : [];
  });
}

/**
 * The type a column has on the wire: its builder text without the modifiers that
 * only shape indexes or migrations (`.primaryKey()`, `.unique()`, `.autoInc()`,
 * `.index(…)`, `.default(…)`). `t.option(t.string())` stays as it is; so does a
 * `.name(…)`, which renames the column for SQL.
 */
export function wireType(builder: string): string {
  let type = builder.replace(/\s+/g, "");
  for (;;) {
    const next = type.replace(/\.(?:primaryKey|unique|autoInc)\(\)$/, "").replace(/\.(?:index|default)\((?:[^()]|\([^()]*\))*\)$/, "");
    if (next === type) return type;
    type = next;
  }
}

/** [parameter name, wire type] in declaration order. */
export type ReducerParam = [name: string, type: string];

export interface ModuleReducer {
  readonly name: string;
  readonly file: string;
  readonly params: readonly ReducerParam[];
}

export interface ModuleReducers {
  readonly reducers: ReadonlyMap<string, ModuleReducer>;
  /** Definitions that could not be read (each one fails the compat test). */
  readonly unreadable: readonly string[];
}

function bare(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
}

/** Local names `table` is imported under from 'spacetimedb/server'. */
function tableCallees(file: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const stmt of file.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (stmt.moduleSpecifier.text !== "spacetimedb/server") continue;
    const bindings = stmt.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) if ((el.propertyName ?? el.name).text === "table") names.add(el.name.text);
    }
  }
  return names;
}

/** The `key: value` assignment named `key` of an object literal, if any. */
function property(obj: ts.ObjectLiteralExpression, key: string): ts.PropertyAssignment | undefined {
  return obj.properties.find((p): p is ts.PropertyAssignment =>
    ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === key);
}

/** Every table defined in `files` (paths are only labels; `text` is parsed). */
export function readModuleTables(files: ReadonlyArray<{ path: string; text: string }>): ModuleTables {
  const tables = new Map<string, ModuleTable>();
  const unreadable: string[] = [];
  for (const { path, text } of files) {
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const callees = tableCallees(source);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && callees.has(node.expression.text)) {
        const at = `${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
        const [options, columns] = node.arguments.map(bare);
        const nameProp = options && ts.isObjectLiteralExpression(options) ? property(options, "name") : undefined;
        const name = nameProp && ts.isStringLiteralLike(bare(nameProp.initializer)) ? (bare(nameProp.initializer) as ts.StringLiteral).text : undefined;
        const publicProp = options && ts.isObjectLiteralExpression(options) ? property(options, "public") : undefined;
        const publicValue = publicProp ? bare(publicProp.initializer).kind : ts.SyntaxKind.FalseKeyword;
        if (name === undefined || !columns || !ts.isObjectLiteralExpression(columns)) {
          unreadable.push(`${at}: table without a literal name or a columns object literal`);
        } else if (publicValue !== ts.SyntaxKind.TrueKeyword && publicValue !== ts.SyntaxKind.FalseKeyword) {
          unreadable.push(`${at}: ${name} \`public\` is not literally true or false`);
        } else {
          const cols: ModuleColumn[] = [];
          for (const p of columns.properties) {
            if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
              cols.push([p.name.text, wireType(p.initializer.getText(source))]);
            } else {
              unreadable.push(`${at}: ${name} column \`${p.getText(source)}\` is not \`name: t.…\``);
            }
          }
          if (tables.has(name)) unreadable.push(`${at}: ${name} is defined twice`);
          tables.set(name, { name, file: path, isPublic: publicValue === ts.SyntaxKind.TrueKeyword, columns: cols });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { tables, unreadable };
}

/** `[name, wire type]` of each `name: t.…` of a parameters object literal; null when one is not of that form. */
function paramsOf(obj: ts.ObjectLiteralExpression, source: ts.SourceFile): ReducerParam[] | null {
  const params: ReducerParam[] = [];
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return null;
    params.push([p.name.text, wireType(p.initializer.getText(source))]);
  }
  return params;
}

/**
 * Every `spacetimedb.reducer(…)` in `files`, in any of its forms — `(params, fn)`,
 * `(fn)`, `(opts, params, fn)`, `(opts, fn)` — named by `opts.name` or else by
 * the `const` it is assigned to (index.ts exports it under that name, directly
 * or from a define…Reducers factory).
 */
export function readModuleReducers(files: ReadonlyArray<{ path: string; text: string }>): ModuleReducers {
  const reducers = new Map<string, ModuleReducer>();
  const unreadable: string[] = [];
  for (const { path, text } of files) {
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "reducer"
        && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "spacetimedb") {
        const at = `${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
        const args = node.arguments.map(bare);
        const objects = args.filter(ts.isObjectLiteralExpression);
        // Options carry a literal `name` (or `onSchedule`); parameters are `name: t.…` builders.
        const isOpts = (o: ts.ObjectLiteralExpression) => {
          const n = property(o, "name");
          return (!!n && ts.isStringLiteralLike(bare(n.initializer))) || !!property(o, "onSchedule");
        };
        const opts = objects.length === 2 || (objects.length === 1 && isOpts(objects[0])) ? objects[0] : undefined;
        const paramsObj = objects.length === 2 ? objects[1] : objects.length === 1 && !opts ? objects[0] : undefined;
        const optsName = opts ? property(opts, "name") : undefined;
        const declared = ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name) ? node.parent.name.text : undefined;
        const name = optsName && ts.isStringLiteralLike(bare(optsName.initializer))
          ? (bare(optsName.initializer) as ts.StringLiteral).text : declared;
        const params = paramsObj ? paramsOf(paramsObj, source) : [];
        if (name === undefined) {
          unreadable.push(`${at}: reducer neither assigned to a const nor named by a literal \`name\``);
        } else if (params === null || objects.length !== args.length - 1) {
          unreadable.push(`${at}: ${name} parameters are not an object literal of \`name: t.…\``);
        } else {
          if (reducers.has(name)) unreadable.push(`${at}: reducer ${name} is defined twice`);
          reducers.set(name, { name, file: path, params });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { reducers, unreadable };
}
