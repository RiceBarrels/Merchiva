// Test world for the notification module (spacetimedb/src/notify/): the REAL
// deliver(), reducers and claim / finish over the in-memory database of
// ../drive/fake-db.ts, with index.ts's findActiveMember and docRoleFor
// extracted from the module source. One organization: owner, manager, staff.

import { randomUUID } from "node:crypto";
import {
  DRIVE_FAKE_TABLES, FakeDb, FakeIdentity, FakeRange, FakeSenderError, FakeTimestamp, FakeUuid, SERVICE_IDENTITY,
  frozenColumns, loadModule, moduleStubs, registerServiceIdentity, type FakeMember, type FakeTableDef, type Row,
} from "../drive/fake-db";
import { defineNotifyReducers } from "@/spacetimedb/src/notify/reducers";
import { deliver, type NotifyCtx, type NotifyDeps, type NotifyInput, type NotifySchema } from "@/spacetimedb/src/notify/deliver";

export const NOTIFY_TABLES: readonly FakeTableDef[] = [
  ...DRIVE_FAKE_TABLES,
  { accessor: "chatMessageExt", primaryKey: "messageId", indexes: { byConversationId: "conversationId", byThreadParentId: "threadParentId" } },
  { accessor: "storeDevice", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byDeviceId: "deviceId" } },
];

const M = loadModule(["findActiveMember", "docRoleFor"]);

export const deps = {
  t: moduleStubs().t,
  SenderError: FakeSenderError,
  Identity: FakeIdentity,
  findById: (tbl: { id: { find(k: unknown): unknown } }, id: string) => tbl.id.find(id) ?? undefined,
  findActiveMember: M.findActiveMember,
  docRoleFor: M.docRoleFor,
  isServiceCaller: moduleStubs().isServiceCaller,
  u64Range: (from: bigint, to: bigint) => new FakeRange({ tag: "included", value: from }, { tag: "excluded", value: to }),
} as unknown as NotifyDeps;

type Fn = (ctx: unknown, args: Record<string, unknown>) => void;
export const R = defineNotifyReducers({ reducer: (_p: unknown, fn: Fn) => fn } as unknown as NotifySchema, deps) as unknown as Record<string, Fn>;

export const S = 1_000_000n;
export const MIN = 60n * S;

export interface World {
  db: FakeDb;
  org: string;
  owner: FakeMember;
  manager: FakeMember;
  staff: FakeMember;
}

export function world(tables: readonly FakeTableDef[] = NOTIFY_TABLES): World {
  const db = new FakeDb(tables);
  registerServiceIdentity(db);
  const id = new FakeUuid();
  const org = id.toString();
  const owner = db.addMember({ organizationId: org, role: "owner", displayName: "Olive" });
  db.insert("organization", { id, ownerId: owner.identity, name: "Corner Bakery", orgIdText: org, rootOrgId: org, subscriptionStatus: undefined });
  return { db, org, owner, manager: db.addMember({ organizationId: org, role: "manager", displayName: "Max" }), staff: db.addMember({ organizationId: org, role: "staff", displayName: "Sam" }) };
}

/** deliver() as `from` (default: the owner) to `to`; returns the notification id. */
export function send(w: World, to: FakeMember, input: Partial<NotifyInput> = {}, opts: { from?: FakeMember; atMicros?: bigint } = {}): string {
  let id = "";
  w.db.run((ctx: NotifyCtx) => {
    id = deliver(ctx, {
      organizationId: w.org, target: to.identity as never, type: "doc_share", title: "Document shared with you",
      body: "You can now view it", link: "/manager/docs/edit?id=d1", template: "doc.shared", params: { actor: "Olive", doc: "Menu" },
      email: true, ...input,
    });
  }, opts.from ?? w.owner, {}, { atMicros: opts.atMicros });
  return id;
}

export const delivery = (w: World, id: string): Row | null => w.db.find("notificationDelivery", id);
export const createdAt = (w: World, id: string): bigint => (delivery(w, id)?.createdAt as FakeTimestamp).microsSinceUnixEpoch;

export function pref(w: World, m: FakeMember, patch: Record<string, unknown> = {}): void {
  w.db.insert("notificationPref", {
    userId: m.identity, subject: `user_${m.role}`, issuer: "https://api.workos.com/user_management/client_1", emailEnabled: true,
    locale: "fr", updatedAt: new FakeTimestamp(w.db.nowMicros), ...patch,
  });
}

export function subscribe(w: World, m: FakeMember, endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, org = w.org): string {
  w.db.insert("pushSubscription", {
    id: new FakeUuid(), organizationId: org, targetId: m.identity, endpoint, p256dh: "p256", auth: "auth", userAgent: undefined,
    createdAt: new FakeTimestamp(w.db.nowMicros),
  });
  return endpoint;
}

export function claim(w: World, atMicros: bigint, opts: { runId?: string; channels?: string; limit?: number } = {}): string {
  const runId = opts.runId ?? randomUUID();
  w.db.run(R.serviceClaimNotificationDeliveries, SERVICE_IDENTITY, { runId, channels: opts.channels ?? "pe", limit: opts.limit ?? 100 }, { atMicros });
  return runId;
}

export function finish(w: World, runId: string, result: Record<string, unknown>, atMicros?: bigint): void {
  w.db.run(R.serviceFinishNotificationDeliveries, SERVICE_IDENTITY, { runId, resultJson: JSON.stringify(result) }, { atMicros });
}

/** The thrown message of `fn`, or null. */
export function errorOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** A document (frozen columns) owned by the owner, private unless `visibility` says otherwise. */
export function document(w: World, visibility = "private"): string {
  const id = randomUUID();
  const now = new FakeTimestamp(w.db.nowMicros);
  const row: Record<string, unknown> = {
    id, organizationId: w.org, ownerMemberId: w.owner.memberId, title: "Menu", excerpt: "", icon: undefined, visibility,
    templateId: undefined, pageSetup: undefined, wordCount: 0, createdAt: now, updatedAt: now, lastEditorMemberId: undefined,
    trashedAt: undefined, trashedByMemberId: undefined,
  };
  for (const column of frozenColumns("document")) if (!(column in row)) throw new Error(`document fixture lacks ${column}`);
  w.db.insert("document", row);
  return id;
}

export { FakeIdentity, FakeTimestamp, FakeUuid, SERVICE_IDENTITY, type FakeMember, type Row };
