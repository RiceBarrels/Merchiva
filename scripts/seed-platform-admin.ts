/**
 * Seed (or reset) a /merchivaAdmin platform admin.
 *
 * Usage:
 *   SEED_ADMIN_USER=alice SEED_ADMIN_PASSWORD='s3cret!!' bun run scripts/seed-platform-admin.ts
 *   ... add RESET=1 to overwrite the password of an existing admin.
 *
 * Needs SPACETIMEDB_SERVICE_TOKEN (and the same MERCHIVA_ADMIN_SECRET as the
 * deployed app, if one is set) in the environment — reads .env.local via Bun.
 */

import { DbConnection } from "../lib/spacetimedb/generated";
import { hashAdminPassword, validateAdminPassword, validateAdminUsername, normalizeAdminUsername } from "../lib/merchiva-admin/password";

const URI = process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "wss://maincloud.spacetimedb.com";
const MODULE = process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ?? "merchiva";

function fail(msg: string): never {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

async function main() {
  const token = process.env.SPACETIMEDB_SERVICE_TOKEN;
  if (!token) fail("SPACETIMEDB_SERVICE_TOKEN is not set");
  const username = normalizeAdminUsername(process.env.SEED_ADMIN_USER ?? "");
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  const usernameError = validateAdminUsername(username);
  if (usernameError) fail(usernameError);
  const passwordError = validateAdminPassword(password);
  if (passwordError) fail(passwordError);
  const reset = process.env.RESET === "1";

  console.log(`Connecting to ${URI} (module: ${MODULE})…`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn: any = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect timed out")), 15_000);
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(MODULE)
      .withToken(token)
      .withCompression("none")
      .onConnect((c) => {
        clearTimeout(timer);
        resolve(c);
      })
      .onConnectError((_ctx, err) => {
        clearTimeout(timer);
        reject(err);
      })
      .build();
  });

  const passwordHash = hashAdminPassword(username, password);
  try {
    if (reset) {
      await conn.reducers.platformAdminSetPassword({ username, passwordHash });
      console.log(`✓ Password reset for platform admin "${username}"`);
    } else {
      await conn.reducers.platformAdminAdd({ username, passwordHash, createdBy: "seed" });
      console.log(`✓ Platform admin "${username}" created`);
    }
  } catch (err) {
    fail(`Reducer failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    try {
      conn.disconnect();
    } catch {
      /* already closed */
    }
  }
  process.exit(0);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
