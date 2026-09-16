/**
 * Run the one-shot data migrations that go with the row-level-security rollout.
 *
 *   bun run migrate:security            # migrateSecurityV1 + migrateMoneyV1
 *   ONLY=security bun run migrate:security
 *   ONLY=money    bun run migrate:security
 *
 * Needs SPACETIMEDB_SERVICE_TOKEN in the environment (reads .env.local via Bun).
 * Run it AFTER `spacetime publish`, and before trusting any screen that reads
 * money or punch-in PINs.
 *
 * What it does, and why it has to be a separate step:
 *
 *   migrateSecurityV1
 *     - fills organization.orgIdText / rootOrgId — plain-string mirrors of the
 *       uuid primary key. SpacetimeDB SQL cannot join a uuid to a string, so
 *       without these the RLS rule on `organization` matches nothing and every
 *       store disappears from the picker.
 *     - fills site_booking.organizationId, which is what scopes bookings (and
 *       the customer names, phones and emails on them) to a tenant.
 *     - moves password hashes to user_secret, POS tokens to org_secret and
 *       punch-in PINs to member_punch_code, blanking the originals. Until this
 *       runs those secrets are still sitting in world-readable columns.
 *
 *   migrateMoneyV1
 *     - backfills the exact `*Cents` columns from their f64 siblings.
 *
 * Both are idempotent; re-running only re-reports.
 */

import { DbConnection } from "../lib/spacetimedb/generated";

const URI = process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "wss://maincloud.spacetimedb.com";
const MODULE = process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ?? "merchiva";

function fail(msg: string): never {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

async function main() {
  const token = process.env.SPACETIMEDB_SERVICE_TOKEN;
  if (!token) {
    fail(
      "SPACETIMEDB_SERVICE_TOKEN is not set — run scripts/bootstrap-service-identity.ts first.",
    );
  }
  const only = (process.env.ONLY ?? "").toLowerCase();

  console.log(`Connecting to ${URI} (module: ${MODULE})…`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn: any = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect timed out")), 15_000);
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(MODULE)
      .withToken(token)
      .withCompression("none")
      .onConnect((c) => { clearTimeout(timer); resolve(c); })
      .onConnectError((_ctx, err) => { clearTimeout(timer); reject(err); })
      .build();
  });

  try {
    if (only !== "money") {
      console.log("Running migrateSecurityV1…");
      await conn.reducers.migrateSecurityV1({});
      console.log("✓ migrateSecurityV1 done");
    }
    if (only !== "security") {
      console.log("Running migrateMoneyV1…");
      await conn.reducers.migrateMoneyV1({});
      console.log("✓ migrateMoneyV1 done");
    }
    console.log(
      "\nRow counts are recorded in the private `migration_state` table " +
      "(names: security_v1, money_v1). Read them with the service token:\n" +
      `  curl -H "Authorization: Bearer $SPACETIMEDB_SERVICE_TOKEN" \\\n` +
      `    -d 'SELECT * FROM migration_state' \\\n` +
      `    ${URI.replace(/^wss:/, "https:").replace(/^ws:/, "http:")}/v1/database/${MODULE}/sql`,
    );
  } catch (err) {
    fail(`Reducer failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    try { conn.disconnect(); } catch { /* already closed */ }
  }
  process.exit(0);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
