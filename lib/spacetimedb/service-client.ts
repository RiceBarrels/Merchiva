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
import {
  normalizeSupplierInboundPrefix,
  supplierInboundAddressForOrg,
  supplierInboundPrefixForOrg,
} from "@/lib/suppliers/inbound-address";
import { inboundDomain } from "@/lib/suppliers/thread-token";

const URI =
  process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "wss://maincloud.spacetimedb.com";
const MODULE = process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ?? "merchiva";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceConn = any;

// Cache the connection across warm invocations (Fluid Compute reuses the
// instance). A rejected promise is cleared so the next call retries, and a
// dropped socket clears it via onDisconnect so a warm invocation hours later
// dials fresh instead of subscribing on a dead connection.
let _connPromise: Promise<ServiceConn> | null = null;

function connect(onDrop: () => void): Promise<ServiceConn> {
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
      .onDisconnect(() => {
        onDrop();
      })
      .build();
  });
}

/**
 * Get (or lazily open) the cached service connection. A cached connection
 * whose socket has died (`isActive === false`) is discarded and re-dialed.
 */
export async function getServiceConn(): Promise<ServiceConn> {
  const cached = _connPromise;
  if (cached) {
    try {
      const conn = await cached;
      if (conn.isActive) return conn;
    } catch {
      // fall through and re-dial
    }
    if (_connPromise === cached) _connPromise = null;
  }

  const promise: Promise<ServiceConn> = connect(() => {
    if (_connPromise === promise) _connPromise = null;
  }).catch((err) => {
    if (_connPromise === promise) _connPromise = null; // allow retry on next call
    throw err;
  });
  _connPromise = promise;
  return promise;
}

/**
 * Drop the cached connection (closing it if still open) so the next
 * getServiceConn() dials fresh. Call after a subscription failure — the usual
 * cause is a half-open socket the SDK still reports as connected.
 */
export function resetServiceConn(conn?: ServiceConn): void {
  _connPromise = null;
  try {
    conn?.disconnect?.();
  } catch {
    // already closed
  }
}

/**
 * Subscribe to a set of SQL queries and resolve once the initial snapshot has
 * been applied. Required before iterating tables — the client cache is empty
 * until a subscription delivers rows.
 */
export function subscribeAndWait(
  conn: ServiceConn,
  queries: string[],
  timeoutMs = 30_000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`SpacetimeDB subscription timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    conn
      .subscriptionBuilder()
      .onApplied(() => {
        clearTimeout(timeout);
        resolve();
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .onError((ctx: any) => {
        clearTimeout(timeout);
        const detail = ctx?.event?.message ?? ctx?.event ?? "unknown error";
        reject(new Error(`SpacetimeDB subscription failed: ${detail}`));
      })
      .subscribe(queries);
  });
}

/**
 * Connect + subscribe with one retry on a FRESH connection. The first attempt
 * usually fails only because the warm-cached socket is half-open, so retrying
 * after resetServiceConn() recovers cron runs instead of 500ing the hour.
 */
export async function getSubscribedServiceConn(
  queries: string[],
  timeoutMs = 30_000,
): Promise<ServiceConn> {
  let conn: ServiceConn | undefined;
  try {
    conn = await getServiceConn();
    await subscribeAndWait(conn, queries, timeoutMs);
    return conn;
  } catch (err) {
    console.warn(
      "[service-client] subscribe failed, retrying on a fresh connection:",
      err instanceof Error ? err.message : String(err),
    );
    resetServiceConn(conn);
    conn = await getServiceConn();
    await subscribeAndWait(conn, queries, timeoutMs);
    return conn;
  }
}

// ─── Mr. Merchiva background-reply notification target ──────────────────────────
//
// When a backgrounded ai_job finalizes the user may have left the site, so the
// enqueue worker can't notify from the client. This reads the job owner's
// identity and push subscriptions straight from the service connection's cache
// so the worker can fire an in-app notification + web push server-side.

const aiNotifySubscribed = new WeakSet<object>();

export interface AiReplyTarget {
  targetIdentity: Identity;
  pushSubs: Array<{ endpoint: string; p256dh: string; auth: string }>;
}

/**
 * Resolve the owner (and their push subscriptions) of the most-recent ai_job
 * for the given session. Returns null when no matching job is found or the
 * connection isn't usable. Best-effort — never throws.
 */
export async function getAiReplyTarget(
  conn: ServiceConn,
  organizationId: string,
  sessionId: string,
): Promise<AiReplyTarget | null> {
  try {
    if (!aiNotifySubscribed.has(conn)) {
      await subscribeAndWait(conn, [
        "SELECT * FROM ai_job",
        "SELECT * FROM push_subscription",
      ]);
      aiNotifySubscribed.add(conn);
    }

    // Newest job for this session — createAiJob stamps userId = the sender, and
    // the client only enqueues one job per send, so this is unambiguous.
    const jobs = [...conn.db.aiJob.iter()].filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (j: any) => j.organizationId === organizationId && j.sessionId === sessionId,
    );
    if (jobs.length === 0) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toMs = (j: any) =>
      typeof j.createdAt === "object" && j.createdAt && "microsSinceUnixEpoch" in j.createdAt
        ? Number((j.createdAt as { microsSinceUnixEpoch: bigint }).microsSinceUnixEpoch)
        : new Date(String(j.createdAt)).getTime();
    jobs.sort((a, b) => toMs(b) - toMs(a));
    const job = jobs[0];
    const targetIdentity: Identity = job.userId;
    if (!targetIdentity) return null;

    const hex = targetIdentity.toHexString?.() ?? String(targetIdentity);
    const pushSubs = [...conn.db.pushSubscription.iter()]
      .filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) =>
          r.organizationId === organizationId &&
          (r.targetId?.toHexString?.() ?? String(r.targetId)) === hex,
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => ({
        endpoint: r.endpoint as string,
        p256dh: r.p256Dh as string,
        auth: r.auth as string,
      }));

    return { targetIdentity, pushSubs };
  } catch (err) {
    console.warn("[getAiReplyTarget] failed:", err);
    return null;
  }
}

// ─── Supplier thread context (Phase 2 inbound webhook) ──────────────────────────

const supplierThreadSubscribed = new WeakSet<object>();

export interface SupplierThreadContext {
  supplier: {
    id: string;
    name: string;
    email: string | null;
    contactName: string | null;
    language: string | null;
  };
  orgName: string;
  // Oldest → newest, so the model reads the conversation in order.
  messages: Array<{ direction: string; body: string }>;
  purchaseOrders: Array<{ status: string; items: string; total: number }>;
}

export interface ResolvedSupplierThreadContext extends SupplierThreadContext {
  organizationId: string;
  supplierId: string;
  inboundPrefix: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowMs(r: any): number {
  const c = r?.createdAt;
  return c && typeof c === "object" && "microsSinceUnixEpoch" in c
    ? Number((c as { microsSinceUnixEpoch: bigint }).microsSinceUnixEpoch)
    : new Date(String(c)).getTime();
}

/**
 * Build the context Mr. Merchiva needs to answer a supplier reply: the supplier
 * record, the org name, the recent message thread, and this supplier's POs.
 * Returns null when the supplier can't be found.
 */
export async function getSupplierThreadContext(
  conn: ServiceConn,
  organizationId: string,
  supplierId: string,
): Promise<SupplierThreadContext | null> {
  if (!supplierThreadSubscribed.has(conn)) {
    await subscribeAndWait(conn, [
      "SELECT * FROM supplier",
      "SELECT * FROM supplier_message",
      "SELECT * FROM purchase_order",
      "SELECT * FROM organization",
      "SELECT * FROM settings",
    ]);
    supplierThreadSubscribed.add(conn);
  }

  const supplier = [...conn.db.supplier.iter()].find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: any) => s.id?.toString?.() === supplierId && s.organizationId === organizationId,
  );
  if (!supplier) return null;

  const org = [...conn.db.organization.iter()].find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (o: any) => o.id?.toString?.() === organizationId,
  );

  const messages = [...conn.db.supplierMessage.iter()]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((m: any) => m.organizationId === organizationId && m.supplierId === supplierId)
    .sort((a, b) => rowMs(a) - rowMs(b))
    .slice(-12)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => ({ direction: String(m.direction), body: String(m.body) }));

  const purchaseOrders = [...conn.db.purchaseOrder.iter()]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((p: any) => p.organizationId === organizationId && p.supplierId === supplierId)
    .sort((a, b) => rowMs(b) - rowMs(a))
    .slice(0, 5)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => ({ status: String(p.status), items: String(p.items), total: Number(p.total) }));

  return {
    supplier: {
      id: supplierId,
      name: String(supplier.name ?? ""),
      email: supplier.email ?? null,
      contactName: supplier.contactName ?? null,
      language: supplier.language ?? null,
    },
    orgName: String(org?.name ?? "our store"),
    messages,
    purchaseOrders,
  };
}

function emailAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = raw.match(/<([^>]+)>/);
  const addr = (match ? match[1] : raw).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) ? addr : null;
}

export async function getSupplierThreadContextForInbound(
  conn: ServiceConn,
  inboundPrefix: string,
  fromAddress?: string | null,
): Promise<ResolvedSupplierThreadContext | null> {
  if (!supplierThreadSubscribed.has(conn)) {
    await subscribeAndWait(conn, [
      "SELECT * FROM supplier",
      "SELECT * FROM supplier_message",
      "SELECT * FROM purchase_order",
      "SELECT * FROM organization",
      "SELECT * FROM settings",
    ]);
    supplierThreadSubscribed.add(conn);
  }

  const normalizedPrefix = normalizeSupplierInboundPrefix(inboundPrefix);
  const settingsRows = [...conn.db.settings.iter()];
  const org = [...conn.db.organization.iter()].find((o: any) => {
    const organizationId = o.id?.toString?.();
    const settings = settingsRows.find((s: any) => s.organizationId === organizationId);
    return supplierInboundPrefixForOrg(settings?.supplierInboundPrefix ?? null, organizationId) === normalizedPrefix;
  });
  const organizationId = org?.id?.toString?.();
  if (!organizationId) return null;

  const sender = emailAddress(fromAddress);
  const suppliers = [...conn.db.supplier.iter()].filter((s: any) => s.organizationId === organizationId);
  const supplier = sender
    ? suppliers.find((s: any) => emailAddress(s.email) === sender)
    : suppliers.length === 1
      ? suppliers[0]
      : null;
  if (!supplier) return null;

  const supplierId = supplier.id?.toString?.();
  if (!supplierId) return null;
  const ctx = await getSupplierThreadContext(conn, organizationId, supplierId);
  if (!ctx) return null;
  return { ...ctx, organizationId, supplierId, inboundPrefix: normalizedPrefix };
}

export async function getSupplierInboundAddressForOrg(
  conn: ServiceConn,
  organizationId: string,
): Promise<string | null> {
  if (!supplierThreadSubscribed.has(conn)) {
    await subscribeAndWait(conn, [
      "SELECT * FROM supplier",
      "SELECT * FROM supplier_message",
      "SELECT * FROM purchase_order",
      "SELECT * FROM organization",
      "SELECT * FROM settings",
    ]);
    supplierThreadSubscribed.add(conn);
  }
  const settings = [...conn.db.settings.iter()].find((s: any) => s.organizationId === organizationId);
  return supplierInboundAddressForOrg(settings?.supplierInboundPrefix ?? null, organizationId, inboundDomain());
}

// ─── Service reducer wrappers ──────────────────────────────────────────────────

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

export async function serviceLogSupplierMessage(
  conn: ServiceConn,
  args: {
    organizationId: string;
    supplierId: string;
    supplierName: string;
    poId?: string | null;
    direction: "inbound" | "outbound" | "system";
    channel: string;
    subject?: string | null;
    body: string;
    status?: string | null;
    escalate: boolean;
  },
): Promise<void> {
  conn.reducers.serviceLogSupplierMessage({
    organizationId: args.organizationId,
    supplierId: args.supplierId,
    supplierName: args.supplierName,
    poId: args.poId ?? undefined,
    direction: args.direction,
    channel: args.channel,
    subject: args.subject ?? undefined,
    body: args.body,
    status: args.status ?? undefined,
    escalate: args.escalate,
  });
}

export async function serviceRepairInventoryItem(
  conn: ServiceConn,
  args: {
    organizationId: string;
    itemId: string;
    name: string;
    category: string;
    currentStock: number;
    minStock: number;
    maxStock: number;
    unit: string;
    costPerUnit: number;
    supplier: string;
    lastRestocked: string;
    lossRate: number;
    minOrderQty?: number | null;
    unitsPerCase?: number | null;
  },
): Promise<void> {
  conn.reducers.serviceRepairInventoryItem({
    organizationId: args.organizationId,
    itemId: args.itemId,
    name: args.name,
    category: args.category,
    currentStock: args.currentStock,
    minStock: args.minStock,
    maxStock: args.maxStock,
    unit: args.unit,
    costPerUnit: args.costPerUnit,
    supplier: args.supplier,
    lastRestocked: args.lastRestocked,
    lossRate: args.lossRate,
    minOrderQty: args.minOrderQty ?? undefined,
    unitsPerCase: args.unitsPerCase ?? undefined,
  });
}

export async function serviceSetScheduleIntegration(
  conn: ServiceConn,
  args: {
    organizationId: string;
    provider: string;
    companyGuid?: string | null;
    companyId?: string | null;
    locationId?: string | null;
    status?: string | null;
    summary?: string | null;
  },
): Promise<void> {
  conn.reducers.serviceSetScheduleIntegration({
    organizationId: args.organizationId,
    provider: args.provider,
    companyGuid: args.companyGuid ?? undefined,
    companyId: args.companyId ?? undefined,
    locationId: args.locationId ?? undefined,
    status: args.status ?? undefined,
    summary: args.summary ?? undefined,
  });
}

export async function serviceRecordScheduleSync(
  conn: ServiceConn,
  args: {
    organizationId: string;
    provider: string;
    status: string;
    summary: string;
  },
): Promise<void> {
  conn.reducers.serviceRecordScheduleSync({
    organizationId: args.organizationId,
    provider: args.provider,
    status: args.status,
    summary: args.summary,
  });
}

export async function serviceRecordAiUsage(
  conn: ServiceConn,
  args: {
    organizationId: string;
    userId: string;
    feature: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    inputCost: number;
    outputCost: number;
    cost: number;
    day: string;
    month: string;
    description?: string | null;
  },
): Promise<void> {
  conn.reducers.serviceRecordAiUsage({
    ...args,
    description: args.description ?? undefined,
  });
}
