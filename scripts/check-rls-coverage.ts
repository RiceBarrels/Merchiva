/**
 * Fail if any public SpacetimeDB table has no row-level-security rule.
 *
 * In SpacetimeDB a table with no `clientVisibilityFilter` is readable in full by
 * anyone who can reach the database — over the WebSocket *and* over the
 * unauthenticated HTTP /sql endpoint, whose database id ships in the client
 * bundle as NEXT_PUBLIC_SPACETIMEDB_MODULE. The dangerous state is the default
 * one, and it is invisible: nothing errors, the table is just open.
 *
 * So adding a table must be accompanied by adding it to one of the RLS lists in
 * spacetimedb/src/index.ts. This script is what notices when it wasn't.
 *
 *   bun run check:rls
 *
 * Tables may be defined in any file under spacetimedb/src (Drive's live in
 * src/drive/tables.ts), so every module file is read; the rules themselves stay
 * in index.ts. An optional argument points the check at a copy of the module
 * source directory (the tests use it for negative cases).
 *
 * The source is PARSED (TypeScript syntax tree), not pattern-matched. Regexes
 * over the raw text counted a rule written in a comment as coverage, and never
 * saw a table laid out differently (`public` before `name`, one line, double
 * quotes). A syntax tree has no comments and no layout, and anything this script
 * cannot read is reported as UNCHECKED rather than skipped.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import ts from "typescript";

const SRC_DIR = process.argv[2] ?? "spacetimedb/src";
const SRC = `${SRC_DIR}/index.ts`;

function moduleFiles(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((f) => {
    const p = `${dir}/${f}`;
    return statSync(p).isDirectory() ? moduleFiles(p) : p.endsWith(".ts") ? [p] : [];
  });
}
const FILES = moduleFiles(SRC_DIR).map((p) =>
  ts.createSourceFile(p, readFileSync(p, "utf8"), ts.ScriptTarget.Latest, true),
);
const INDEX: ts.SourceFile = FILES.find((f) => f.fileName === SRC) ?? missing(SRC);

function missing(path: string): never {
  console.error(`${path} not found.`);
  process.exit(1);
}

/** Definitions this script cannot read, so cannot vouch for. Each one fails the check. */
const unchecked: string[] = [];

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}
function loc(node: ts.Node): string {
  const file = node.getSourceFile();
  return `${file.fileName}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`;
}
/** Strips `(x)`, `x as T` and `x satisfies T`. */
function bare(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
}
/** `key`'s value in an object literal; the last one wins, as in JS. */
function property(obj: ts.ObjectLiteralExpression, key: string): ts.Expression | undefined {
  let value: ts.Expression | undefined;
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === key) {
      value = bare(p.initializer);
    }
  }
  return value;
}
/** A string literal, or a `+` chain of them; undefined for anything computed. */
function literal(e: ts.Expression | undefined): string | undefined {
  if (!e) return undefined;
  e = bare(e);
  if (ts.isStringLiteralLike(e)) return e.text;
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const [l, r] = [literal(e.left), literal(e.right)];
    return l === undefined || r === undefined ? undefined : l + r;
  }
  return undefined;
}

// ─── Tables ──────────────────────────────────────────────────────────────────

const publicTables = new Set<string>();
const privateTables = new Set<string>();
const columnTypes: Record<string, Record<string, string>> = {};
const indexedColumns: Record<string, Set<string>> = {};

/** Every `table(options, columns)` call. Anything but a literal `public: false` counts as public. */
function readTable(call: ts.CallExpression): void {
  const [options, columns] = call.arguments.map(bare);
  const opts = options && ts.isObjectLiteralExpression(options) ? options : undefined;
  const name = opts && literal(property(opts, "name"));
  const at = `${name ?? "table(…)"} at ${loc(call)}`;
  if (!opts || name === undefined) {
    unchecked.push(`${at} — no literal \`name\` in a plain options object`);
    return;
  }
  if (!opts.properties.every(ts.isPropertyAssignment)) unchecked.push(`${at} — options use a spread or shorthand`);
  const flag = property(opts, "public")?.kind;
  if (flag !== ts.SyntaxKind.TrueKeyword && flag !== ts.SyntaxKind.FalseKeyword) {
    unchecked.push(`${at} — \`public\` is not literally true or false`);
  }
  (flag === ts.SyntaxKind.FalseKeyword ? privateTables : publicTables).add(name);

  const types: Record<string, string> = (columnTypes[name] = {});
  const indexed = (indexedColumns[name] = new Set<string>());
  if (!columns || !ts.isObjectLiteralExpression(columns)) {
    unchecked.push(`${at} — columns are not an object literal`);
    return;
  }
  for (const p of columns.properties) {
    if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
      unchecked.push(`${at} — column \`${p.getText()}\` is not \`name: t.…\``);
      continue;
    }
    const type = p.initializer.getText().replace(/\s+/g, " ");
    types[p.name.text] = type;
    // A primary key, a unique constraint or a column index is itself an index.
    if (/\.(?:primaryKey|unique|index)\(/.test(type)) indexed.add(p.name.text);
  }
  // Explicit indexes: `columns: ['a', 'b']`, or `column: 'a'` for a direct index.
  const indexes = property(opts, "indexes");
  if (indexes && !ts.isArrayLiteralExpression(indexes)) unchecked.push(`${at} — \`indexes\` is not an array literal`);
  for (const idx of indexes && ts.isArrayLiteralExpression(indexes) ? indexes.elements.map(bare) : []) {
    const list = ts.isObjectLiteralExpression(idx) ? property(idx, "columns") : undefined;
    const one = ts.isObjectLiteralExpression(idx) ? property(idx, "column") : undefined;
    const cols = list && ts.isArrayLiteralExpression(list) ? list.elements.map(literal) : [literal(one)];
    if (cols.every((c) => c !== undefined)) for (const c of cols) indexed.add(c);
    else unchecked.push(`${at} — index \`${idx.getText()}\` has no literal columns`);
  }
}

/** Local names `table` is imported under, and namespaces it could be reached through. */
function tableCallees(file: ts.SourceFile): { names: Set<string>; namespaces: Set<string> } {
  const names = new Set<string>();
  const namespaces = new Set<string>();
  for (const stmt of file.statements) {
    const bindings = ts.isImportDeclaration(stmt) ? stmt.importClause?.namedBindings : undefined;
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) if ((el.propertyName ?? el.name).text === "table") names.add(el.name.text);
    }
  }
  return { names, namespaces };
}

// ─── Rules ───────────────────────────────────────────────────────────────────

interface LiteralRule { table: string; sql: string; aliases: Map<string, string> }

function parseRule(sql: string): LiteralRule | undefined {
  const from = /\bFROM\s+([a-z_0-9]+)(?:\s+(?!WHERE\b|JOIN\b)([a-z_0-9]+))?/i.exec(sql);
  if (!from) return undefined;
  const aliases = new Map<string, string>([[from[1], from[1]]]);
  if (from[2]) aliases.set(from[2], from[1]);
  for (const j of sql.matchAll(/\bJOIN\s+([a-z_0-9]+)\s+([a-z_0-9]+)\s+ON\b/gi)) aliases.set(j[2], j[1]);
  return { table: from[1], sql, aliases };
}
function isRuleCall(e: ts.Expression): e is ts.CallExpression {
  if (!ts.isCallExpression(e)) return false;
  return /(?:^|\.)clientVisibilityFilter\.sql$/.test(e.expression.getText().replace(/\s+/g, ""));
}

/**
 * One pass over every file reads each `table(...)` and each literal rule
 * (`clientVisibilityFilter.sql(...)` whose SQL is a literal; the list-driven
 * loops are checked through their lists) — in ANY file, registered or not — so
 * that any rule, whatever its name, is checked for indexed join columns,
 * comparable columns, and for being a rule on a join target. These rules do NOT
 * count as coverage: see `handWritten`.
 */
const literalRules: LiteralRule[] = [];
for (const file of FILES) {
  const { names, namespaces } = tableCallees(file);
  walk(file, (n) => {
    if (!ts.isCallExpression(n)) return;
    const callee = n.expression;
    if (
      ts.isIdentifier(callee) ? names.has(callee.text)
        : ts.isPropertyAccessExpression(callee) && callee.name.text === "table" &&
          ts.isIdentifier(callee.expression) && namespaces.has(callee.expression.text)
    ) readTable(n);
    if (!isRuleCall(n)) return;
    const sql = literal(n.arguments[0]);
    if (sql === undefined) return;
    const rule = parseRule(sql);
    if (rule) literalRules.push(rule);
    else unchecked.push(`rule at ${loc(n)} — no \`FROM <table>\` in its SQL`);
  });
}
const literalRuleTables = new Set(literalRules.map((r) => r.table));

/**
 * Hand-written rules: the tables of the literal rules REGISTERED in index.ts —
 * `rlsRules.<any name> = spacetimedb.clientVisibilityFilter.sql(<literal>)` at
 * top level — credited to the table in their FROM clause, not to their name.
 * A rule in a comment, in a constant never assigned to `rlsRules`, or in another
 * file creates no policy, so it covers nothing. Interpolated SQL is only
 * accepted inside a top-level `for … of` (the list loops, covered via the lists).
 */
const handWritten = new Set<string>();
walk(INDEX, (n) => {
  if (!ts.isBinaryExpression(n) || n.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
  const target = n.left;
  if (!(ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target))) return;
  if (!ts.isIdentifier(target.expression) || target.expression.text !== "rlsRules") return;
  const stmt = n.parent;
  const inLoop = ts.isBlock(stmt.parent) && ts.isForOfStatement(stmt.parent.parent) &&
    ts.isSourceFile(stmt.parent.parent.parent);
  const value = bare(n.right);
  if (!ts.isExpressionStatement(stmt) || !(ts.isSourceFile(stmt.parent) || inLoop) || !isRuleCall(value)) {
    unchecked.push(
      `rule at ${loc(n)} — not a top-level \`rlsRules.<name> = spacetimedb.clientVisibilityFilter.sql(…)\``,
    );
    return;
  }
  const sql = literal(value.arguments[0]);
  const rule = sql === undefined ? undefined : parseRule(sql);
  if (rule) handWritten.add(rule.table);
  else if (sql === undefined && !inLoop) unchecked.push(`rule at ${loc(n)} — interpolated SQL outside a list loop`);
});
/** Nothing in `rlsRules` exists unless the module exports it. */
const rulesExported = INDEX.statements.some((s) =>
  ts.isVariableStatement(s) && s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
  s.declarationList.declarations.some((d) =>
    d.initializer !== undefined && /\.exportGroup\(rlsRules\)$/.test(d.initializer.getText().replace(/\s+/g, ""))),
);

// ─── Lists (index.ts) ────────────────────────────────────────────────────────

/** The elements of the top-level `const <name> = [ … ]` in index.ts. */
function listElements(name: string): ts.Expression[] {
  for (const stmt of INDEX.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || d.name.text !== name) continue;
      const init = d.initializer && bare(d.initializer);
      if (init && ts.isArrayLiteralExpression(init)) return init.elements.map(bare);
      unchecked.push(`${name} at ${loc(d)} — not an array literal`);
    }
  }
  return [];
}
/** `[table, column]` entries; a bare `'table'` takes `fallback` as its column when one is given. */
function pairList(name: string, fallback?: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const e of listElements(name)) {
    const [table, column] = ts.isArrayLiteralExpression(e) && e.elements.length === 2
      ? e.elements.map(literal) : [literal(e), fallback];
    if (table !== undefined && column !== undefined) pairs.push([table, column]);
    else unchecked.push(`${name} entry \`${e.getText()}\` at ${loc(e)} — not a literal table/column`);
  }
  return pairs;
}
function tableList(name: string): Set<string> {
  const tables = new Set<string>();
  for (const e of listElements(name)) {
    const table = literal(e);
    if (table !== undefined) tables.add(table);
    else unchecked.push(`${name} entry \`${e.getText()}\` at ${loc(e)} — not a literal table`);
  }
  return tables;
}

// RLS_ORG_SCOPED entries are `'table'` or `['table', 'column']`.
const orgPairs = pairList("RLS_ORG_SCOPED", "organizationId");
const orgScoped = new Set(orgPairs.map(([t]) => t));
const selfPairs = pairList("RLS_SELF_SCOPED");
const selfScoped = new Set(selfPairs.map(([t]) => t));
// The Docs family: joined to document_reader_index on the listed column. During
// publish phase A the same tables are also in RLS_ORG_SCOPED; that is allowed.
const readerPairs = pairList("RLS_DOC_READER_SCOPED");
const readerScoped = new Set(readerPairs.map(([t]) => t));
const noClientAccess = tableList("RLS_NO_CLIENT_ACCESS");
const unfiltered = tableList("RLS_UNFILTERED");

/**
 * RLS_NO_CLIENT_ACCESS is NOT a rule.
 *
 * Listing a table there and leaving it `public: true` is the world-readable
 * case this script exists to catch — and it used to be counted as covered, so
 * nine tables holding customer PII passed the check with no rule at all.
 * Membership of that list only means anything once the table is private, and a
 * private table needs no rule anyway. So: count nothing from it, and report any
 * entry that is still public as an error of its own.
 */
const stillPublicNoAccess = [...noClientAccess].filter((t) => publicTables.has(t)).sort();

const covered = new Set([...orgScoped, ...selfScoped, ...readerScoped, ...handWritten, ...unfiltered]);

/**
 * A rule that touches a `t.option(...)` column is rejected at PUBLISH time with
 *   Unexpected type: (expected) String != (some: String | none: ())
 * and the whole publish is aborted — after the CLI has already printed every
 * policy it intended to create, which makes the cause easy to miss. Catch it
 * here instead. (`role_task` scopes on the `orgId` mirror for this reason.)
 */
const optionRefs = new Set<string>();
function requireComparable(table: string, column: string) {
  const type = columnTypes[table]?.[column];
  if (type === undefined) optionRefs.add(`${table}.${column} — no such column`);
  else if (type.includes("option")) optionRefs.add(`${table}.${column} — ${type}`);
}
for (const [table, column] of [...orgPairs, ...selfPairs, ...readerPairs]) requireComparable(table, column);

/**
 * A self-scoped rule is `WHERE <column> = :sender`, and :sender is an Identity:
 * a string column holding the identity's hex never matches it (the dialect has
 * no conversion), so the rule would hide every row, or fail to publish.
 */
const nonIdentitySelf = selfPairs
  .filter(([table, column]) => { const type = columnTypes[table]?.[column]; return type !== undefined && !type.startsWith("t.identity("); })
  .map(([table, column]) => `${table}.${column} — ${columnTypes[table][column]}`);
// Base-table predicate columns of the hand-written Drive rules.
for (const [table, column] of [
  ["drive_item", "space"], ["drive_item", "trashed"], ["drive_item", "status"],
  ["drive_item", "uploaderIdentity"], ["drive_notice_ack", "userId"],
] as const) {
  if (columnTypes[table]) requireComparable(table, column);
}

/**
 * Every RLS join column must be indexed on BOTH sides. A subscription against a
 * table whose rule joins an unindexed column is rejected at runtime with
 *   Subscriptions require indexes on join columns
 * and because rules are unioned per table, one bad rule makes that table
 * unsubscribable for every client — the screen just hangs on its loading state.
 * Publish does not catch this; only an actual subscription does.
 */
const unindexed = new Map<string, string>();
function requireIndex(table: string, column: string, why: string) {
  if (!columnTypes[table]) return;
  const key = `${table}.${column}`;
  if (!indexedColumns[table]?.has(column) && !unindexed.has(key)) unindexed.set(key, `${key} — ${why}`);
}
for (const [table, column] of orgPairs) {
  requireIndex(table, column, "joined by its org-scoped rule");
}
for (const [table, column] of readerPairs) {
  requireIndex(table, column, "joined by its reader rule");
}
requireIndex("org_member", "organizationId", "join target of every org-scoped rule");
requireIndex("org_member", "userId", "matched against :sender by most rules");
requireIndex("organization", "orgIdText", "joined by the organization rule");
requireIndex("user", "identity", "joined by the user colleague rule");
requireIndex("chat_member", "conversationId", "joined by both chat rules");
requireIndex("chat_message", "conversationId", "joined by the chat_message rule");
requireIndex("org_membership_index", "memberId", "joined by the drive_item owner and drive_notice_ack mine rules");
requireIndex("org_membership_index", "organizationId", "join target of every org-scoped rule");
requireIndex("org_membership_index", "userId", "matched against :sender by the org rules");
requireIndex("drive_item", "ownerMemberId", "joined by the drive_item owner rule");
requireIndex("drive_item", "organizationId", "joined by the drive_item store rule");
requireIndex("drive_item", "adminScope", "joined by the drive_item admin rule");
requireIndex("drive_admin_index", "adminScope", "join target of the drive_item admin rule");
requireIndex("drive_admin_index", "userId", "matched against :sender by the drive_item admin rule");
requireIndex("document_reader_index", "documentId", "join target of every Docs-family rule");
requireIndex("document_reader_index", "userId", "matched against :sender by every Docs-family rule");
requireIndex("drive_notice_ack", "memberId", "joined by the drive_notice_ack mine rule");
requireIndex("drive_service_reader", "scope", "join target of the service rules");
requireIndex("drive_blob_gc", "scope", "joined by the drive_blob_gc service rule");
requireIndex("drive_usage", "scope", "joined by the drive_usage service rule");
requireIndex("device_login_request", "id", "joined by the device_login_request requester rule");
requireIndex("device_login_requester", "requestId", "join target of the device_login_request requester rule");
requireIndex("device_login_requester", "requesterIdentity", "matched against :sender by the device_login_request rule");

// The same two checks, derived from the SQL of every literal rule.
for (const rule of literalRules) {
  const why = `joined by a rule on ${rule.table}`;
  for (const j of rule.sql.matchAll(/\bON\s+([a-z_0-9]+)\.(\w+)\s*=\s*([a-z_0-9]+)\.(\w+)/gi)) {
    for (const [alias, column] of [[j[1], j[2]], [j[3], j[4]]]) {
      const table = rule.aliases.get(alias);
      if (!table) continue;
      requireIndex(table, column, why);
      requireComparable(table, column);
    }
  }
  const where = /\bWHERE\s+([\s\S]*)$/i.exec(rule.sql)?.[1] ?? "";
  for (const term of where.split(/\s+(?:AND|OR)\s+/i)) {
    const lhs = /^\(?\s*(?:([a-z_0-9]+)\.)?(\w+)\s*(?:=|!=|<>|<=|>=|<|>)/i.exec(term.trim());
    if (!lhs) continue;
    const table = lhs[1] ? rule.aliases.get(lhs[1]) : rule.table;
    if (table) requireComparable(table, lhs[2]);
  }
}

/**
 * Join targets must stay rule-free. A rule on a table that other rules JOIN
 * makes every joining table unsubscribable ("Subscriptions require indexes on
 * join columns", reproduced on standalone 2.10.1) while HTTP /sql keeps working,
 * so publish does not notice. They must stay public too: a rule that references
 * a private table fails to evaluate.
 */
const RULE_FREE_JOIN_TARGETS = [
  "org_membership_index", "chat_membership_index", "drive_admin_index",
  "document_reader_index", "drive_service_reader", "device_login_requester",
];
const ruled = new Set([...orgScoped, ...selfScoped, ...readerScoped, ...handWritten, ...literalRuleTables]);
const ruledTargets = RULE_FREE_JOIN_TARGETS.filter((t) => ruled.has(t));
const privateTargets = RULE_FREE_JOIN_TARGETS.filter((t) => privateTables.has(t));

const uncovered = [...publicTables].filter((t) => !covered.has(t)).sort();
const ghosts = [...covered].filter((t) => !publicTables.has(t) && !privateTables.has(t)).sort();

console.log(
  `${publicTables.size} public / ${privateTables.size} private tables; ` +
  `${orgScoped.size} org-scoped, ${selfScoped.size} self-scoped, ${readerScoped.size} reader-scoped, ` +
  `${noClientAccess.size} no-client-access, ${handWritten.size} hand-written rules.`,
);

let failed = false;
if (uncovered.length) {
  failed = true;
  console.error(
    `\nWORLD-READABLE: ${uncovered.length} public table(s) have no RLS rule:\n` +
    uncovered.map((t) => `  - ${t}`).join("\n") +
    `\n\nAdd each to a list in ${SRC}, or set public: false, or — if it really is` +
    `\nmeant to be world-readable — add it to RLS_UNFILTERED with a reason.`,
  );
}
if (!rulesExported) {
  failed = true;
  console.error(
    `\nUNREGISTERED: ${SRC} never exports rlsRules, so none of its rules exist.` +
    `\nKeep \`export const rowLevelSecurity = spacetimedb.exportGroup(rlsRules);\`.`,
  );
}
if (stillPublicNoAccess.length) {
  failed = true;
  console.error(
    `\nWORLD-READABLE: ${stillPublicNoAccess.length} RLS_NO_CLIENT_ACCESS table(s) are ` +
    `still public:\n` +
    stillPublicNoAccess.map((t) => `  - ${t}`).join("\n") +
    `\n\nThat list is not a rule. A public table with no rule is readable by ` +
    `anyone,\nincluding over the unauthenticated /v1/database/<id>/sql endpoint. ` +
    `Set\npublic: false on each.`,
  );
}
if (unindexed.size) {
  failed = true;
  console.error(
    `\nUNSUBSCRIBABLE: ${unindexed.size} RLS join column(s) are not indexed:\n` +
    [...unindexed.values()].map((r) => `  - ${r}`).join("\n") +
    `\n\nAdd a btree index on each, or every client's subscription to that table` +
    `\nwill hang. Publish will NOT report this.`,
  );
}
if (ruledTargets.length) {
  failed = true;
  console.error(
    `\nUNSUBSCRIBABLE: join targets carry a rule of their own:\n` +
    ruledTargets.map((t) => `  - ${t}`).join("\n") +
    `\n\nEvery table whose rule joins these would hang on subscribe. Keep them ` +
    `rule-free\n(RLS_UNFILTERED, with the KNOWN GAP note) and minimal in what they hold.`,
  );
}
if (privateTargets.length) {
  failed = true;
  console.error(
    `\nUNEVALUABLE: join targets are private:\n` +
    privateTargets.map((t) => `  - ${t}`).join("\n") +
    `\n\nA rule that references a private table fails to evaluate. Keep them public.`,
  );
}
if (optionRefs.size) {
  failed = true;
  const refs = [...optionRefs];
  console.error(
    `\nUNPUBLISHABLE: ${refs.length} RLS rule(s) reference a column that ` +
    `SpacetimeDB SQL cannot compare:\n` +
    refs.map((r) => `  - ${r}`).join("\n") +
    `\n\nAn option column can never appear in a filter or a join. Add a ` +
    `non-option\nmirror column (t.string().default('')), backfill it, and scope ` +
    `on that:\n  ['${refs[0].split(".")[0]}', 'orgId']`,
  );
}
if (nonIdentitySelf.length) {
  failed = true;
  console.error(
    `\nUNMATCHABLE: RLS_SELF_SCOPED entries whose column is not t.identity():\n` +
    nonIdentitySelf.map((r) => `  - ${r}`).join("\n") +
    `\n\n\`WHERE <column> = :sender\` compares an Identity. Scope on an identity column.`,
  );
}
if (unchecked.length) {
  failed = true;
  console.error(
    `\nUNCHECKED: ${unchecked.length} definition(s) this script cannot read:\n` +
    unchecked.map((u) => `  - ${u}`).join("\n") +
    `\n\nWrite tables as \`table({ name: '<t>', public: true|false, … }, { col: t.…(), … })\` ` +
    `with literal\nvalues, list entries as literals, and rules as top-level ` +
    `\`rlsRules.<name> = spacetimedb.clientVisibilityFilter.sql(…)\`\nin ${SRC}.`,
  );
}
if (ghosts.length) {
  failed = true;
  console.error(`\nRules reference tables that do not exist:\n` + ghosts.map((t) => `  - ${t}`).join("\n"));
}
if (failed) process.exit(1);
console.log("Every public table is covered by a row-level-security rule.");
