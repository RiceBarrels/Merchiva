// Channel reducers (spacetimedb/src/chat/reducers.ts): the REAL reducer bodies,
// run over a small in-memory database like scripts/tests/presence/reducers.test.ts.
// A primary-key `find` returns the row or NULL (SDK 2.10), index `filter` an
// iterator; `insert` of an existing key and `update` of a missing row throw.

import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  defineChatReducers, deleteChatMessageCascade, rekeyChatIdentity,
  type ChatCtx, type ChatDeps, type ChatSchema,
} from "@/spacetimedb/src/chat/reducers";
import { notifyChatMessage } from "@/spacetimedb/src/chat/notify";
import { chatMemberStateId } from "@/spacetimedb/src/chat/logic";
import { notifyFollowId } from "@/spacetimedb/src/notify/logic";
import { frozenColumns } from "../drive/fake-db";

type Row = Readonly<Record<string, unknown>>;

class FakeIdentity {
  constructor(readonly hex: string = randomUUID().replace(/-/g, "")) {}
  toHexString(): string { return this.hex; }
  toString(): string { return this.hex; }
  isEqual(other: unknown): boolean { return other instanceof FakeIdentity && other.hex === this.hex; }
}
class FakeSenderError extends Error { override name = "SenderError"; }
const fakeId = (s: string = randomUUID()) => ({ toString: () => s });
const keyOf = (v: unknown): string => (v instanceof FakeIdentity ? v.hex : String(v));

class FakeTable {
  readonly rows = new Map<string, Row>();
  readonly [accessor: string]: unknown;
  /** `columns`: the only columns a row may carry (a frozen table, scripts/tests/fixtures/client-compat-tables.json). */
  constructor(pk: string, indexes: Record<string, string>, columns?: readonly string[]) {
    const rows = this.rows;
    const self = this as unknown as Record<string, unknown>;
    const check = (row: Row) => {
      const extra = columns ? Object.keys(row).filter((c) => !columns.includes(c)) : [];
      if (extra.length > 0) throw new Error(`no column ${extra.join(", ")} (frozen table)`);
    };
    self.insert = (row: Row) => {
      check(row);
      const key = keyOf(row[pk]);
      if (rows.has(key)) throw new Error(`insert: duplicate ${pk} ${key}`);
      rows.set(key, Object.freeze({ ...row }));
      return row;
    };
    self.delete = (row: Row) => rows.delete(keyOf(row[pk]));
    self.iter = () => rows.values();
    self[pk] = {
      find: (value: unknown) => rows.get(keyOf(value)) ?? null,
      update: (row: Row) => {
        check(row);
        const key = keyOf(row[pk]);
        if (!rows.has(key)) throw new Error(`update: no row ${key}`);
        rows.set(key, Object.freeze({ ...row }));
        return row;
      },
      delete: (value: unknown) => rows.delete(keyOf(value)),
    };
    for (const [accessor, column] of Object.entries(indexes)) {
      self[accessor] = { filter: (value: unknown) => [...rows.values()].filter((r) => keyOf(r[column]) === keyOf(value)).values() };
    }
  }
}

type Handler = (ctx: ChatCtx, args: Record<string, unknown>) => void;
const ORG = randomUUID();
let clock = 1_800_000_000_000_000n;

function world() {
  const db = {
    chatConversation: new FakeTable("id", { byOrganizationId: "organizationId" }),
    chatMember: new FakeTable("id", { byConversationId: "conversationId", byUserId: "userId" }),
    chatMembershipIndex: new FakeTable("chatMemberId", { byConversationId: "conversationId", byUserId: "userId" }),
    chatMessage: new FakeTable("id", { byConversationId: "conversationId" }),
    chatReaction: new FakeTable("id", { byConversationId: "conversationId", byMessageId: "messageId" }),
    chatMessageExt: new FakeTable("messageId", { byConversationId: "conversationId", byThreadParentId: "threadParentId" }),
    chatChannelInfo: new FakeTable("conversationId", {}),
    chatMemberState: new FakeTable("id", { byConversationId: "conversationId", byUserId: "userId" }),
    orgMember: new FakeTable("id", { byUserId: "userId", byOrganizationId: "organizationId" }),
    notification: new FakeTable("id", { byTargetId: "targetId" }, frozenColumns("notification")),
    // What deliver() reads and writes beside the notification row (spacetimedb/src/notify/).
    organization: new FakeTable("id", { byOrgIdText: "orgIdText" }),
    pushSubscription: new FakeTable("id", { byOrganizationId: "organizationId", byTargetId: "targetId" }),
    notificationDelivery: new FakeTable("notificationId", { byTargetId: "targetId", byScope: "scope", byRunId: "runId", byDueAt: "dueAtMicros" }),
    notificationPref: new FakeTable("userId", {}),
    chatFollow: new FakeTable("id", { byOrganizationId: "organizationId", byUserId: "userId", byTargetHex: "targetHex" }),
    chatPinNotice: new FakeTable("messageId", {}),
    chatNoticeUnread: new FakeTable("notificationId", { byReaderKey: "readerKey" }),
    notificationEmailState: new FakeTable("targetId", {}),
    storeSosState: new FakeTable("organizationId", {}),
    notificationQuota: new FakeTable("id", {}),
    notificationUrgent: new FakeTable("notificationId", {}),
    // A store tablet's PIN / QR operator (notifyChatMessage narrows @everyone by it).
    deviceOperatorSession: new FakeTable("identity", { byOrganizationId: "organizationId" }),
  };
  const ins = (t: FakeTable, r: Row) => (t.insert as (r: Row) => Row)(r);
  const deps = {
    t: new Proxy({}, { get: () => () => ({}) }),
    SenderError: FakeSenderError,
    Identity: FakeIdentity,
    findById: (tbl: { id: { find(k: unknown): unknown } }, id: string) => tbl.id.find(id) ?? undefined,
  } as unknown as ChatDeps;
  const R = defineChatReducers({ reducer: (_p: unknown, fn: Handler) => fn } as unknown as ChatSchema, deps) as unknown as Record<string, Handler>;
  return {
    db,
    R,
    person(name: string, role = "staff") {
      const identity = new FakeIdentity();
      ins(db.orgMember, { id: fakeId(), organizationId: ORG, userId: identity, role, displayName: name, status: "active" });
      return identity;
    },
    conversation(type: "group" | "direct", members: FakeIdentity[]) {
      const id = randomUUID();
      ins(db.chatConversation, { id: fakeId(id), organizationId: ORG, type, name: type === "group" ? "floor" : undefined });
      for (const m of members) {
        const cm = randomUUID();
        ins(db.chatMember, { id: fakeId(cm), conversationId: id, userId: m });
        ins(db.chatMembershipIndex, { chatMemberId: cm, conversationId: id, userId: m });
      }
      return id;
    },
    message(conversationId: string, sender: FakeIdentity, content = "hi") {
      const id = randomUUID();
      ins(db.chatMessage, { id: fakeId(id), conversationId, senderId: sender, content, createdAt: { micros: clock++ } });
      return id;
    },
    ctx(sender: FakeIdentity): ChatCtx {
      return {
        sender, timestamp: { microsSinceUnixEpoch: clock++ }, db, newUuidV4: () => fakeId(),
      } as unknown as ChatCtx;
    },
    /** A new message by `sender`, notified as sendMessage does (notifyChatMessage); returns its id. */
    send(sender: FakeIdentity, conversationId: string, content: string, opts: { attachmentUrl?: string } = {}) {
      const id = randomUUID();
      const row = ins(db.chatMessage, {
        id: fakeId(id), conversationId, senderId: sender, content, createdAt: { micros: clock++ }, attachmentUrl: opts.attachmentUrl,
      });
      const conv = db.chatConversation.rows.get(conversationId) as never;
      notifyChatMessage(this.ctx(sender), conv, row as never);
      return id;
    },
    /** `follower` specially follows `target` (a chat_follow row, as setChatFollow writes it). */
    follow(follower: FakeIdentity, target: FakeIdentity) {
      const id = notifyFollowId(ORG, follower.hex, target.hex);
      ins(db.chatFollow, { id, organizationId: ORG, userId: follower, targetHex: target.hex, createdAt: { microsSinceUnixEpoch: clock++ } });
    },
  };
}

const rowsOf = (t: FakeTable) => [...t.rows.values()];

describe("toggleChatReaction", () => {
  test("adds, then removes on the second toggle; members only", () => {
    const w = world();
    const ann = w.person("Ann");
    const out = w.person("Outsider");
    const conv = w.conversation("group", [ann]);
    const msg = w.message(conv, ann);
    w.R.toggleChatReaction(w.ctx(ann), { conversationId: conv, messageId: msg, emoji: "👍" });
    expect(rowsOf(w.db.chatReaction)).toHaveLength(1);
    w.R.toggleChatReaction(w.ctx(ann), { conversationId: conv, messageId: msg, emoji: "👍" });
    expect(rowsOf(w.db.chatReaction)).toHaveLength(0);
    expect(() => w.R.toggleChatReaction(w.ctx(out), { conversationId: conv, messageId: msg, emoji: "👍" })).toThrow("Not a conversation member");
    expect(() => w.R.toggleChatReaction(w.ctx(ann), { conversationId: conv, messageId: msg, emoji: "two words" })).toThrow("Invalid reaction");
  });
});

describe("editChatMessage", () => {
  test("only the sender edits, and the edit is marked", () => {
    const w = world();
    const ann = w.person("Ann");
    const bob = w.person("Bob");
    const conv = w.conversation("group", [ann, bob]);
    const msg = w.message(conv, ann, "helo");
    expect(() => w.R.editChatMessage(w.ctx(bob), { conversationId: conv, messageId: msg, content: "x" })).toThrow("Can only edit your own messages");
    w.R.editChatMessage(w.ctx(ann), { conversationId: conv, messageId: msg, content: "hello" });
    expect(w.db.chatMessage.rows.get(msg)?.content).toBe("hello");
    expect(w.db.chatMessageExt.rows.get(msg)?.editedAt).toBeDefined();
  });
});

describe("sendThreadReply", () => {
  test("replies land in the root's thread and notify its participants, not the whole channel", () => {
    const w = world();
    const ann = w.person("Ann");
    const bob = w.person("Bob");
    const cat = w.person("Cat");
    const conv = w.conversation("group", [ann, bob, cat]);
    const root = w.message(conv, ann, "stock count?");
    w.R.sendThreadReply(w.ctx(bob), { conversationId: conv, parentId: root, content: "on it" });
    const reply = rowsOf(w.db.chatMessageExt).find((e) => e.threadParentId === root)!;
    // Replying to a reply stays in the root's thread.
    w.R.sendThreadReply(w.ctx(ann), { conversationId: conv, parentId: String(reply.messageId), content: "thanks" });
    const ext = rowsOf(w.db.chatMessageExt);
    expect(ext.filter((e) => e.threadParentId === root)).toHaveLength(2);
    const targets = rowsOf(w.db.notification).map((n) => (n.targetId as FakeIdentity).hex);
    // Bob's reply notified Ann (the root's author); Ann's notified Bob. Cat never.
    expect(targets.sort()).toEqual([ann.hex, bob.hex].sort());
  });

  test("a named mention reaches a member outside the thread", () => {
    const w = world();
    const ann = w.person("Ann");
    const cat = w.person("Cat Lee");
    const conv = w.conversation("group", [ann, cat]);
    const root = w.message(conv, ann);
    w.R.sendThreadReply(w.ctx(ann), { conversationId: conv, parentId: root, content: "@Cat Lee can you check?" });
    expect(rowsOf(w.db.notification).map((n) => (n.targetId as FakeIdentity).hex)).toEqual([cat.hex]);
  });
});

describe("notifyChatMessage + mute", () => {
  test("a muted member gets nothing unless named; @everyone does not break a mute", () => {
    const w = world();
    const ann = w.person("Ann", "manager");
    const bob = w.person("Bob");
    const conv = w.conversation("group", [ann, bob]);
    w.R.setChatMuted(w.ctx(bob), { conversationId: conv, muted: true });
    w.send(ann, conv, "@everyone lunch");
    expect(rowsOf(w.db.notification)).toHaveLength(0);
    w.send(ann, conv, "@Bob lunch");
    expect(rowsOf(w.db.notification)).toHaveLength(1);
  });
});

describe("read state, star", () => {
  test("markChatRead and setChatStarred share one self row", () => {
    const w = world();
    const ann = w.person("Ann");
    const conv = w.conversation("direct", [ann, w.person("Bob")]);
    w.R.setChatStarred(w.ctx(ann), { conversationId: conv, starred: true });
    w.R.markChatRead(w.ctx(ann), { conversationId: conv });
    const state = w.db.chatMemberState.rows.get(chatMemberStateId(conv, ann.hex));
    expect(state?.starred).toBe(true);
    expect(state?.muted).toBe(false);
    expect(rowsOf(w.db.chatMemberState)).toHaveLength(1);
  });
});

describe("membership is managed by owners and managers", () => {
  test("staff cannot remove or set a topic; a manager can; anyone may leave a group", () => {
    const w = world();
    const boss = w.person("Boss", "manager");
    const ann = w.person("Ann");
    const bob = w.person("Bob");
    const conv = w.conversation("group", [boss, ann, bob]);
    expect(() => w.R.removeConversationMember(w.ctx(ann), { conversationId: conv, userId: bob.hex })).toThrow("Only an owner or manager");
    expect(() => w.R.setChannelTopic(w.ctx(ann), { conversationId: conv, topic: "x" })).toThrow("Only an owner or manager");
    w.R.setChannelTopic(w.ctx(boss), { conversationId: conv, topic: "Morning shift" });
    expect(w.db.chatChannelInfo.rows.get(conv)?.topic).toBe("Morning shift");
    w.R.removeConversationMember(w.ctx(boss), { conversationId: conv, userId: bob.hex });
    w.R.leaveConversation(w.ctx(ann), { conversationId: conv });
    const left = rowsOf(w.db.chatMember).map((m) => (m.userId as FakeIdentity).hex);
    expect(left).toEqual([boss.hex]);
    expect(rowsOf(w.db.chatMembershipIndex)).toHaveLength(1);
  });

  test("nobody leaves a direct message", () => {
    const w = world();
    const ann = w.person("Ann");
    const conv = w.conversation("direct", [ann, w.person("Bob")]);
    expect(() => w.R.leaveConversation(w.ctx(ann), { conversationId: conv })).toThrow("cannot leave a direct message");
  });
});

describe("deleteChatMessageCascade", () => {
  test("a parent with replies becomes a tombstone; the last reply deleted takes it along", () => {
    const w = world();
    const ann = w.person("Ann");
    const conv = w.conversation("group", [ann]);
    const root = w.message(conv, ann, "secret");
    w.R.toggleChatReaction(w.ctx(ann), { conversationId: conv, messageId: root, emoji: "👍" });
    w.R.sendThreadReply(w.ctx(ann), { conversationId: conv, parentId: root, content: "reply" });
    deleteChatMessageCascade(w.ctx(ann), w.db.chatMessage.rows.get(root) as never);
    expect(w.db.chatMessage.rows.get(root)?.content).toBe("");
    expect(w.db.chatMessageExt.rows.get(root)?.deletedAt).toBeDefined();
    expect(rowsOf(w.db.chatReaction)).toHaveLength(0);
    const replyId = String(rowsOf(w.db.chatMessageExt).find((e) => e.threadParentId === root)!.messageId);
    deleteChatMessageCascade(w.ctx(ann), w.db.chatMessage.rows.get(replyId) as never);
    expect(w.db.chatMessage.rows.size).toBe(0);
    expect(w.db.chatMessageExt.rows.size).toBe(0);
  });
});

// ── Channel notifications (spacetimedb/src/chat/notify.ts → notify/deliver.ts) ──

const deliveries = (w: ReturnType<typeof world>) => rowsOf(w.db.notificationDelivery);
const deliveryTo = (w: ReturnType<typeof world>, who: FakeIdentity) =>
  deliveries(w).filter((d) => (d.targetId as FakeIdentity).hex === who.hex);
const notified = (w: ReturnType<typeof world>) => rowsOf(w.db.notification).map((n) => (n.targetId as FakeIdentity).hex).sort();

describe("channel notifications", () => {
  test("a plain message with no preference or push rows anywhere: an in-app row per member, nothing queued", () => {
    const w = world();
    const ann = w.person("Ann");
    const bob = w.person("Bob");
    const conv = w.conversation("group", [ann, bob]);
    w.send(ann, conv, "hello");
    expect(rowsOf(w.db.notification)).toEqual([
      expect.objectContaining({ organizationId: ORG, targetId: bob, type: "team", title: "Ann", body: "hello", link: `/manager/channel?c=${conv}`, read: false }),
    ]);
    expect(deliveries(w)).toHaveLength(0);
    expect(rowsOf(w.db.notificationPref)).toHaveLength(0);
  });

  test("a push subscription queues push only; the row names the message, the conversation and the channel", () => {
    const w = world();
    const ann = w.person("Ann");
    const bob = w.person("Bob");
    const conv = w.conversation("group", [ann, bob]);
    (w.db.pushSubscription.insert as (r: Row) => Row)({
      id: fakeId(), organizationId: ORG, targetId: bob, endpoint: "https://fcm.googleapis.com/fcm/send/x", p256dh: "k", auth: "a",
    });
    const msg = w.send(ann, conv, "x".repeat(200));
    const [d] = deliveryTo(w, bob);
    expect(d).toMatchObject({
      template: "chat.message", email: false, push: true, sourceKind: "chat_message", sourceId: msg, contextId: conv,
      link: `/manager/channel?c=${conv}`,
    });
    expect(JSON.parse(String(d.params))).toEqual({ actor: "Ann", preview: "x".repeat(137) + "...", conversation: "floor", store: "" });
  });

  test("email: @Name, a manager's @everyone and a followed sender; never a staff member's @everyone", () => {
    const w = world();
    const boss = w.person("Boss", "manager");
    const ann = w.person("Ann");
    const bob = w.person("Bob");
    const cat = w.person("Cat");
    const conv = w.conversation("group", [boss, ann, bob, cat]);

    w.send(ann, conv, "@everyone lunch?");
    expect(notified(w)).toEqual([boss.hex, bob.hex, cat.hex].sort());
    expect(deliveries(w)).toHaveLength(0);

    w.send(boss, conv, "@everyone stock count at 5");
    expect(deliveries(w).map((d) => [(d.targetId as FakeIdentity).hex, d.template, d.email]).sort())
      .toEqual([[ann.hex, "chat.mention", true], [bob.hex, "chat.mention", true], [cat.hex, "chat.mention", true]].sort());

    const w2 = world();
    const a2 = w2.person("Ann");
    const b2 = w2.person("Bob");
    const c2 = w2.person("Cat");
    const conv2 = w2.conversation("direct", [a2, b2, c2]);
    w2.follow(c2, a2);
    w2.send(a2, conv2, "@Bob can you open?");
    expect(deliveryTo(w2, b2)).toEqual([expect.objectContaining({ template: "chat.mention", email: true })]);
    expect(deliveryTo(w2, c2)).toEqual([expect.objectContaining({ template: "chat.follow", email: true })]);
    // A direct message has no channel name.
    expect(JSON.parse(String(deliveryTo(w2, b2)[0].params)).conversation).toBe("");
  });

  test("a mute holds back a manager's @everyone, but not @Name or a followed sender", () => {
    const w = world();
    const boss = w.person("Boss", "manager");
    const bob = w.person("Bob");
    const cat = w.person("Cat");
    const conv = w.conversation("group", [boss, bob, cat]);
    w.R.setChatMuted(w.ctx(bob), { conversationId: conv, muted: true });
    w.R.setChatMuted(w.ctx(cat), { conversationId: conv, muted: true });
    w.follow(cat, boss);
    w.send(boss, conv, "@everyone meeting");
    expect(notified(w)).toEqual([cat.hex]);
    expect(deliveryTo(w, cat)).toEqual([expect.objectContaining({ template: "chat.follow", email: true })]);
    w.send(boss, conv, "@Bob please call");
    expect(deliveryTo(w, bob)).toEqual([expect.objectContaining({ template: "chat.mention", email: true })]);
  });

  test("members who left the store and the sender are never told", () => {
    const w = world();
    const ann = w.person("Ann");
    const gone = w.person("Gone");
    const conv = w.conversation("group", [ann, gone]);
    for (const m of rowsOf(w.db.orgMember)) {
      if ((m.userId as FakeIdentity).hex === gone.hex) (w.db.orgMember.id as { update(r: Row): void }).update({ ...m, status: "left" });
    }
    w.send(ann, conv, "@Gone hi");
    expect(rowsOf(w.db.notification)).toHaveLength(0);
  });

  test("a thread reply reaches the thread, @Name and the sender's followers; not the rest of the channel", () => {
    const w = world();
    const ann = w.person("Ann");
    const bob = w.person("Bob");
    const cat = w.person("Cat");
    const dan = w.person("Dan");
    const conv = w.conversation("group", [ann, bob, cat, dan]);
    const root = w.message(conv, ann, "stock count?");
    w.follow(cat, bob);
    w.R.sendThreadReply(w.ctx(bob), { conversationId: conv, parentId: root, content: "on it" });
    expect(notified(w)).toEqual([ann.hex, cat.hex].sort());
    expect(deliveryTo(w, cat)).toEqual([expect.objectContaining({ template: "chat.follow", email: true, sourceKind: "chat_message" })]);
    expect(deliveryTo(w, ann)).toHaveLength(0);
    expect(notified(w)).not.toContain(dan.hex);
  });

  test("the first pin of a message tells the conversation by email, once ever; never the pinner or a muter", () => {
    const w = world();
    const ann = w.person("Ann");
    const bob = w.person("Bob");
    const cat = w.person("Cat");
    const conv = w.conversation("group", [ann, bob, cat]);
    w.R.setChatMuted(w.ctx(cat), { conversationId: conv, muted: true });
    const msg = w.message(conv, bob, "Closing at 6 today");
    const pin = (who: FakeIdentity, pinned: boolean) => w.R.setChatMessagePinned(w.ctx(who), { conversationId: conv, messageId: msg, pinned });
    pin(ann, true);
    expect(rowsOf(w.db.notification)).toEqual([
      expect.objectContaining({ targetId: bob, type: "team", title: "Ann pinned a message", body: "Closing at 6 today", link: `/manager/channel?c=${conv}` }),
    ]);
    expect(deliveryTo(w, bob)).toEqual([
      expect.objectContaining({ template: "chat.pin", email: true, sourceKind: "chat_pin", sourceId: msg, contextId: conv }),
    ]);
    expect(w.db.chatPinNotice.rows.has(msg)).toBe(true);
    pin(ann, false);
    pin(bob, true);
    pin(bob, true);
    expect(rowsOf(w.db.notification)).toHaveLength(1);
  });

  test("markChatRead reads the conversation's notifications and drops their delivery rows, and no other conversation's", () => {
    const w = world();
    const ann = w.person("Ann");
    const bob = w.person("Bob");
    const one = w.conversation("group", [ann, bob]);
    const two = w.conversation("group", [ann, bob]);
    w.send(ann, one, "@Bob first");
    w.send(ann, two, "@Bob second");
    expect(deliveryTo(w, bob)).toHaveLength(2);
    w.R.markChatRead(w.ctx(bob), { conversationId: one });
    const byLink = (c: string) => rowsOf(w.db.notification).find((n) => n.link === `/manager/channel?c=${c}`);
    expect(byLink(one)?.read).toBe(true);
    expect(byLink(two)?.read).toBe(false);
    expect(deliveryTo(w, bob).map((d) => d.contextId)).toEqual([two]);
  });

  test("removed from or leaving a channel: that member's notifications of it are read and owe nothing; other channels keep theirs", () => {
    const w = world();
    const boss = w.person("Boss", "manager");
    const ann = w.person("Ann");
    const bob = w.person("Bob");
    const ops = w.conversation("group", [boss, ann, bob]);
    const floor = w.conversation("group", [boss, ann, bob]);
    w.send(boss, ops, "@Ann @Bob count the flour");
    w.send(boss, floor, "@Bob open at 7");
    const unread = (who: FakeIdentity, c: string) => rowsOf(w.db.notification)
      .filter((n) => (n.targetId as FakeIdentity).hex === who.hex && n.link === `/manager/channel?c=${c}` && n.read === false);
    const indexed = (who: FakeIdentity, c: string) => rowsOf(w.db.chatNoticeUnread).filter((r) => r.readerKey === `${c}:${who.hex}`);
    expect(unread(bob, ops)).toHaveLength(1);
    expect(indexed(bob, ops)).toHaveLength(1);

    w.R.removeConversationMember(w.ctx(boss), { conversationId: ops, userId: bob.hex });
    expect(unread(bob, ops)).toHaveLength(0);
    expect(indexed(bob, ops)).toHaveLength(0);
    expect(deliveryTo(w, bob).map((d) => d.contextId)).toEqual([floor]);
    expect(unread(bob, floor)).toHaveLength(1);
    // The remover's own notifications are not touched.
    expect(rowsOf(w.db.chatNoticeUnread).some((r) => r.readerKey === `backfill:${boss.hex}`)).toBe(false);

    w.R.leaveConversation(w.ctx(ann), { conversationId: ops });
    expect(unread(ann, ops)).toHaveLength(0);
    expect(indexed(ann, ops)).toHaveLength(0);
    expect(deliveryTo(w, ann)).toHaveLength(0);
  });

  test("@everyone from a tablet account while a fresh staff PIN session is open stays in the app; the account's own session or a stale one does not hold it back", () => {
    const w = world();
    const boss = w.person("Boss", "owner");
    const ann = w.person("Ann");
    const bob = w.person("Bob");
    const conv = w.conversation("group", [boss, ann, bob]);
    const memberIdOf = (who: FakeIdentity) => String(rowsOf(w.db.orgMember).find((m) => (m.userId as FakeIdentity).hex === who.hex)?.id);
    const operate = (who: FakeIdentity, role: string, ageMicros = 0n) => {
      w.db.deviceOperatorSession.rows.clear();
      (w.db.deviceOperatorSession.insert as (r: Row) => Row)({
        identity: boss, organizationId: ORG, memberId: memberIdOf(who), memberName: "x", role,
        resolvedAt: { microsSinceUnixEpoch: clock - ageMicros },
      });
    };
    const emailed = () => deliveries(w).filter((d) => d.email === true).length;

    operate(ann, "staff");
    w.send(boss, conv, "@everyone no shifts tomorrow");
    expect(notified(w)).toEqual([ann.hex, bob.hex].sort());
    expect(emailed()).toBe(0);

    operate(boss, "owner");
    w.send(boss, conv, "@everyone stock count at 5");
    expect(emailed()).toBe(2);

    operate(ann, "staff", 13n * 3_600_000_000n);
    w.send(boss, conv, "@everyone meeting at 3");
    expect(emailed()).toBe(4);

    // A named colleague is still emailed while the staff session is open.
    operate(ann, "staff");
    w.send(boss, conv, "@Bob call me");
    expect(deliveryTo(w, bob).filter((d) => d.email === true)).toHaveLength(3);
  });
});

describe("rekeyChatIdentity + follows", () => {
  test("follows move with the identity on both sides; a follow of oneself is dropped", () => {
    const w = world();
    const ann = w.person("Ann");
    const bob = w.person("Bob");
    const cat = w.person("Cat");
    w.follow(ann, bob);
    w.follow(cat, ann);
    w.follow(bob, cat);
    const next = new FakeIdentity();
    rekeyChatIdentity(w.ctx(ann), ann, next);
    const ids = rowsOf(w.db.chatFollow).map((f) => f.id).sort();
    expect(ids).toEqual([notifyFollowId(ORG, next.hex, bob.hex), notifyFollowId(ORG, cat.hex, next.hex), notifyFollowId(ORG, bob.hex, cat.hex)].sort());
    expect((w.db.chatFollow.rows.get(notifyFollowId(ORG, next.hex, bob.hex))?.userId as FakeIdentity).hex).toBe(next.hex);
    expect(w.db.chatFollow.rows.get(notifyFollowId(ORG, cat.hex, next.hex))?.targetHex).toBe(next.hex);

    // Rekeying onto someone already followed by / following that identity keeps one row and no self-follow.
    rekeyChatIdentity(w.ctx(bob), bob, cat);
    expect(rowsOf(w.db.chatFollow).some((f) => (f.userId as FakeIdentity).hex === f.targetHex)).toBe(false);
  });
});
