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

  // NOTE: service_identity is a NON-PUBLIC table, so this client CANNOT
  // subscribe to it to read the result back — only the database owner (the
  // `spacetime` CLI) can read non-public tables. So we just fire the reducer,
  // give it time to flush over the socket and commit server-side, print the
  // token, and verify out-of-band with `spacetime sql` (see below).
  console.log(`Calling registerServiceIdentity(label="${LABEL}")…`);
  conn.reducers.registerServiceIdentity({ label: LABEL });

  // Let the call flush + commit. The reducer is fire-and-forget here; the
  // authoritative confirmation is the `spacetime sql` check printed below.
  await new Promise((r) => setTimeout(r, 5000));

  console.log("\n✓ registerServiceIdentity sent.\n");
  console.log("Add this to .env.local AND your Vercel project env:\n");
  console.log(`SPACETIMEDB_SERVICE_TOKEN=${token}\n`);
  console.log(`(identity: ${identityHex}, label: ${LABEL})\n`);
  console.log("Now VERIFY the row landed (owner-only read — empty result means");
  console.log("the slot was already claimed by someone else, so this token is");
  console.log("NOT authorized):\n");
  console.log(`  spacetime sql merchiva --server maincloud "SELECT * FROM service_identity"\n`);
  console.log("The identity column should match the hex printed above.");

  conn.disconnect?.();
  process.exit(0);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
