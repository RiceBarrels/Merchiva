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

/** Column type per table, e.g. columnTypes["role_task"]["organizationId"]. */
const columnTypes: Record<string, Record<string, string>> = {};
for (const block of src.matchAll(
  /const \w+Table = table\(\s*\{([\s\S]*?)\}\s*,\s*\{([\s\S]*?)\n  \}\s*\)/g,
)) {
  const name = /name: '([a-z_0-9]+)'/.exec(block[1])?.[1];
  if (!name) continue;
  columnTypes[name] = {};
  for (const col of block[2].matchAll(/^ {4}(\w+):\s*(t\.[^,\n]+)/gm)) {
    columnTypes[name][col[1]] = col[2].trim();
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
const serviceOnly = arrayLiteral("RLS_SERVICE_ONLY");
const unfiltered = arrayLiteral("RLS_UNFILTERED");

const selfBlock = /RLS_SELF_SCOPED[^=]*= \[([\s\S]*?)\];/.exec(src);
const selfScoped = new Set(
  selfBlock ? [...selfBlock[1].matchAll(/\['([a-z_0-9]+)', '\w+'\]/g)].map((x) => x[1]) : [],
);

const handWritten = new Set(
  [...src.matchAll(/rlsRules\.rls_([a-z_0-9]+?)_(?:self|colleagues|owner|member|peers|mine)\s*=/g)]
    .map((x) => x[1]),
);

const covered = new Set([
  ...orgScoped, ...serviceOnly, ...selfScoped, ...handWritten, ...unfiltered,
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

const uncovered = [...publicTables].filter((t) => !covered.has(t)).sort();
const ghosts = [...covered].filter((t) => !publicTables.has(t) && !privateTables.has(t)).sort();

console.log(
  `${publicTables.size} public / ${privateTables.size} private tables; ` +
  `${orgScoped.size} org-scoped, ${selfScoped.size} self-scoped, ` +
  `${serviceOnly.size} service-only, ${handWritten.size} hand-written rules.`,
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
