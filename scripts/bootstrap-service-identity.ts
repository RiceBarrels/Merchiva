/**
 * Bootstrap the SpacetimeDB service identity.
 *
 * Run ONCE, immediately after the module is first published with the
 * service_identity table. It:
 *   1. Connects anonymously to SpacetimeDB (a brand-new Identity + token).
 *   2. Calls registerServiceIdentity — which claims the first slot if the
 *      service_identity table is still empty.
 *   3. Subscribes to service_identity to confirm the row landed.
 *   4. Prints the token so you can paste it into SPACETIMEDB_SERVICE_TOKEN
 *      (.env.local locally, and the Vercel project env for production).
 *
 * Usage:
 *   bun run scripts/bootstrap-service-identity.ts
 *
 * Reads SPACETIMEDB connection config from the same NEXT_PUBLIC_* env vars the
 * client uses. Override the label with SERVICE_IDENTITY_LABEL.
 *
 * IMPORTANT: whoever runs this first wins the slot. Run it right after deploy,
 * verify the printed identity hex matches what you expect, and keep the token
 * secret — it grants service-only reducer access.
 */

import { DbConnection } from "../lib/spacetimedb/generated";

const URI =
  process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "wss://maincloud.spacetimedb.com";
const MODULE = process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ?? "merchiva";
const LABEL = process.env.SERVICE_IDENTITY_LABEL ?? "cron-service";

function fail(msg: string): never {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

async function main() {
  console.log(`Connecting to ${URI} (module: ${MODULE})…`);

  const connected = await new Promise<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conn: any;
    token: string;
    identityHex: string;
  }>((resolve, reject) => {
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(MODULE)
      .withCompression("none")
      .onConnect((connection, identity, token) => {
        resolve({ conn: connection, token, identityHex: identity.toHexString() });
      })
      .onConnectError((_ctx, err) => reject(err))
      .build();
  });

  const { conn, token, identityHex } = connected;
  console.log(`Connected. Anonymous identity: ${identityHex}`);

  // Subscribe to the service_identity table so we can read back the result.
  await new Promise<void>((resolve, reject) => {
    conn
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError(() => reject(new Error("subscription to service_identity failed")))
      .subscribe(["SELECT * FROM service_identity"]);
  });

  console.log(`Calling registerServiceIdentity(label="${LABEL}")…`);
  conn.reducers.registerServiceIdentity({ label: LABEL });

  // Poll for the row to appear (reducer round-trip is async).
  const ok = await new Promise<boolean>((resolve) => {
    const deadline = Date.now() + 10_000;
    const tick = () => {
      const rows = [...conn.db.serviceIdentity.iter()];
      const mine = rows.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) => r.identity?.toHexString?.() === identityHex,
      );
      if (mine) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(tick, 300);
    };
    tick();
  });

  if (!ok) {
    fail(
      "registerServiceIdentity did not land within 10s. The table may already " +
        "be bootstrapped by a different identity — in that case this anonymous " +
        "identity is NOT authorized. Check " +
        '`spacetime sql merchiva "SELECT * FROM service_identity"`.',
    );
  }

  console.log("\n✓ Service identity registered.\n");
  console.log("Add this to .env.local AND your Vercel project env:\n");
  console.log(`SPACETIMEDB_SERVICE_TOKEN=${token}\n`);
  console.log(`(identity: ${identityHex}, label: ${LABEL})`);

  conn.disconnect?.();
  process.exit(0);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
