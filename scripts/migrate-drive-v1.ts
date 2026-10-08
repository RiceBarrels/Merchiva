/**
 * Drive v1 data migration. Run once right after "Publish A" of the Drive module
 * (the additive publish), and before "Publish B" drops the Docs tables from the
 * org-scoped RLS list — until it has run, document_reader_index is empty and
 * Publish B would hide every document from everyone.
 *
 *   bun scripts/migrate-drive-v1.ts                          # DRY RUN (the default): prints the plan, changes nothing
 *   bun scripts/migrate-drive-v1.ts --apply                  # runs both steps against the target
 *   bun scripts/migrate-drive-v1.ts --apply --org=<uuid>     # re-runs the backfill for one organization only
 *
 *   --server <url | maincloud>   default: NEXT_PUBLIC_SPACETIMEDB_URI (Bun loads .env.local)
 *   --database <name | identity> default: NEXT_PUBLIC_SPACETIMEDB_MODULE
 *   --token-env <NAME>           env var holding the service token (default SPACETIMEDB_SERVICE_TOKEN)
 *   --yes-production             REQUIRED to target maincloud (any *.spacetimedb.com host), dry run included
 *
 * Steps (with --apply; the service identity passes both). SpacetimeDB's HTTP
 * name splits the trailing digit: migrateOwnerPermissionsV1 is
 * `migrate_owner_permissions_v_1` (as lib/spacetimedb/generated names it).
 *   1. migrate_owner_permissions_v_1(false) — every owner gets the new `drive` permission boxes.
 *   2. backfill_drive_access_v_1(org | '')  — fills drive_admin_index and document_reader_index
 *      and records the counts in migration_state 'drive_access_v1'.
 * Both are idempotent: re-running only rebuilds and re-reports.
 *
 * migration_state is a private table, so only the database owner can read the
 * result: the script prints the `spacetime sql` command. Check that
 * drive_access_v1 shows readerRows > 0 before Publish B.
 */

const MAINCLOUD = "https://maincloud.spacetimedb.com";
const DATABASE_RE = /^([a-z0-9]+(-[a-z0-9]+)*|[0-9a-f]{64})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Options {
  apply: boolean;
  yesProduction: boolean;
  server: string;
  database: string;
  organizationId: string;
  tokenEnv: string;
}

interface Step { reducer: string; args: unknown[]; what: string }

function fail(message: string, code = 1): never {
  console.error(`\n✗ ${message}`);
  process.exit(code);
}

function usage(): string {
  return "Usage: bun scripts/migrate-drive-v1.ts [--apply] [--org=<uuid>] [--server=<url|maincloud>] " +
    "[--database=<name>] [--token-env=<NAME>] [--yes-production]";
}

function parseOptions(argv: readonly string[]): Options {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      console.log(usage());
      process.exit(0);
    }
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!match) fail(`Unexpected argument '${arg}'.\n${usage()}`, 2);
    const [, name, inline] = match;
    if (name === "apply" || name === "yes-production") {
      if (inline !== undefined) fail(`--${name} takes no value.`, 2);
      flags.add(name);
    } else if (name === "org" || name === "server" || name === "database" || name === "token-env") {
      const value = inline ?? argv[++i];
      if (value === undefined || value.startsWith("--")) fail(`--${name} needs a value.`, 2);
      values.set(name, value);
    } else {
      fail(`Unknown option --${name}.\n${usage()}`, 2);
    }
  }
  const rawServer = values.get("server") ?? process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? MAINCLOUD;
  return {
    apply: flags.has("apply"),
    yesProduction: flags.has("yes-production"),
    server: httpBase(rawServer),
    database: (values.get("database") ?? process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ?? "").trim(),
    organizationId: (values.get("org") ?? process.env.ONLY_ORG ?? "").trim().toLowerCase(),
    tokenEnv: values.get("token-env") ?? "SPACETIMEDB_SERVICE_TOKEN",
  };
}

/** The HTTP origin of a server: `maincloud`, or a ws(s)/http(s) URL. */
function httpBase(raw: string): string {
  const value = raw.trim() === "maincloud" ? MAINCLOUD : raw.trim();
  let url: URL;
  try {
    url = new URL(value.replace(/^ws:/, "http:").replace(/^wss:/, "https:"));
  } catch {
    fail(`--server '${raw}' is not a URL (or 'maincloud').`, 2);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") fail(`--server '${raw}' must be http(s) or ws(s).`, 2);
  return url.origin;
}

/** Maincloud, or any other host of spacetimedb.com: production. */
function isProduction(server: string): boolean {
  const host = new URL(server).hostname.toLowerCase();
  return host === "spacetimedb.com" || host.endsWith(".spacetimedb.com");
}

/** The identity a SpacetimeDB token names (its `hex_identity` claim), for the operator to check. */
function tokenIdentity(token: string): string {
  try {
    const payload = token.split(".")[1] ?? "";
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { hex_identity?: unknown };
    return typeof claims.hex_identity === "string" ? claims.hex_identity : "(no hex_identity claim)";
  } catch {
    return "(not a readable token)";
  }
}

async function callReducer(opts: Options, token: string, step: Step): Promise<void> {
  const url = `${opts.server}/v1/database/${encodeURIComponent(opts.database)}/call/${step.reducer}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(step.args),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    fail(`${step.reducer} failed (HTTP ${res.status}): ${text.slice(0, 500) || "(no body)"}`);
  }
}

async function main(): Promise<void> {
  const opts = parseOptions(process.argv.slice(2));
  const production = isProduction(opts.server);
  if (production && !opts.yesProduction) {
    fail(
      `Refusing to target ${opts.server} (production) without --yes-production.\n` +
      "  For a local check pass --server http://127.0.0.1:<port> --database <staging db>.",
    );
  }
  if (!DATABASE_RE.test(opts.database)) fail(`Database '${opts.database}' is missing or not a valid name / identity.`, 2);
  if (opts.organizationId !== "" && !UUID_RE.test(opts.organizationId)) fail(`--org '${opts.organizationId}' is not a uuid.`, 2);
  const token = process.env[opts.tokenEnv] ?? "";

  const steps: Step[] = [
    { reducer: "migrate_owner_permissions_v_1", args: [false], what: "owners get the drive permission boxes" },
    {
      reducer: "backfill_drive_access_v_1", args: [opts.organizationId],
      what: opts.organizationId ? `rebuild the Drive/Docs access indexes of org ${opts.organizationId}` : "rebuild the Drive/Docs access indexes of every org",
    },
  ];

  console.log(`${opts.apply ? "APPLY" : "DRY RUN"} — Drive v1 migration`);
  console.log(`  server:   ${opts.server}${production ? "  (PRODUCTION)" : ""}`);
  console.log(`  database: ${opts.database}`);
  console.log(`  token:    $${opts.tokenEnv} ${token ? `→ identity ${tokenIdentity(token)}` : "(not set)"}`);
  steps.forEach((step, i) => console.log(`  ${i + 1}. ${step.reducer}(${step.args.map((a) => JSON.stringify(a)).join(", ")}) — ${step.what}`));

  const info = await fetch(`${opts.server}/v1/database/${encodeURIComponent(opts.database)}`).catch((err: unknown) => {
    fail(`Cannot reach ${opts.server}: ${err instanceof Error ? err.message : String(err)}`);
  });
  if (!info.ok) fail(`Database '${opts.database}' was not found on ${opts.server} (HTTP ${info.status}).`);
  console.log("  database found.");

  if (!opts.apply) {
    console.log("\nDry run: nothing was changed. Re-run with --apply to execute.");
    return;
  }
  if (!token) fail(`$${opts.tokenEnv} is not set — the service token is required (scripts/bootstrap-service-identity.ts).`);
  for (const step of steps) {
    console.log(`\nRunning ${step.reducer}…`);
    await callReducer(opts, token, step);
    console.log(`✓ ${step.reducer} done`);
  }
  const server = production ? "maincloud" : opts.server;
  // --no-config: inside the repo, spacetime.json would otherwise supply the database and turn ours into SQL.
  console.log(
    "\nCheck the recorded counts (migration_state is private: run this as the database owner):\n" +
    `  spacetime sql --no-config --server ${server} ${opts.database} ` +
    `"SELECT * FROM migration_state WHERE name = 'drive_access_v1' OR name = 'owner_permissions_v1'"\n` +
    "drive_access_v1 must show readerRows > 0 before Publish B.",
  );
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
