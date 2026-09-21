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
 */
import { readFileSync } from "node:fs";

const SRC = "spacetimedb/src/index.ts";
const src = readFileSync(SRC, "utf8");

const publicTables = new Set<string>();
const privateTables = new Set<string>();
for (const m of src.matchAll(/name: '([a-z_0-9]+)',\s*\n\s*public: (true|false)/g)) {
  (m[2] === "true" ? publicTables : privateTables).add(m[1]);
}

/**
 * Parse each `table(...)` definition. The options object contains an `indexes`
 * array of objects, so a lazy `\{...\}` regex stops at the first inner brace and
 * silently sees only the first index — which is how four missing indexes got
 * past this check once. Match braces properly instead.
 */
const columnTypes: Record<string, Record<string, string>> = {};
const indexedColumns: Record<string, Set<string>> = {};

for (const m of src.matchAll(/const \w+Table = table\(/g)) {
  const start = m.index! + m[0].length;
  const end = src.indexOf("\n);", start);
  if (end < 0) continue;
  const body = src.slice(start, end);
  const name = /name: '([a-z_0-9]+)'/.exec(body)?.[1];
  if (!name) continue;

  columnTypes[name] = {};
  indexedColumns[name] = new Set();

  // Columns: `    someCol: t.something(...)` at exactly four spaces of indent.
  for (const col of body.matchAll(/^ {4}(\w+):\s*(t\.[^,\n]+)/gm)) {
    const [, colName, colType] = col;
    columnTypes[name][colName] = colType.trim();
    // A primary key or unique constraint is itself an index.
    if (/primaryKey\(|unique\(/.test(colType)) indexedColumns[name].add(colName);
  }
  // Explicit indexes: `columns: ['a', 'b']`.
  for (const idx of body.matchAll(/columns:\s*\[([^\]]+)\]/g)) {
    for (const c of idx[1].matchAll(/'(\w+)'/g)) indexedColumns[name].add(c[1]);
  }
}

function arrayLiteral(name: string): Set<string> {
  const m = new RegExp(`const ${name}[^=]*= \\[([\\s\\S]*?)\\];`).exec(src);
  return new Set(m ? [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]) : []);
}

// RLS_ORG_SCOPED entries are `'table'` or `['table', 'column']`.
const orgBlock = /const RLS_ORG_SCOPED[^=]*= \[([\s\S]*?)\];/.exec(src);
const orgPairs: Array<[string, string]> = [];
if (orgBlock) {
  for (const entry of orgBlock[1].matchAll(/\['([a-z_0-9]+)', '(\w+)'\]|'([a-z_0-9]+)'/g)) {
    orgPairs.push(entry[1] ? [entry[1], entry[2]] : [entry[3], "organizationId"]);
  }
}
const orgScoped = new Set(orgPairs.map(([t]) => t));
const noClientAccess = arrayLiteral("RLS_NO_CLIENT_ACCESS");
const unfiltered = arrayLiteral("RLS_UNFILTERED");

const selfBlock = /RLS_SELF_SCOPED[^=]*= \[([\s\S]*?)\];/.exec(src);
const selfScoped = new Set(
  selfBlock ? [...selfBlock[1].matchAll(/\['([a-z_0-9]+)', '\w+'\]/g)].map((x) => x[1]) : [],
);

const handWritten = new Set(
  [...src.matchAll(/rlsRules\.rls_([a-z_0-9]+?)_(?:self|colleagues|owner|member|peers|mine)\s*=/g)]
    .map((x) => x[1]),
);

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

const covered = new Set([
  ...orgScoped, ...selfScoped, ...handWritten, ...unfiltered,
]);

/**
 * A rule that touches a `t.option(...)` column is rejected at PUBLISH time with
 *   Unexpected type: (expected) String != (some: String | none: ())
 * and the whole publish is aborted — after the CLI has already printed every
 * policy it intended to create, which makes the cause easy to miss. Catch it
 * here instead. (`role_task` scopes on the `orgId` mirror for this reason.)
 */
const optionRefs: string[] = [];
for (const [table, column] of [...orgPairs, ...[...selfScoped].map((t): [string, string] => {
  const m = new RegExp(`\\['${t}', '(\\w+)'\\]`).exec(selfBlock?.[1] ?? "");
  return [t, m ? m[1] : ""];
})]) {
  const type = columnTypes[table]?.[column];
  if (type === undefined) optionRefs.push(`${table}.${column} — no such column`);
  else if (type.includes("option")) optionRefs.push(`${table}.${column} — ${type}`);
}

/**
 * Every RLS join column must be indexed on BOTH sides. A subscription against a
 * table whose rule joins an unindexed column is rejected at runtime with
 *   Subscriptions require indexes on join columns
 * and because rules are unioned per table, one bad rule makes that table
 * unsubscribable for every client — the screen just hangs on its loading state.
 * Publish does not catch this; only an actual subscription does.
 */
const unindexed: string[] = [];
function requireIndex(table: string, column: string, why: string) {
  if (!columnTypes[table]) return;
  if (!indexedColumns[table]?.has(column)) unindexed.push(`${table}.${column} — ${why}`);
}
for (const [table, column] of orgPairs) {
  requireIndex(table, column, "joined by its org-scoped rule");
}
requireIndex("org_member", "organizationId", "join target of every org-scoped rule");
requireIndex("org_member", "userId", "matched against :sender by most rules");
requireIndex("organization", "orgIdText", "joined by the organization rule");
requireIndex("user", "identity", "joined by the user colleague rule");
requireIndex("chat_member", "conversationId", "joined by both chat rules");
requireIndex("chat_message", "conversationId", "joined by the chat_message rule");

const uncovered = [...publicTables].filter((t) => !covered.has(t)).sort();
const ghosts = [...covered].filter((t) => !publicTables.has(t) && !privateTables.has(t)).sort();

console.log(
  `${publicTables.size} public / ${privateTables.size} private tables; ` +
  `${orgScoped.size} org-scoped, ${selfScoped.size} self-scoped, ` +
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
if (unindexed.length) {
  failed = true;
  console.error(
    `\nUNSUBSCRIBABLE: ${unindexed.length} RLS join column(s) are not indexed:\n` +
    unindexed.map((r) => `  - ${r}`).join("\n") +
    `\n\nAdd a btree index on each, or every client's subscription to that table` +
    `\nwill hang. Publish will NOT report this.`,
  );
}
if (optionRefs.length) {
  failed = true;
  console.error(
    `\nUNPUBLISHABLE: ${optionRefs.length} RLS rule(s) reference a column that ` +
    `SpacetimeDB SQL cannot compare:\n` +
    optionRefs.map((r) => `  - ${r}`).join("\n") +
    `\n\nAn option column can never appear in a filter or a join. Add a ` +
    `non-option\nmirror column (t.string().default('')), backfill it, and scope ` +
    `on that:\n  ['${optionRefs[0].split(".")[0]}', 'orgId']`,
  );
}
if (ghosts.length) {
  failed = true;
  console.error(`\nRules reference tables that do not exist:\n` + ghosts.map((t) => `  - ${t}`).join("\n"));
}
if (failed) process.exit(1);
console.log("Every public table is covered by a row-level-security rule.");
