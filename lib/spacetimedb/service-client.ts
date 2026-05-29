/**
 * Server-side SpacetimeDB connection — Node runtime ONLY.
 *
 * Authenticates with SPACETIMEDB_SERVICE_TOKEN (a pre-registered service
 * identity; see scripts/bootstrap-service-identity.ts). Used by cron routes
 * and other server-side jobs that must read tables and call service-only
 * reducers without a logged-in user.
 *
 * Do NOT import this from client components — it has no business in the
 * browser bundle and relies on a secret token.
 */

import "server-only";

import { DbConnection } from "./generated";
import type { Identity } from "spacetimedb";

const URI =
  process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "wss://maincloud.spacetimedb.com";
const MODULE = process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ?? "merchiva";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceConn = any;

// Cache the connection across warm invocations (Fluid Compute reuses the
// instance). A rejected promise is cleared so the next call retries.
let _connPromise: Promise<ServiceConn> | null = null;

function connect(): Promise<ServiceConn> {
  const token = process.env.SPACETIMEDB_SERVICE_TOKEN;
  if (!token) {
    return Promise.reject(
      new Error(
        "SPACETIMEDB_SERVICE_TOKEN is not set — run scripts/bootstrap-service-identity.ts and add the token to the environment.",
      ),
    );
  }

  return new Promise<ServiceConn>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("SpacetimeDB service connection timed out after 15s"));
    }, 15_000);

    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(MODULE)
      .withToken(token)
      // maincloud's brotli path can hang the post-handshake protocol; the
      // client provider disables compression for the same reason.
      .withCompression("none")
      .onConnect((connection) => {
        clearTimeout(timeout);
        resolve(connection);
      })
      .onConnectError((_ctx, err) => {
        clearTimeout(timeout);
        reject(err);
      })
      .build();
  });
}

/** Get (or lazily open) the cached service connection. */
export async function getServiceConn(): Promise<ServiceConn> {
  if (!_connPromise) {
    _connPromise = connect().catch((err) => {
      _connPromise = null; // allow retry on next call
      throw err;
    });
  }
  return _connPromise;
}

/**
 * Subscribe to a set of SQL queries and resolve once the initial snapshot has
 * been applied. Required before iterating tables — the client cache is empty
 * until a subscription delivers rows.
 */
export function subscribeAndWait(
  conn: ServiceConn,
  queries: string[],
  timeoutMs = 15_000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("SpacetimeDB subscription timed out"));
    }, timeoutMs);
    conn
      .subscriptionBuilder()
      .onApplied(() => {
        clearTimeout(timeout);
        resolve();
      })
      .onError(() => {
        clearTimeout(timeout);
        reject(new Error("SpacetimeDB subscription failed"));
      })
      .subscribe(queries);
  });
}

// ─── Typed row shapes (mirror the generated tables) ────────────────────────────

export interface BriefingPrefRow {
  userId: Identity;
  briefingTime: string;
  timezone: string;
  enabled: boolean;
}

export interface OrgMembershipRow {
  userId: Identity;
  organizationId: string;
  role: string;
  status: string;
}

/** All enabled briefing preferences. */
export async function getEnabledBriefingPrefs(
  conn: ServiceConn,
): Promise<BriefingPrefRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [...conn.db.userBriefingPref.iter()]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((r: any) => r.enabled)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => ({
      userId: r.userId,
      briefingTime: r.briefingTime,
      timezone: r.timezone,
      enabled: r.enabled,
    }));
}

/** Active org memberships for a given user identity (manager/owner only). */
export function getAdminOrgsForUser(
  conn: ServiceConn,
  userId: Identity,
): string[] {
  const hex = userId.toHexString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [...conn.db.orgMember.iter()]
    .filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) =>
        m.userId?.toHexString?.() === hex &&
        m.status === "active" &&
        (m.role === "owner" || m.role === "manager"),
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => m.organizationId as string);
}

// ─── Service reducer wrappers ──────────────────────────────────────────────────

export async function serviceSaveDailyBriefing(
  conn: ServiceConn,
  args: {
    organizationId: string;
    date: string;
    content: string;
    summary?: string | null;
    generatedBy: string;
  },
): Promise<void> {
  conn.reducers.serviceSaveDailyBriefing({
    organizationId: args.organizationId,
    date: args.date,
    content: args.content,
    summary: args.summary ?? undefined,
    generatedBy: args.generatedBy,
  });
}

export async function serviceCreateNotification(
  conn: ServiceConn,
  args: {
    organizationId: string;
    targetIdentity: Identity;
    type: string;
    title: string;
    body: string;
    link?: string | null;
  },
): Promise<void> {
  conn.reducers.serviceCreateNotification({
    organizationId: args.organizationId,
    targetIdentity: args.targetIdentity,
    type: args.type,
    title: args.title,
    body: args.body,
    link: args.link ?? undefined,
  });
}
