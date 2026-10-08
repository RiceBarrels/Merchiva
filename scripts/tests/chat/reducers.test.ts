// Channel reducers (spacetimedb/src/chat/reducers.ts): the REAL reducer bodies,
// run over a small in-memory database like scripts/tests/presence/reducers.test.ts.
// A primary-key `find` returns the row or NULL (SDK 2.10), index `filter` an
// iterator; `insert` of an existing key and `update` of a missing row throw.

import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  defineChatReducers, deleteChatMessageCascade, notifyChatMessage,
  type ChatCtx, type ChatDeps, type ChatSchema,
} from "@/spacetimedb/src/chat/reducers";
import { chatMemberStateId } from "@/spacetimedb/src/chat/logic";

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
  constructor(pk: string, indexes: Record<string, string>) {
    const rows = this.rows;
    const self = this as unknown as Record<string, unknown>;
    self.insert = (row: Row) => {
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
        const key = keyOf(row[pk]);
        if (!rows.has(key)) throw new Error(`update: no row ${key}`);
        rows.set(key, Object.freeze({ ...row }));
        return row;
      },
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
    notification: new FakeTable("id", { byTargetId: "targetId" }),
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
    const ann = w.person("Ann");
    const bob = w.person("Bob");
    const conv = w.conversation("group", [ann, bob]);
    w.R.setChatMuted(w.ctx(bob), { conversationId: conv, muted: true });
    const c = w.db.chatConversation.rows.get(conv) as never;
    notifyChatMessage(w.ctx(ann), c, conv, "@everyone lunch", false);
    expect(rowsOf(w.db.notification)).toHaveLength(0);
    notifyChatMessage(w.ctx(ann), c, conv, "@Bob lunch", false);
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
