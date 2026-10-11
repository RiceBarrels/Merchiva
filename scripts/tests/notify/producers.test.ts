// Every notification producer of spacetimedb/src/index.ts, run for real over the
// fake database: the row old clients read (type, English copy, link) and how it
// is delivered (template, params, email, push, source) — notifications spec §1.5.
// Channel messages beyond sendMessage are in ../chat/reducers.test.ts, PIN alerts
// in ../store-device/pin-reducers.test.ts, form responses in ../forms/reducers.test.ts.

import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { loadModule } from "../drive/fake-db";
import {
  FakeIdentity, FakeTimestamp, FakeUuid, NOTIFY_TABLES, SERVICE_IDENTITY, document, subscribe, world,
  type FakeMember, type Row, type World,
} from "./world";

/** The SDK Uuid as uuidFromString builds it (`new Uuid(bigint)`): printed like the fake rows' ids, so findById finds them. */
class StubUuid {
  constructor(private readonly value: bigint) {}
  toString(): string {
    const h = this.value.toString(16).padStart(32, "0");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}

const M = loadModule([
  "sendMessage", "sendMerchivaMessage", "createNotification", "serviceCreateNotification", "createTimeOffRequest",
  "updateTimeOffStatus", "createShiftTrade", "updateInventoryItem", "addWasteLog", "recordSupplierOrder",
  "logSupplierMessage", "serviceLogSupplierMessage", "acceptInvitation", "grantDocumentAccess", "addDocumentComment",
  "replyDocumentComment",
], { Uuid: StubUuid });

const TABLES = [
  ...NOTIFY_TABLES,
  { accessor: "chatMemberState", primaryKey: "id", indexes: { byConversationId: "conversationId", byUserId: "userId" } },
  { accessor: "shiftTrade", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byRequesterId: "requesterId", byTargetId: "targetId" } },
  { accessor: "wasteLog", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byDate: "date" } },
  { accessor: "purchaseOrder", primaryKey: "id", indexes: { byOrganizationId: "organizationId", bySupplierId: "supplierId" } },
  { accessor: "supplierMessage", primaryKey: "id", indexes: { byOrganizationId: "organizationId", bySupplierId: "supplierId" } },
];

const hexOf = (v: unknown) => (v as FakeIdentity).hex;
const notes = (w: World, type?: string) => w.db.rows("notification").filter((n) => !type || n.type === type);
const noteTo = (w: World, who: FakeMember, type?: string): Row[] => notes(w, type).filter((n) => hexOf(n.targetId) === who.identity.hex);
const queued = (w: World, who: FakeMember): Row[] =>
  w.db.rows("notificationDelivery").filter((d) => hexOf(d.targetId) === who.identity.hex);
const paramsOf = (row: Row) => JSON.parse(String(row.params)) as Record<string, string>;
const now = (w: World) => new FakeTimestamp(w.db.nowMicros);

function setup(): World {
  return world(TABLES);
}

function conversation(w: World, members: FakeMember[], o: { merchiva?: boolean } = {}): string {
  const id = new FakeUuid();
  w.db.insert("chatConversation", {
    id, organizationId: w.org, type: "group", name: "Floor", createdBy: undefined, createdAt: now(w), updatedAt: now(w),
    merchivaEnabled: o.merchiva ? true : undefined,
  });
  for (const m of members) w.db.insert("chatMember", { id: new FakeUuid(), conversationId: id.toString(), userId: m.identity, joinedAt: now(w) });
  return id.toString();
}

function send(w: World, by: FakeMember, conversationId: string, content: string): void {
  w.db.run(M.sendMessage, by, {
    conversationId, content, replyToId: undefined, attachmentUrl: undefined, attachmentType: undefined, attachmentName: undefined,
    voiceTranscript: undefined,
  });
}

function canEditInventory(w: World, m: FakeMember): void {
  w.db.patch("orgMember", m.memberId, { permissions: JSON.stringify({ inventory: { view: true, edit: true } }) });
}

function item(w: World, currentStock: number, minStock = 4): string {
  const id = new FakeUuid();
  w.db.insert("inventoryItem", {
    id, organizationId: w.org, name: "Milk", category: "Dairy", currentStock, minStock, maxStock: 40, unit: "L",
    costPerUnit: 1, supplier: "Dairy Co", lastRestocked: "2026-10-01", lossRate: 0, updatedAt: now(w),
  });
  return id.toString();
}

describe("sendMessage / sendMerchivaMessage", () => {
  test("a message with no preference and no push rows anywhere: the message and in-app rows, nothing queued; a mention queues email", () => {
    const w = setup();
    const conv = conversation(w, [w.owner, w.staff]);
    send(w, w.staff, conv, "hi");
    expect(w.db.rows("chatMessage")).toHaveLength(1);
    expect(noteTo(w, w.owner)).toEqual([
      expect.objectContaining({ type: "team", title: "Sam", body: "hi", link: `/manager/channel?c=${conv}`, read: false }),
    ]);
    expect(w.db.rows("notificationDelivery")).toHaveLength(0);
    expect(w.db.rows("notificationPref")).toHaveLength(0);

    send(w, w.staff, conv, "@Olive the fridge is warm");
    const [d] = queued(w, w.owner);
    expect(d).toMatchObject({ template: "chat.mention", email: true, push: false, sourceKind: "chat_message", contextId: conv });
    expect(d.sourceId).toBe(String(w.db.rows("chatMessage").find((m) => m.content === "@Olive the fridge is warm")?.id));
    expect(paramsOf(d)).toEqual({ actor: "Sam", preview: "@Olive the fridge is warm", conversation: "Floor", store: "Corner Bakery" });
  });

  test("a Mr. Merchiva reply: everyone but the caller, linked to the conversation, pushed but never emailed", () => {
    const w = setup();
    const conv = conversation(w, [w.owner, w.manager, w.staff], { merchiva: true });
    subscribe(w, w.owner);
    w.db.run(M.sendMerchivaMessage, w.staff, { conversationId: conv, content: "Order 12 litres of milk." });
    expect(notes(w).map((n) => hexOf(n.targetId)).sort()).toEqual([w.owner.identity.hex, w.manager.identity.hex].sort());
    expect(noteTo(w, w.owner)[0]).toMatchObject({ type: "team", title: "Mr. Merchiva", link: `/manager/channel?c=${conv}` });
    expect(queued(w, w.owner)).toEqual([expect.objectContaining({ template: "chat.merchiva", email: false, push: true, sourceKind: "chat_message" })]);
    expect(queued(w, w.manager)).toHaveLength(0);
  });
});

describe("createNotification / serviceCreateNotification", () => {
  const free = (w: World, to: FakeMember, o: Record<string, unknown>) => ({
    organizationId: w.org, targetIdentity: to.identity, type: "general", title: "Title", body: "Body", link: undefined, ...o,
  });

  test("a member's free-form row stays in the app; an older tablet's SOS ('emergency') may push, under the sender's name, never by email", () => {
    const w = setup();
    subscribe(w, w.owner);
    w.db.run(M.createNotification, w.staff, free(w, w.owner, { type: "urgent", link: "/manager/inventory" }));
    expect(noteTo(w, w.owner, "urgent")).toHaveLength(1);
    expect(queued(w, w.owner)).toHaveLength(0);
    w.db.run(M.createNotification, w.staff, free(w, w.owner, { type: "emergency", title: "SOS", link: "/store" }));
    expect(noteTo(w, w.owner, "emergency")[0]).toMatchObject({ title: "Sam: SOS", link: "/store" });
    expect(queued(w, w.owner)).toEqual([
      expect.objectContaining({ template: "custom", email: false, push: true, title: "Sam: SOS", link: "", sourceKind: "device" }),
    ]);
  });

  test("an older tablet's SOS pushes each owner and manager once per 2-minute window, and never a staff member", () => {
    const w = setup();
    const colleague = w.db.addMember({ organizationId: w.org, role: "staff", displayName: "Kim" });
    for (const m of [w.owner, w.manager, colleague]) subscribe(w, m);
    const start = w.db.nowMicros + 1_000_000n;
    const sos = (to: FakeMember, atMicros: bigint) =>
      w.db.run(M.createNotification, w.staff, free(w, to, { type: "emergency", title: "SOS" }), { atMicros });
    const pushes = (who: FakeMember) => queued(w, who).filter((d) => d.push === true).length;
    // The tablet's fan-out: one call per owner / manager, moments apart.
    sos(w.owner, start);
    sos(w.manager, start + 1_000n);
    sos(colleague, start + 2_000n);
    expect([pushes(w.owner), pushes(w.manager), pushes(colleague)]).toEqual([1, 1, 0]);
    expect(noteTo(w, colleague, "emergency")).toHaveLength(1);
    // Again within the window (the same burst, or later): in the app only.
    sos(w.owner, start + 3_000n);
    sos(w.manager, start + 60_000_000n);
    expect([pushes(w.owner), pushes(w.manager)]).toEqual([1, 1]);
    expect(noteTo(w, w.manager, "emergency")).toHaveLength(2);
    // A new window two minutes on.
    sos(w.manager, start + 120_000_000n);
    expect(pushes(w.manager)).toBe(2);
  });

  test("the service: Mr. Merchiva's background reply pushes only; the low-stock scan emails owners and managers only; the console never emails", () => {
    const w = setup();
    const run = (to: FakeMember, o: Record<string, unknown>) => w.db.run(M.serviceCreateNotification, SERVICE_IDENTITY, free(w, to, o));
    subscribe(w, w.staff);
    run(w.staff, { type: "general", body: "Here is your answer", link: "/manager/dashboard?mvsession=s1" });
    expect(queued(w, w.staff)).toEqual([expect.objectContaining({ template: "chat.merchiva", email: false, push: true })]);
    expect(paramsOf(queued(w, w.staff)[0])).toMatchObject({ preview: "Here is your answer", conversation: "" });

    run(w.manager, { type: "order", link: "/manager/inventory" });
    expect(queued(w, w.manager)).toEqual([expect.objectContaining({ template: "custom", email: true, sourceKind: "inventory" })]);
    run(w.owner, { type: "admin" });
    expect(queued(w, w.owner)).toHaveLength(0);
    expect(noteTo(w, w.owner, "admin")).toHaveLength(1);
    run(w.staff, { type: "inventory_low", link: "/manager/inventory" });
    expect(queued(w, w.staff).find((d) => d.sourceKind === "inventory")).toMatchObject({ email: false, push: true });
  });
});

describe("time off and shift trades", () => {
  test("a request tells the owners and managers (never the requester); the decision tells the requester", () => {
    const w = setup();
    w.db.run(M.createTimeOffRequest, w.staff, {
      organizationId: w.org, startDate: "2026-11-02", endDate: "2026-11-04", fullDays: true, startTime: undefined, endTime: undefined, comments: "",
    });
    for (const m of [w.owner, w.manager]) {
      expect(noteTo(w, m, "time_off")[0]).toMatchObject({ title: "Time off request", body: "Sam requested time off 2026-11-02 – 2026-11-04", link: "/manager/personnel" });
      expect(queued(w, m)).toEqual([expect.objectContaining({ template: "timeOff.requested", email: true })]);
      expect(paramsOf(queued(w, m)[0])).toEqual({ actor: "Sam", start: "2026-11-02", end: "2026-11-04", store: "Corner Bakery" });
    }
    expect(noteTo(w, w.staff)).toHaveLength(0);

    const requestId = String(w.db.rows("timeOffRequest")[0].id);
    const decide = (status: string) => w.db.run(M.updateTimeOffStatus, w.manager, { organizationId: w.org, requestId, status });
    decide("approved");
    decide("rejected");
    decide("pending");
    expect(noteTo(w, w.staff, "time_off").map((n) => n.title)).toEqual(["Time off approved", "Time off rejected", "Time off pending"]);
    expect(queued(w, w.staff).map((d) => d.template)).toEqual(["timeOff.approved", "timeOff.denied", "timeOff.updated"]);
  });

  test("a manager's own request goes to the other owners and managers only", () => {
    const w = setup();
    w.db.run(M.createTimeOffRequest, w.manager, {
      organizationId: w.org, startDate: "2026-11-02", endDate: "2026-11-02", fullDays: true, startTime: undefined, endTime: undefined, comments: "",
    });
    expect(notes(w).map((n) => hexOf(n.targetId))).toEqual([w.owner.identity.hex]);
  });

  test("a broadcast trade asks everyone else; a targeted one asks that member, in the caller's name", () => {
    const w = setup();
    const trade = (o: Record<string, unknown>) => w.db.run(M.createShiftTrade, w.staff, {
      organizationId: w.org, shiftId: randomUUID(), requesterId: w.staff.memberId, broadcastToAll: false, targetId: "",
      targetShiftId: undefined, type: "cover", comments: "", ...o,
    });
    trade({ broadcastToAll: true });
    expect(notes(w, "shift_trade").map((n) => hexOf(n.targetId)).sort()).toEqual([w.owner.identity.hex, w.manager.identity.hex].sort());
    expect(queued(w, w.owner)).toEqual([expect.objectContaining({ template: "shift.open", email: true })]);
    expect(paramsOf(queued(w, w.owner)[0])).toMatchObject({ actor: "Sam" });

    trade({ targetId: w.manager.memberId, type: "swap" });
    expect(noteTo(w, w.manager, "shift_trade").at(-1)).toMatchObject({ title: "Shift swap request", body: "Sam wants to trade a shift with you" });
    expect(queued(w, w.manager).at(-1)).toMatchObject({ template: "shift.requested", email: true });
  });
});

describe("low stock and waste", () => {
  test("everyone sees it in the app; only owners and managers are emailed; staff with a push subscription get the push", () => {
    const w = setup();
    canEditInventory(w, w.manager);
    subscribe(w, w.staff);
    const itemId = item(w, 10);
    w.db.run(M.updateInventoryItem, w.manager, {
      organizationId: w.org, itemId, name: "Milk", category: "Dairy", currentStock: 3, minStock: 4, maxStock: 40, unit: "L",
      costPerUnit: 1, supplier: "Dairy Co", lastRestocked: "2026-10-01", lossRate: 0,
    });
    expect(notes(w, "inventory_low")).toHaveLength(3);
    expect(noteTo(w, w.staff, "inventory_low")[0]).toMatchObject({ title: "Low stock: Milk", body: "Milk is at 3 L (min: 4)", link: "/manager/inventory" });
    for (const m of [w.owner, w.manager]) {
      expect(queued(w, m)).toEqual([expect.objectContaining({ template: "inventory.low", email: true, sourceKind: "inventory", sourceId: itemId })]);
    }
    expect(paramsOf(queued(w, w.owner)[0])).toEqual({ item: "Milk", quantity: "3", unit: "L", min: "4", store: "Corner Bakery" });
    expect(queued(w, w.staff)).toEqual([expect.objectContaining({ template: "inventory.low", email: false, push: true })]);
  });

  test("staff without a push subscription: in-app only (the row owes nothing; it is kept only to localize the alert)", () => {
    const w = setup();
    canEditInventory(w, w.manager);
    const itemId = item(w, 6);
    w.db.run(M.addWasteLog, w.manager, {
      organizationId: w.org, itemId, itemName: "Milk", quantity: 3, unit: "L", reason: "expired", costPerUnit: 1, date: "2026-10-08",
      notes: undefined, operatorMemberId: undefined, operatorName: undefined,
    });
    expect(noteTo(w, w.staff, "inventory_low")[0]).toMatchObject({ body: "Milk dropped to 3 L after waste disposal" });
    expect(queued(w, w.staff)).toEqual([expect.objectContaining({ template: "inventory.waste", email: false, push: false })]);
    expect(queued(w, w.manager)).toEqual([expect.objectContaining({ template: "inventory.waste", email: true, sourceKind: "inventory" })]);
  });
});

describe("suppliers and the team", () => {
  test("supplier problems go to owners and managers by email", () => {
    const w = setup();
    const supplierId = randomUUID();
    w.db.run(M.recordSupplierOrder, w.manager, {
      organizationId: w.org, supplierId, supplierName: "Dairy Co", items: "[]", subtotal: 1, tax: 0, total: 1, notes: undefined,
      summary: "12 L milk", emailed: false,
    });
    expect(notes(w, "order").map((n) => hexOf(n.targetId)).sort()).toEqual([w.owner.identity.hex, w.manager.identity.hex].sort());
    expect(queued(w, w.owner)).toEqual([expect.objectContaining({ template: "supplier.order", email: true })]);
    expect(paramsOf(queued(w, w.owner)[0])).toMatchObject({ supplier: "Dairy Co" });

    const issue = { organizationId: w.org, supplierId, supplierName: "Dairy Co", poId: undefined, direction: "inbound", channel: "email",
      subject: undefined, body: "We are out of oat milk until Friday.", status: undefined, escalate: true };
    w.db.run(M.logSupplierMessage, w.manager, issue);
    w.db.run(M.serviceLogSupplierMessage, SERVICE_IDENTITY, issue);
    const issues = queued(w, w.owner).filter((d) => d.template === "supplier.issue");
    expect(issues).toHaveLength(2);
    expect(paramsOf(issues[0])).toMatchObject({ supplier: "Dairy Co", preview: "We are out of oat milk until Friday." });
    expect(noteTo(w, w.staff)).toHaveLength(0);
  });

  test("a new member: everyone else is told and emailed", () => {
    const w = setup();
    const joiner = FakeIdentity.random();
    w.db.insert("user", { identity: joiner, email: "nia@example.test", displayName: "Nia", passwordHash: undefined });
    w.db.insert("orgInvitation", {
      id: new FakeUuid(), organizationId: w.org, email: "nia@example.test", role: "staff", permissions: "{}", token: "tok-nia",
      expiresAt: new FakeTimestamp(w.db.nowMicros + 10_000_000_000n), acceptedAt: undefined, createdAt: now(w),
    });
    w.db.run(M.acceptInvitation, joiner, { token: "tok-nia" });
    expect(notes(w, "team").map((n) => hexOf(n.targetId)).sort())
      .toEqual([w.owner.identity.hex, w.manager.identity.hex, w.staff.identity.hex].sort());
    expect(queued(w, w.staff)).toEqual([expect.objectContaining({ template: "team.joined", email: true })]);
    expect(paramsOf(queued(w, w.staff)[0])).toMatchObject({ actor: "Nia" });
  });
});

describe("documents", () => {
  test("a share and a comment thread: revalidation sources, the commenter's name, the comment as preview", () => {
    const w = setup();
    const docId = document(w);
    w.db.run(M.grantDocumentAccess, w.owner, { documentId: docId, memberId: w.staff.memberId, role: "commenter" });
    expect(noteTo(w, w.staff, "doc_share")[0]).toMatchObject({ title: "Document shared with you", link: `/manager/docs/edit?id=${docId}` });
    expect(queued(w, w.staff)).toEqual([expect.objectContaining({ template: "doc.shared", email: true, sourceKind: "doc", sourceId: docId, contextId: docId })]);
    expect(paramsOf(queued(w, w.staff)[0])).toEqual({ actor: "Olive", doc: "Menu", store: "Corner Bakery" });

    const threadId = randomUUID();
    w.db.run(M.addDocumentComment, w.staff, { documentId: docId, threadId, body: "Is the price right?", quotedText: undefined, mentions: undefined, anchor: undefined });
    const comment = w.db.rows("documentComment")[0];
    const [toOwner] = queued(w, w.owner);
    expect(toOwner).toMatchObject({ template: "doc.comment", email: true, sourceKind: "doc_comment", sourceId: String(comment.id), contextId: docId });
    expect(paramsOf(toOwner)).toEqual({ actor: "Sam", doc: "Menu", preview: "Is the price right?", store: "Corner Bakery" });
    expect(noteTo(w, w.owner, "doc_comment")[0]).toMatchObject({ title: "New comment", body: "Menu: Is the price right?" });

    w.db.run(M.replyDocumentComment, w.owner, { documentId: docId, threadId, body: "Yes", mentions: undefined });
    const reply = queued(w, w.staff).find((d) => d.template === "doc.reply");
    expect(reply).toMatchObject({ sourceKind: "doc_comment", contextId: docId });
    expect(paramsOf(reply as Row)).toMatchObject({ actor: "Olive", preview: "Yes" });
  });
});
