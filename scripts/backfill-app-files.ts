/**
 * App-file backfill: records every UploadThing file the app stored before uploads
 * were recorded (app_file), so each store's storage counts them. Run once after the
 * module with app_file is published; re-running is safe (a recorded key is kept).
 *
 *   bun scripts/backfill-app-files.ts            # DRY RUN (the default): lists UploadThing, prints the plan
 *   bun scripts/backfill-app-files.ts --apply    # sends the batches, then recomputes every store's usage
 *
 *   --server <url | maincloud>   default: NEXT_PUBLIC_SPACETIMEDB_URI (Bun loads .env.local)
 *   --database <name | identity> default: NEXT_PUBLIC_SPACETIMEDB_MODULE
 *   --token-env <NAME>           env var holding the service token (default SPACETIMEDB_SERVICE_TOKEN)
 *   --yes-production             REQUIRED to target maincloud (any *.spacetimedb.com host), dry run included
 *
 * UPLOADTHING_TOKEN lists the files (UTApi.listFiles). Each batch of at most 2000
 * `{ key, keyHash, sizeBytes, mimeType }` goes to service_backfill_app_files; the
 * module attributes a key to the store whose rows reference its URL and skips the
 * rest. Then service_recompute_storage('') rebuilds org_storage_usage for every
 * store. The counts land in migration_state 'app_files_v1' (private: the script
 * prints the `spacetime sql` command).
 */

import { UTApi } from "uploadthing/server";
import { DRIVE_STDB_CALLS, driveCallArgs } from "@/lib/drive/server/stdb-calls";
import { appBackfillChunks, appBackfillPlan, listAllUploadThingFiles } from "@/lib/storage/app-file-backfill";

const MAINCLOUD = "https://maincloud.spacetimedb.com";
const DATABASE_RE = /^([a-z0-9]+(-[a-z0-9]+)*|[0-9a-f]{64})$/;

interface Options { apply: boolean; yesProduction: boolean; server: string; database: string; tokenEnv: string }

function fail(message: string, code = 1): never {
  console.error(`\n✗ ${message}`);
  process.exit(code);
}

function usage(): string {
  return "Usage: bun scripts/backfill-app-files.ts [--apply] [--server=<url|maincloud>] [--database=<name>] " +
    "[--token-env=<NAME>] [--yes-production]";
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
    } else if (name === "server" || name === "database" || name === "token-env") {
      const value = inline ?? argv[++i];
      if (value === undefined || value.startsWith("--")) fail(`--${name} needs a value.`, 2);
      values.set(name, value);
    } else {
      fail(`Unknown option --${name}.\n${usage()}`, 2);
    }
  }
  return {
    apply: flags.has("apply"),
    yesProduction: flags.has("yes-production"),
    server: httpBase(values.get("server") ?? process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? MAINCLOUD),
    database: (values.get("database") ?? process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ?? "").trim(),
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

async function callReducer(opts: Options, token: string, reducer: string, args: unknown[]): Promise<void> {
  const url = `${opts.server}/v1/database/${encodeURIComponent(opts.database)}/call/${reducer}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    fail(`${reducer} failed (HTTP ${res.status}): ${text.slice(0, 500) || "(no body)"}`);
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
  const utToken = process.env.UPLOADTHING_TOKEN ?? "";
  if (!utToken) fail("$UPLOADTHING_TOKEN is not set — it is needed to list the stored files.");
  const token = process.env[opts.tokenEnv] ?? "";

  console.log(`${opts.apply ? "APPLY" : "DRY RUN"} — app-file backfill`);
  console.log(`  server:   ${opts.server}${production ? "  (PRODUCTION)" : ""}`);
  console.log(`  database: ${opts.database}`);
  console.log(`  token:    $${opts.tokenEnv} ${token ? "(set)" : "(not set)"}`);
  const info = await fetch(`${opts.server}/v1/database/${encodeURIComponent(opts.database)}`).catch((err: unknown) => {
    fail(`Cannot reach ${opts.server}: ${err instanceof Error ? err.message : String(err)}`);
  });
  if (!info.ok) fail(`Database '${opts.database}' was not found on ${opts.server} (HTTP ${info.status}).`);

  const utapi = new UTApi({ token: utToken });
  const files = await listAllUploadThingFiles((page) => utapi.listFiles(page));
  const plan = appBackfillPlan(files);
  const chunks = appBackfillChunks(plan.entries);
  console.log(`\n  UploadThing files listed: ${files.length}`);
  console.log(`  to send:                  ${plan.entries.length} (${plan.totalBytes} bytes) in ${chunks.length} batch(es)`);
  console.log(`  skipped:                  ${plan.notUploaded} not uploaded, ${plan.duplicates} duplicate, ${plan.invalid} unusable`);

  if (!opts.apply) {
    console.log("\nDry run: nothing was changed. Re-run with --apply to execute.");
    return;
  }
  if (!token) fail(`$${opts.tokenEnv} is not set — the service token is required (scripts/bootstrap-service-identity.ts).`);
  for (const [i, entries] of chunks.entries()) {
    await callReducer(opts, token, DRIVE_STDB_CALLS.backfillAppFiles.name, driveCallArgs("backfillAppFiles", { entries }));
    console.log(`✓ batch ${i + 1}/${chunks.length}`);
  }
  await callReducer(opts, token, DRIVE_STDB_CALLS.recomputeStorage.name, driveCallArgs("recomputeStorage", { organizationId: "" }));
  console.log("✓ storage usage recomputed for every store");
  const server = production ? "maincloud" : opts.server;
  console.log(
    "\nCheck the recorded counts (migration_state is private: run this as the database owner):\n" +
    `  spacetime sql --no-config --server ${server} ${opts.database} "SELECT * FROM migration_state WHERE name = 'app_files_v1'"`,
  );
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
