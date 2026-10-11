// A store tablet's chat for its PIN / QR operator (spacetimedb/src/index.ts sendOperatorMessage,
// deleteOperatorMessage): the message is the operator's, marked as sent from the store
// (chat_message_origin), notified as theirs — and only for an account allowed to run a store
// device, holding a fresh grant of its own log-in. The thread / reaction / edit / pin variants
// are in ../chat/reducers.test.ts.

import { describe, expect, test } from "bun:test";
import { FakeTimestamp, FakeUuid, loadModule } from "../drive/fake-db";
import { NOTIFY_TABLES, world, type FakeIdentity, type FakeMember, type World } from "../notify/world";

/** The SDK Uuid as uuidFromString builds it (`new Uuid(bigint)`): printed like the fake rows' ids, so findById finds them. */
class StubUuid {
  constructor(private readonly value: bigint) {}
  toString(): string {
    const h = this.value.toString(16).padStart(32, "0");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}

const M = loadModule(["sendMessage", "sendOperatorMessage", "deleteOperatorMessage"], { Uuid: StubUuid });

const TABLES = [
  ...NOTIFY_TABLES,
  { accessor: "chatMemberState", primaryKey: "id", indexes: { byConversationId: "conversationId", byUserId: "userId" } },
  { accessor: "chatReaction", primaryKey: "id", indexes: { byConversationId: "conversationId", byMessageId: "messageId" } },
  { accessor: "chatMessageOrigin", primaryKey: "messageId", indexes: { byConversationId: "conversationId" } },
  { accessor: "deviceOperatorGrant", primaryKey: "key", indexes: { byOrganizationId: "organizationId" } },
];
const STORE_DEVICE = JSON.stringify({ store_device: { view: true } });
const HOUR = 3_600_000_000n;

interface StoreWorld extends World {
  tablet: FakeMember;
  plain: FakeMember;
  conv: string;
}

function setup(): StoreWorld {
  const w = world(TABLES);
  const tablet = w.db.addMember({ organizationId: w.org, role: "staff", displayName: "Front tablet", permissions: STORE_DEVICE });
  const plain = w.db.addMember({ organizationId: w.org, role: "staff", displayName: "Pat" });
  const id = new FakeUuid();
  const now = new FakeTimestamp(w.db.nowMicros);
  w.db.insert("chatConversation", { id, organizationId: w.org, type: "group", name: "Floor", createdBy: undefined, createdAt: now, updatedAt: now, merchivaEnabled: undefined });
  for (const m of [w.manager, w.staff, tablet, plain]) {
    w.db.insert("chatMember", { id: new FakeUuid(), conversationId: id.toString(), userId: m.identity, joinedAt: now });
  }
  return { ...w, tablet, plain, conv: id.toString() };
}

/** `tablet`'s log-in `grantId` made `operator` its operator, `ageMicros` ago (device_operator_grant). */
function grant(w: StoreWorld, tablet: FakeMember, grantId: string, operator: FakeMember, ageMicros = 0n): void {
  w.db.insert("deviceOperatorGrant", {
    key: `${tablet.identity.hex}:${grantId}`, organizationId: w.org, memberId: operator.memberId,
    resolvedAt: new FakeTimestamp(w.db.nowMicros - ageMicros),
  });
}

const sendArgs = (w: StoreWorld, content: string) => ({
  conversationId: w.conv, content, replyToId: undefined, attachmentUrl: undefined, attachmentType: undefined,
  attachmentName: undefined, voiceTranscript: undefined,
});

function attempt(w: StoreWorld, fn: unknown, who: FakeMember, args: Record<string, unknown>): string | null {
  try {
    w.db.run(fn, who, args);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const messageNamed = (w: StoreWorld, content: string) => w.db.rows("chatMessage").find((m) => m.content === content);
const hexOf = (v: unknown) => (v as FakeIdentity).hex;

describe("sendOperatorMessage", () => {
  test("the message is the operator's, marked as from the store, and told as theirs", () => {
    const w = setup();
    grant(w, w.tablet, "g1", w.staff);
    w.db.run(M.sendOperatorMessage, w.tablet, { grantId: "g1", ...sendArgs(w, "Out of oat milk") });
    const msg = messageNamed(w, "Out of oat milk")!;
    expect(hexOf(msg.senderId)).toBe(w.staff.identity.hex);
    expect(w.db.find("chatMessageOrigin", String(msg.id))).toMatchObject({ conversationId: w.conv, origin: "store" });
    const told = w.db.rows("notification").map((n) => hexOf(n.targetId));
    expect(told).toContain(w.manager.identity.hex);
    expect(told).toContain(w.tablet.identity.hex);
    expect(told).not.toContain(w.staff.identity.hex);
    expect(w.db.rows("notification").find((n) => hexOf(n.targetId) === w.manager.identity.hex)?.title).toBe("Sam");
  });

  test("a message from the account's own device has no store mark", () => {
    const w = setup();
    w.db.run(M.sendMessage, w.staff, sendArgs(w, "From my phone"));
    const msg = messageNamed(w, "From my phone")!;
    expect(w.db.find("chatMessageOrigin", String(msg.id))).toBeNull();
  });

  test("only an account allowed to run a store device, with a fresh grant of its own, speaks for an operator", () => {
    const w = setup();
    grant(w, w.plain, "g1", w.staff);
    expect(attempt(w, M.sendOperatorMessage, w.plain, { grantId: "g1", ...sendArgs(w, "a") })).toContain("[store_device]");
    // Another tablet's grant id names nothing for this one.
    grant(w, w.manager, "g2", w.staff);
    expect(attempt(w, M.sendOperatorMessage, w.tablet, { grantId: "g2", ...sendArgs(w, "b") })).toBe("NO_OPERATOR_SESSION");
    grant(w, w.tablet, "old", w.staff, 13n * HOUR);
    expect(attempt(w, M.sendOperatorMessage, w.tablet, { grantId: "old", ...sendArgs(w, "c") })).toBe("NO_OPERATOR_SESSION");
    expect(w.db.rows("chatMessage")).toHaveLength(0);
  });

  test("the operator must be in the conversation; the tablet's own membership does not stand in", () => {
    const w = setup();
    const outsider = w.db.addMember({ organizationId: w.org, role: "staff", displayName: "Ola" });
    grant(w, w.tablet, "g1", outsider);
    expect(attempt(w, M.sendOperatorMessage, w.tablet, { grantId: "g1", ...sendArgs(w, "hi") })).toContain("Not a conversation member");
  });
});

describe("deleteOperatorMessage", () => {
  test("deletes the operator's own message with its store mark, never someone else's", () => {
    const w = setup();
    grant(w, w.tablet, "g1", w.staff);
    w.db.run(M.sendOperatorMessage, w.tablet, { grantId: "g1", ...sendArgs(w, "typo") });
    w.db.run(M.sendMessage, w.manager, sendArgs(w, "boss"));
    const mine = messageNamed(w, "typo")!;
    const boss = messageNamed(w, "boss")!;
    expect(attempt(w, M.deleteOperatorMessage, w.tablet, { grantId: "g1", conversationId: w.conv, messageId: String(boss.id) }))
      .toContain("Can only delete your own messages");
    w.db.run(M.deleteOperatorMessage, w.tablet, { grantId: "g1", conversationId: w.conv, messageId: String(mine.id) });
    expect(messageNamed(w, "typo")).toBeUndefined();
    expect(w.db.rows("chatMessageOrigin")).toHaveLength(0);
  });
});
